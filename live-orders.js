"use strict";
// Live orders: online QR menu -> offline POS.
//
// Flow: customer order -> row in live_orders_inbox (Supabase Postgres, via live-orders-db.js) -> pushed over a
// persistent Socket.IO connection (namespace /pos) to the restaurant's offline
// install -> install saves it, then ACKs -> only then the row is deleted.
// Presence = at least one authenticated /pos connection for the restaurant.

const crypto = require("crypto");
const { pgBackend } = require("./live-orders-db");

const ACK_TIMEOUT_MS = 20000;
const RETRY_EVERY_MS = 30000;
const KEY_PREFIX = "imk_";
const MAX_ITEMS = 60;
const MAX_QTY = 99;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 12;

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const safeEqualHex = (a, b) => {
  try {
    const x = Buffer.from(String(a), "hex");
    const y = Buffer.from(String(b), "hex");
    return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
  } catch (_) {
    return false;
  }
};
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const cleanText = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

// ---- pricing (mirrors public/menu.html offer logic; the server is the source of truth) ----
const tsOf = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
};
function offerActive(o, now) {
  if (!o || o.enabled === false) return false;
  const s = tsOf(o.startsAt), e = tsOf(o.endsAt);
  if (s !== null && now < s) return false;
  if (e !== null && now > e) return false;
  return true;
}
function offerApplies(o, p) {
  if (o.scope === "categories") return (o.categories || []).indexOf(p.category) > -1;
  if (o.scope === "products") return (o.productIds || []).indexOf(p._id) > -1;
  return true;
}
function unitPriceFor(product, sizeName, offers, now) {
  const offs = (Array.isArray(offers) ? offers : []).filter(
    (o) => offerActive(o, now) && o.applyPrices !== false && Number(o.discountPercent) > 0,
  );
  let pct = 0;
  offs.forEach((o) => {
    if (offerApplies(o, product)) pct = Math.max(pct, Math.min(100, Number(o.discountPercent)));
  });
  const cut = (v) => (pct ? round2(Number(v) * (1 - pct / 100)) : Number(v));
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  if (sizes.length > 0) {
    const size = sizes.find((s) => s && s.name === sizeName);
    if (!size) return null;
    return { price: cut(size.price), label: `${product.name && product.name.ar} (${size.name})` };
  }
  return { price: cut(product.price), label: product.name && product.name.ar };
}
function orderOfferPercent(announcements, subTotal, now) {
  let best = null;
  (Array.isArray(announcements) ? announcements : []).forEach((a) => {
    if (!a || a.enabled === false) return;
    const s = tsOf(a.startsAt), e = tsOf(a.endsAt);
    if ((s !== null && now < s) || (e !== null && now > e)) return;
    const minAmount = Number(a.minAmount) || 0;
    const orderPercent = Number(a.orderPercent) || 0;
    if (orderPercent > 0 && (!best || minAmount > best.minAmount)) best = { minAmount, orderPercent };
  });
  if (!best || Number(subTotal) < best.minAmount) return 0;
  return best.orderPercent;
}

// ---- order types + delivery zones (owned by the POS, pushed here; stored in customUI.deliveryConfig) ----
const MAX_ZONES = 300;
function normalizeDeliveryConfig(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const t = r.types && typeof r.types === "object" ? r.types : {};
  const types = {
    dine_in: t.dine_in === undefined ? true : t.dine_in === true,
    takeaway: t.takeaway === undefined ? true : t.takeaway === true,
    delivery: t.delivery === true,
  };
  const zones = [];
  const seen = new Set();
  for (const z of Array.isArray(r.zones) ? r.zones.slice(0, MAX_ZONES) : []) {
    if (!z || typeof z !== "object") continue;
    const id = cleanText(z.id, 40);
    const name = cleanText(z.name, 60);
    const price = round2(z.price);
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(id) || seen.has(id) || !name || !Number.isFinite(price) || price < 0 || price > 100000) continue;
    seen.add(id);
    zones.push({ id, name, price });
  }
  return { types, zones };
}
const deliveryConfigOf = (restaurant) => normalizeDeliveryConfig(restaurant && restaurant.customUI && restaurant.customUI.deliveryConfig);
// What the public menu may offer right now. Delivery needs the POS online, the switch on and at least one zone.
function orderOptions(restaurant, posOnline) {
  const c = deliveryConfigOf(restaurant);
  const delivery = c.types.delivery && posOnline && c.zones.length > 0;
  return { types: { dine_in: c.types.dine_in, takeaway: c.types.takeaway, delivery }, zones: delivery ? c.zones : [] };
}

function buildOrder({ restaurant, products, body, now = Date.now(), posOnline = true }) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) return { error: "السلة فاضية", code: "EMPTY" };
  if (rawItems.length > MAX_ITEMS) return { error: "عدد الأصناف كبير", code: "TOO_MANY" };
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const items = [];
  let subTotal = 0;
  for (const it of rawItems) {
    const product = byId.get(String(it && it.productId));
    if (!product) return { error: "في صنف مش موجود في المنيو", code: "UNKNOWN_PRODUCT" };
    if (product.isAvailable === false) return { error: "في صنف مش متاح دلوقتي", code: "UNAVAILABLE", productId: product._id };
    const qty = Math.floor(Number(it.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) return { error: "الكمية غير صحيحة", code: "BAD_QTY" };
    const unit = unitPriceFor(product, it.sizeName || null, restaurant.offers, now);
    if (!unit || !Number.isFinite(unit.price)) return { error: "الحجم غير موجود", code: "BAD_SIZE" };
    const line = { name: unit.label, qty, price: unit.price };
    const note = cleanText(it.note, 150);
    if (note) line.note = note;
    items.push(line);
    subTotal += unit.price * qty;
  }
  subTotal = round2(subTotal);
  const opts = orderOptions(restaurant, posOnline);
  const wanted = body.orderType === "takeaway" ? "takeaway" : body.orderType === "delivery" ? "delivery" : "dine_in";
  if (!opts.types[wanted]) {
    return wanted === "delivery"
      ? { error: "التوصيل مش متاح دلوقتي", code: "TYPE_DISABLED" }
      : { error: "النوع ده مش متاح دلوقتي", code: "TYPE_DISABLED" };
  }
  const takeaway = wanted === "takeaway";
  const delivery = wanted === "delivery";
  let zone = null, customerName = "", customerPhone = "", customerAddress = "";
  if (delivery) {
    zone = opts.zones.find((z) => z.id === cleanText(body.zoneId, 40));
    if (!zone) return { error: "اختار منطقة التوصيل", code: "ZONE_REQUIRED" };
    customerName = cleanText(body.customerName, 80);
    customerPhone = cleanText(body.customerPhone, 30);
    customerAddress = cleanText(body.customerAddress, 300);
    if (!customerName) return { error: "اكتب اسمك", code: "NAME_REQUIRED" };
    if (customerPhone.replace(/\D/g, "").length < 7) return { error: "اكتب رقم موبايل صحيح", code: "PHONE_REQUIRED" };
    if (!customerAddress) return { error: "اكتب العنوان", code: "ADDRESS_REQUIRED" };
  }
  const tableNumber = takeaway ? "تيك أواي" : delivery ? "" : cleanText(body.tableNumber, 20);
  if (!takeaway && !delivery && restaurant.useTableNumbers === true && !tableNumber) {
    return { error: "اكتب رقم الطاولة", code: "TABLE_REQUIRED" };
  }
  const pct = orderOfferPercent(
    restaurant.customUI && restaurant.customUI.orderAnnouncements,
    subTotal,
    now,
  );
  const discountAmount = pct ? round2((subTotal * pct) / 100) : 0;
  const taxAmount = round2((subTotal * (Number(restaurant.taxRate) || 0)) / 100);
  const serviceAmount = takeaway || delivery ? 0 : round2((subTotal * (Number(restaurant.serviceRate) || 0)) / 100);
  const totalPrice = Math.max(0, round2(subTotal + taxAmount + serviceAmount - discountAmount));
  return {
    order: {
      tableNumber,
      orderType: wanted,
      ...(delivery ? { customerName, customerPhone, customerAddress, zoneId: zone.id, zoneName: zone.name, deliveryFee: zone.price } : {}),
      items,
      subTotal,
      taxAmount,
      serviceAmount,
      discountAmount,
      totalPrice,
      orderNote: cleanText(body.orderNote, 300),
    },
  };
}

function generateKey() {
  return KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
}

function createLiveOrders({ app, io, pool, db: dbIn, store, protect, restrictTo, log = console, onPosConnect }) {
  const db = dbIn || pgBackend(pool);
  const connections = new Map(); // restaurantId -> Set(socket)
  const locks = new Map(); // restaurantId -> Promise chain
  const rate = new Map(); // ip -> [timestamps]
  let schemaReady = false;
  let schemaPromise = null;
  let schemaReason = null; // short non-secret code for the last schema failure (shown to the signed-in owner only)
  function classifySchemaError(e) {
    const msg = String((e && e.message) || "");
    if (/DATABASE_URL is not set/i.test(msg)) return "no_database_url";
    const code = e && e.code ? String(e.code) : "";
    if (e && e.rest) {
      // Supabase REST backend: tables missing (run sql/live-orders.sql), bad key, or network.
      if (code === "PGRST205" || code === "42P01" || /schema cache|does not exist/i.test(msg)) return "tables_missing";
      if (/invalid api key|jwt/i.test(msg) || code === "HTTP_401" || code === "HTTP_403" || code === "PGRST301") return "rest_auth";
      if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(msg)) return "rest_unreachable";
      return "rest_" + (code || "error");
    }
    if (/^(ENOTFOUND|ENETUNREACH|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN)$/.test(code)) return code;
    if (/^[0-9A-Z]{5}$/.test(code)) return "pg_" + code; // e.g. 28P01 wrong password, 42501 permission, 3D000 no such database
    if (/tenant or user not found/i.test(msg)) return "pooler_tenant_not_found";
    if (/SSL|certificate/i.test(msg)) return "ssl_error";
    if (/timeout/i.test(msg)) return "timeout";
    return "other";
  }

  async function ensureSchema() {
    if (schemaReady) return true;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
      try {
        await db.ensure();
        schemaReady = true;
        schemaReason = null;
        return true;
      } catch (e) {
        schemaReason = classifySchemaError(e);
        log.error("❌ live orders: schema setup failed:", e.message);
        return false;
      } finally {
        schemaPromise = null;
      }
    })();
    return schemaPromise;
  }

  const onlineCount = (rid) => (connections.get(String(rid)) || new Set()).size;
  const ownerOk = (r) => {
    if (r.isActive === false) return false;
    const o = Array.isArray(r.owner) ? r.owner[0] : r.owner;
    if (o && typeof o === "object") {
      if (o.active === false) return false;
      if (o.subscriptionExpires && Date.now() > new Date(o.subscriptionExpires).getTime()) return false;
    }
    return true;
  };
  const isEnabled = (r) =>
    !!(r && ownerOk(r) && r.customUI && r.customUI.liveOrders && r.customUI.liveOrders.enabled === true);

  // ---------- delivery ----------
  function withLock(rid, fn) {
    const prev = locks.get(rid) || Promise.resolve();
    const next = prev.then(fn, fn).catch((e) => log.error("live orders deliver error:", e.message));
    locks.set(rid, next);
    next.finally(() => {
      if (locks.get(rid) === next) locks.delete(rid);
    });
    return next;
  }

  function emitWithAck(socket, payload) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.off("disconnect", onDrop);
        resolve(r);
      };
      const onDrop = () => finish({ ok: false, reason: "disconnected" });
      const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), ACK_TIMEOUT_MS);
      socket.once("disconnect", onDrop);
      try {
        socket.emit("order", payload, (resp) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          socket.off("disconnect", onDrop);
          resolve(resp && resp.ok === true ? { ok: true } : { ok: false, reason: "rejected" });
        });
      } catch (e) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve({ ok: false, reason: "emit-failed" });
        }
      }
    });
  }

  // Deliver the restaurant's inbox in order. A row is deleted only after the install ACKs it.
  function deliver(rid) {
    rid = String(rid);
    return withLock(rid, async () => {
      if (!(await ensureSchema())) return;
      for (;;) {
        const sockets = connections.get(rid);
        if (!sockets || sockets.size === 0) return;
        const row = await db.oldest(rid);
        if (!row) return;
        const socket = Array.from(sockets)[0];
        await db.bumpAttempts(row);
        const res = await emitWithAck(socket, { ...row.payload, id: row.id, createdAt: row.created_at });
        if (!res.ok) return; // stays in the inbox; retried on next kick / reconnect / timer
        await db.remove(row.id);
      }
    });
  }

  setInterval(() => {
    for (const rid of connections.keys()) deliver(rid);
  }, RETRY_EVERY_MS).unref();

  // ---------- socket namespace ----------
  const ns = io.of("/pos");
  ns.use(async (socket, next) => {
    try {
      const slug = cleanText(socket.handshake.auth && socket.handshake.auth.slug, 80).toLowerCase();
      const key = String((socket.handshake.auth && socket.handshake.auth.key) || "");
      if (!slug || !key) return next(new Error("AUTH_REQUIRED"));
      if (!(await ensureSchema())) return next(new Error("UNAVAILABLE"));
      const restaurant = await store.getRestaurantBySlug(slug);
      if (!restaurant) return next(new Error("AUTH_FAILED"));
      const keyRow = await db.getKey(restaurant._id);
      const candidate = sha256(key);
      if (!keyRow || !safeEqualHex(keyRow.key_hash, candidate)) return next(new Error("AUTH_FAILED"));
      socket.data.restaurantId = String(restaurant._id);
      socket.data.slug = restaurant.slug;
      next();
    } catch (e) {
      log.error("live orders auth error:", e.message);
      next(new Error("UNAVAILABLE"));
    }
  });

  ns.on("connection", (socket) => {
    const rid = socket.data.restaurantId;
    if (!connections.has(rid)) connections.set(rid, new Set());
    connections.get(rid).add(socket);
    log.log(`🟢 live orders: restaurant ${socket.data.slug} online (${connections.get(rid).size})`);
    socket.emit("ready", { slug: socket.data.slug });
    // The POS owns order types and delivery zones and pushes them here (owner/admin only on the POS side).
    socket.on("delivery:config:set", async (msg, cb) => {
      const reply = typeof cb === "function" ? cb : () => {};
      try {
        if (!store.writeCustomUI) return reply({ ok: false, code: "UNSUPPORTED", message: "غير مدعوم" });
        const cfg = normalizeDeliveryConfig(msg);
        const r = await store.writeCustomUI(rid, (ui) => ({ ...ui, deliveryConfig: cfg }));
        if (!r || !r.ok) return reply({ ok: false, code: "CONFLICT", message: "حصل تعديل تاني، حاول تاني" });
        if (io) io.to(String(rid)).emit("menu_updated");
        reply({ ok: true, config: cfg });
      } catch (e) { reply({ ok: false, code: "ERROR", message: "حصلت مشكلة" }); }
    });
    if (typeof onPosConnect === "function") {
      try { onPosConnect(socket, rid); } catch (e) { log.error("onPosConnect error:", e.message); }
    }
    // Reconnect: pull everything missed first.
    deliver(rid);
    socket.on("sync", () => deliver(rid));
    socket.on("disconnect", () => {
      const set = connections.get(rid);
      if (set) {
        set.delete(socket);
        if (set.size === 0) connections.delete(rid);
      }
      log.log(`🔴 live orders: restaurant ${socket.data.slug} connection closed`);
    });
  });

  // ---------- helpers ----------
  async function ownerRestaurant(req) {
    if (req.user.role === "admin" && req.query.restaurantId) return store.getRestaurantById(String(req.query.restaurantId));
    return store.getRestaurantByOwner(req.user._id);
  }

  function rateLimited(ip) {
    const now = Date.now();
    const arr = (rate.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (arr.length >= RATE_MAX) {
      rate.set(ip, arr);
      return true;
    }
    arr.push(now);
    rate.set(ip, arr);
    return false;
  }
  setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of rate) {
      const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS);
      if (fresh.length) rate.set(ip, fresh);
      else rate.delete(ip);
    }
  }, RATE_WINDOW_MS).unref();

  // ---------- public: status + place order ----------
  app.get("/api/v1/live-orders/status/:slug", async (req, res) => {
    try {
      const restaurant = await store.getRestaurantBySlug(cleanText(req.params.slug, 80).toLowerCase());
      if (!restaurant) return res.status(404).json({ message: "المكان غير موجود" });
      const enabled = isEnabled(restaurant);
      const ready = enabled ? await ensureSchema() : false;
      res.set("Cache-Control", "no-store");
      res.json({
        status: "success",
        data: {
          enabled: enabled && ready,
          online: enabled && ready && onlineCount(restaurant._id) > 0,
          ...orderOptions(restaurant, enabled && ready && onlineCount(restaurant._id) > 0),
        },
      });
    } catch (e) {
      res.status(500).json({ message: "تعذر قراءة الحالة" });
    }
  });

  app.post("/api/v1/live-orders/:slug/orders", async (req, res) => {
    try {
      if (rateLimited(req.ip)) return res.status(429).json({ message: "طلبات كتير، حاول بعد شوية", code: "RATE_LIMIT" });
      const restaurant = await store.getRestaurantBySlug(cleanText(req.params.slug, 80).toLowerCase());
      if (!restaurant) return res.status(404).json({ message: "المكان غير موجود" });
      if (!isEnabled(restaurant)) return res.status(403).json({ message: "المنيو للعرض فقط", code: "VIEW_ONLY" });
      if (!(await ensureSchema())) return res.status(503).json({ message: "الخدمة غير متاحة دلوقتي", code: "UNAVAILABLE" });
      if (onlineCount(restaurant._id) === 0) {
        return res.status(503).json({ message: "المكان مش مستقبل طلبات دلوقتي", code: "POS_OFFLINE" });
      }
      const products = await store.getProducts(restaurant._id);
      const built = buildOrder({ restaurant, products, body: req.body || {}, posOnline: true });
      if (built.error) return res.status(400).json({ message: built.error, code: built.code });
      const id = crypto.randomUUID();
      const payload = { ...built.order, slug: restaurant.slug, source: "online-menu" };
      await db.insertOrder(id, restaurant._id, payload);
      deliver(restaurant._id); // fire and forget; the inbox keeps it until ACK
      const deliveryFee = payload.deliveryFee || 0;
      res.status(202).json({ status: "success", data: { id, totalPrice: payload.totalPrice, deliveryFee, grandTotal: round2(payload.totalPrice + deliveryFee) } });
    } catch (e) {
      log.error("live orders place error:", e.message);
      res.status(500).json({ message: "حصلت مشكلة، حاول تاني" });
    }
  });

  // ---------- owner: settings + key ----------
  app.get("/api/v1/live-orders/settings", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
      const restaurant = await ownerRestaurant(req);
      if (!restaurant) return res.status(404).json({ message: "لا يوجد مكان مرتبط بحسابك" });
      const ready = await ensureSchema();
      let keyHint = null;
      if (ready) {
        const keyRow = await db.getKey(restaurant._id);
        keyHint = keyRow ? keyRow.key_hint : null;
      }
      res.json({
        status: "success",
        data: {
          enabled: isEnabled(restaurant),
          available: ready,
          unavailableReason: ready ? null : schemaReason,
          slug: restaurant.slug,
          hasKey: !!keyHint,
          keyHint,
          posOnline: onlineCount(restaurant._id) > 0,
        },
      });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/v1/live-orders/settings", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
      const restaurant = await ownerRestaurant(req);
      if (!restaurant) return res.status(404).json({ message: "لا يوجد مكان مرتبط بحسابك" });
      const enabled = req.body && req.body.enabled === true;
      if (enabled && !(await ensureSchema())) {
        return res.status(503).json({ message: "الخدمة غير متاحة دلوقتي، قاعدة البيانات لسه ماجهزتش", reason: schemaReason });
      }
      const customUI = {
        ...(restaurant.customUI && typeof restaurant.customUI === "object" ? restaurant.customUI : {}),
        liveOrders: { enabled },
      };
      await store.updateRestaurantCustomUI(restaurant._id, customUI);
      if (io) io.to(String(restaurant._id)).emit("menu_updated");
      res.json({ status: "success", data: { enabled } });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  });

  // Generates a fresh key (shown once). The previous key stops working and live connections are dropped.
  app.post("/api/v1/live-orders/key", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
      const restaurant = await ownerRestaurant(req);
      if (!restaurant) return res.status(404).json({ message: "لا يوجد مكان مرتبط بحسابك" });
      if (!(await ensureSchema())) return res.status(503).json({ message: "الخدمة غير متاحة دلوقتي", reason: schemaReason });
      const key = generateKey();
      const rid = String(restaurant._id);
      await db.setKey(rid, sha256(key), key.slice(-4));
      const set = connections.get(rid);
      if (set) for (const s of Array.from(set)) s.disconnect(true);
      res.json({ status: "success", data: { slug: restaurant.slug, key, keyHint: key.slice(-4) } });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  });

  return { ensureSchema, deliver, connections, buildOrder };
}

module.exports = { createLiveOrders, buildOrder, normalizeDeliveryConfig, orderOptions, generateKey, sha256 };
