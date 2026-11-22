"use strict";
// Timed table reservations (customer request -> owner decision -> POS).
// Bookings live in the cloud store (reservations-db.js). The POS gets a full active list and change hints
// over the existing /pos Socket.IO namespace; it can also act (approve/reject/arrived/...) through this module.
// Settings live in restaurant.customUI.timedReservations, nothing here changes another feature's data.
const crypto = require("crypto");
const { buildOrder } = require("./live-orders");

const DEFAULTS = { timezone: "Africa/Cairo", enabled: false, holdBeforeMin: 15, holdAfterMin: 90, minLeadMin: 30, maxDaysAhead: 60, expireMin: 0 };
const CODE_CHARS = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const cleanText = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const minutes = (n) => n * 60 * 1000;

function settingsOf(restaurant) {
  const s = (restaurant && restaurant.customUI && restaurant.customUI.timedReservations) || {};
  const num = (k, lo, hi) => (Number.isFinite(Number(s[k])) && Number(s[k]) >= lo && Number(s[k]) <= hi ? Number(s[k]) : DEFAULTS[k]);
  let timezone = DEFAULTS.timezone;
  try { if (typeof s.timezone === "string" && s.timezone) { new Intl.DateTimeFormat("en", { timeZone: s.timezone }); timezone = s.timezone; } } catch (_) { /* unknown zone: keep the default */ }
  return {
    timezone,
    enabled: s.enabled === true,
    holdBeforeMin: num("holdBeforeMin", 0, 240),
    holdAfterMin: num("holdAfterMin", 15, 720),
    minLeadMin: num("minLeadMin", 0, 1440),
    maxDaysAhead: num("maxDaysAhead", 1, 365),
    expireMin: num("expireMin", 0, 1440),
  };
}

// Wall-clock time in a named zone -> UTC instant (ms). The venue's zone decides what "8:30 PM" means,
// never the customer's device. Returns NaN for impossible input.
function zonedInstant(date, time, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "")), t = /^(\d{2}):(\d{2})$/.exec(String(time || ""));
  if (!m || !t) return NaN;
  const [y, mo, d, hh, mm] = [+m[1], +m[2], +m[3], +t[1], +t[2]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return NaN;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  const offsetAt = (ts) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((x) => [x.type, +x.value]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
  };
  const wall = Date.UTC(y, mo - 1, d, hh, mm);
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  const back = new Date(guess);
  const check = Object.fromEntries(fmt.formatToParts(back).map((x) => [x.type, +x.value]));
  if (check.year !== y || check.month !== mo || check.day !== d || check.hour !== hh || check.minute !== mm) return NaN; // skipped by a clock change
  return guess;
}
const newCode = () => Array.from(crypto.randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");

// Pure rule: which transitions are allowed, and what they require.
function planTransition(row, action, input, settings, now) {
  const st = row.status;
  const start = new Date(row.starts_at).getTime();
  switch (action) {
    case "approve": {
      if (st !== "pending") return { error: "STATE", message: "الحجز اتعامل معاه قبل كده" };
      const table = cleanText(input.table_label, 40);
      if (!table) return { error: "TABLE_REQUIRED", message: "اختار الطاولة" };
      if (start + minutes(settings.holdAfterMin) < now) return { error: "PAST", message: "ميعاد الحجز عدّى" };
      return { patch: { status: "approved", table_label: table,
        window_start: new Date(start - minutes(settings.holdBeforeMin)).toISOString(),
        window_end: new Date(start + minutes(settings.holdAfterMin)).toISOString() } };
    }
    case "reject":
      if (st !== "pending") return { error: "STATE", message: "الحجز اتعامل معاه قبل كده" };
      return { patch: { status: "rejected" } };
    case "cancel":
      if (!["pending", "approved"].includes(st)) return { error: "STATE", message: "مينفعش يتلغي دلوقتي" };
      return { patch: { status: "cancelled" } };
    case "arrived":
      if (st !== "approved") return { error: "STATE", message: "لازم الحجز يكون موافق عليه الأول" };
      return { patch: { status: "arrived" } };
    case "release":
      // The cashier confirms the guests left (or an order took over the table). Shared by every POS device.
      if (st !== "arrived") return { error: "STATE", message: "الحجز مش في حالة وصل" };
      return { patch: { status: "completed" } };
    case "no_show":
      if (st !== "approved") return { error: "STATE", message: "لازم الحجز يكون موافق عليه الأول" };
      if (now < start) return { error: "TOO_EARLY", message: "لسه ميعاد الحجز ماجاش" };
      return { patch: { status: "no_show" } };
    default:
      return { error: "BAD_ACTION", message: "إجراء غير معروف" };
  }
}

function publicView(row) {
  return { code: row.code, status: row.status, startsAt: row.starts_at, partySize: row.party_size, name: row.customer_name };
}
function posView(row) {
  return { id: row.id, version: row.version, code: row.code, status: row.status, name: row.customer_name, phone: row.customer_phone,
    partySize: row.party_size, startsAt: row.starts_at, tableLabel: row.table_label, windowStart: row.window_start,
    windowEnd: row.window_end, preorder: row.preorder || null, note: row.note || null };
}

function createReservations({ app, io, db, store, protect, restrictTo, connections, log = console, now = () => Date.now(), rateMax = 10 }) {
  const rate = new Map();
  // Separate buckets: creating/cancelling is tight, reading a status (the customer page polls it) is looser.
  const limited = (ip, bucket = "write", max = 10) => {
    const t = now();
    const k = bucket + ":" + ip;
    const arr = (rate.get(k) || []).filter((x) => t - x < 10 * 60 * 1000);
    if (arr.length >= max) { rate.set(k, arr); return true; }
    arr.push(t); rate.set(k, arr); return false;
  };
  let ready = false;
  const ensure = async () => { if (ready) return true; try { await db.ensure(); ready = true; } catch (e) { log.error("reservations: schema not ready:", e.message); } return ready; };

  // Lazy expiry: a pending request whose time has passed (or that outlived the optional expiry) becomes "expired".
  async function sweep(rows, settings) {
    const t = now();
    const out = [];
    for (const r of rows) {
      const passed = new Date(r.starts_at).getTime() + minutes(settings.holdAfterMin) < t;
      const stale = settings.expireMin > 0 && t - new Date(r.created_at).getTime() > minutes(settings.expireMin);
      if (r.status === "pending" && (passed || stale)) {
        const x = await db.transition(r.id, r.version, { status: "expired" });
        // If someone else changed it first, show their result, not our stale copy.
        out.push(x.ok ? x.row : (await db.get(r.id)) || r);
      } else out.push(r);
    }
    return out;
  }

  // Guests who arrived stay on the POS list until a cashier releases them ("release" action), however long
  // that takes: time passing never frees a table people may still be sitting at. Pending/approved requests
  // keep the normal window.
  async function activeFor(restaurant) {
    const settings = settingsOf(restaurant);
    const t = now();
    const normalFrom = t - minutes(settings.holdAfterMin + 60);
    const rows = await sweep(await db.listActive(String(restaurant._id), new Date(normalFrom).toISOString()), settings);
    return rows.filter((r) => r.status === "arrived" || (["pending", "approved"].includes(r.status) && new Date(r.starts_at).getTime() >= normalFrom));
  }

  async function push(rid) {
    const set = connections && connections.get(String(rid));
    if (!set || set.size === 0) return;
    try {
      const restaurant = await store.getRestaurantById(rid);
      if (!restaurant) return;
      const list = (await activeFor(restaurant)).map(posView);
      const timezone = settingsOf(restaurant).timezone;
      for (const s of set) s.emit("reservations:list", { reservations: list, timezone });
    } catch (e) { log.error("reservations push error:", e.message); }
  }

  // One decision path for the owner dashboard and the POS.
  async function act(restaurant, id, expectedVersion, action, input) {
    const row = await db.get(id);
    if (!row || String(row.restaurant_id) !== String(restaurant._id)) return { ok: false, code: "NOT_FOUND", message: "الحجز مش موجود" };
    const plan = planTransition(row, action, input || {}, settingsOf(restaurant), now());
    if (plan.error) return { ok: false, code: plan.error, message: plan.message, row: posView(row) };
    const r = await db.transition(id, Number.isInteger(expectedVersion) ? expectedVersion : row.version, plan.patch);
    if (!r.ok) {
      const fresh = await db.get(id);
      const msg = r.reason === "conflict" ? "الطاولة دي محجوزة في نفس الوقت" : "حد تاني عدّل الحجز قبلك";
      return { ok: false, code: r.reason === "conflict" ? "TABLE_CONFLICT" : "STALE", message: msg, row: fresh ? posView(fresh) : null };
    }
    push(restaurant._id);
    return { ok: true, row: posView(r.row) };
  }

  // ---- customer ----
  app.get("/api/v1/timed-reservations/config/:slug", async (req, res) => {
    try {
      const restaurant = await store.getRestaurantBySlug(cleanText(req.params.slug, 80).toLowerCase());
      if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });
      const s = settingsOf(restaurant);
      res.set("Cache-Control", "no-store");
      res.json({ status: "success", data: { enabled: s.enabled && (await ensure()), minLeadMin: s.minLeadMin, maxDaysAhead: s.maxDaysAhead, timezone: s.timezone } });
    } catch (e) { res.status(500).json({ message: "تعذر قراءة الإعدادات" }); }
  });

  app.post("/api/v1/timed-reservations/:slug", async (req, res) => {
    try {
      if (limited(req.ip, "write", rateMax)) return res.status(429).json({ message: "طلبات كتير، حاول بعد شوية", code: "RATE_LIMIT" });
      const restaurant = await store.getRestaurantBySlug(cleanText(req.params.slug, 80).toLowerCase());
      if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });
      const s = settingsOf(restaurant);
      if (!s.enabled) return res.status(403).json({ message: "الحجز بالميعاد مش متاح دلوقتي", code: "DISABLED" });
      if (!(await ensure())) return res.status(503).json({ message: "الخدمة غير متاحة دلوقتي", code: "UNAVAILABLE" });
      const b = req.body || {};
      const name = cleanText(b.name, 80), phone = cleanText(b.phone, 25).replace(/[^\d+]/g, "");
      const party = Number(b.partySize);
      // Preferred input: venue-local date + time ("2030-05-02", "20:30"), resolved in the venue zone.
      // A raw ISO instant is still accepted (used by tests and API clients that already know the instant).
      const startsAt = b.date != null || b.time != null ? new Date(zonedInstant(b.date, b.time, s.timezone)) : new Date(String(b.startsAt || ""));
      const key = cleanText(b.requestKey, 80);
      if (!name || phone.length < 7) return res.status(400).json({ message: "اكتب الاسم ورقم الموبايل", code: "CONTACT" });
      if (!Number.isInteger(party) || party < 1 || party > 100) return res.status(400).json({ message: "عدد الأشخاص غير صحيح", code: "PARTY" });
      if (Number.isNaN(startsAt.getTime())) return res.status(400).json({ message: "اختار اليوم والساعة", code: "TIME" });
      const t = now();
      if (startsAt.getTime() < t + minutes(s.minLeadMin)) return res.status(400).json({ message: "الميعاد قريب جدًا، اختار وقت أبعد", code: "TOO_SOON" });
      if (startsAt.getTime() > t + s.maxDaysAhead * 86400000) return res.status(400).json({ message: "الميعاد بعيد جدًا", code: "TOO_FAR" });
      if (key.length < 8) return res.status(400).json({ message: "طلب غير صالح", code: "KEY" });
      let preorder = null;
      if (Array.isArray(b.items) && b.items.length) {
        const products = await store.getProducts(restaurant._id);
        const built = buildOrder({ restaurant, products, body: { items: b.items, orderType: "dine_in", tableNumber: "حجز" } });
        if (built.error) return res.status(400).json({ message: built.error, code: built.code });
        const o = built.order;
        preorder = { items: o.items, subTotal: o.subTotal, taxAmount: o.taxAmount, serviceAmount: o.serviceAmount, discountAmount: o.discountAmount, totalPrice: o.totalPrice };
      }
      const r = await db.create({ restaurant_id: String(restaurant._id), code: newCode(), request_key: key, customer_name: name,
        customer_phone: phone, party_size: party, starts_at: startsAt.toISOString(), preorder, note: cleanText(b.note, 300) });
      push(restaurant._id);
      res.status(r.created ? 201 : 200).json({ status: "success", data: publicView(r.row) });
    } catch (e) {
      log.error("reservations create error:", e.message);
      res.status(500).json({ message: "حصلت مشكلة، حاول تاني" });
    }
  });

  app.get("/api/v1/timed-reservations/status/:code", async (req, res) => {
    try {
      if (limited(req.ip, "read", 200)) return res.status(429).json({ message: "طلبات كتير", code: "RATE_LIMIT" });
      const row = await db.getByCode(cleanText(req.params.code, 20).toUpperCase());
      if (!row) return res.status(404).json({ message: "الحجز مش موجود" });
      const restaurant = await store.getRestaurantById(row.restaurant_id);
      const [fresh] = restaurant ? await sweep([row], settingsOf(restaurant)) : [row];
      res.set("Cache-Control", "no-store");
      res.json({ status: "success", data: publicView(fresh) });
    } catch (e) { res.status(500).json({ message: "تعذر قراءة الحجز" }); }
  });

  app.post("/api/v1/timed-reservations/cancel/:code", async (req, res) => {
    try {
      if (limited(req.ip, "write", rateMax)) return res.status(429).json({ message: "طلبات كتير", code: "RATE_LIMIT" });
      const row = await db.getByCode(cleanText(req.params.code, 20).toUpperCase());
      if (!row) return res.status(404).json({ message: "الحجز مش موجود" });
      const restaurant = await store.getRestaurantById(row.restaurant_id);
      const r = await act(restaurant, row.id, undefined, "cancel", {});
      if (!r.ok) return res.status(409).json({ message: r.message, code: r.code });
      res.json({ status: "success", data: publicView({ ...row, status: "cancelled" }) });
    } catch (e) { res.status(500).json({ message: "حصلت مشكلة" }); }
  });

  // ---- owner dashboard ----
  const ownerRestaurant = async (req) => (req.user.role === "admin" && req.query.restaurantId
    ? store.getRestaurantById(String(req.query.restaurantId)) : store.getRestaurantByOwner(req.user._id));

  app.get("/api/v1/timed-reservations", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
      const restaurant = await ownerRestaurant(req);
      if (!restaurant) return res.status(404).json({ message: "لا يوجد مطعم مرتبط بحسابك" });
      if (!(await ensure())) return res.status(503).json({ message: "الخدمة غير متاحة دلوقتي" });
      const rows = await sweep(await db.listFor(String(restaurant._id)), settingsOf(restaurant));
      res.json({ status: "success", data: { settings: settingsOf(restaurant), reservations: rows.map(posView) } });
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/v1/timed-reservations/settings", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
      const restaurant = await ownerRestaurant(req);
      if (!restaurant) return res.status(404).json({ message: "لا يوجد مطعم مرتبط بحسابك" });
      const b = req.body || {};
      // The older seat-counter page (/reserve) has no tables or times, so the two cannot share one venue without double booking.
      // The owner must close the old one first; its existing requests and data stay untouched.
      if (b.enabled === true && settingsOf(restaurant).enabled !== true && restaurant.reservationSettings && restaurant.reservationSettings.isEnabled === true) return res.status(409).json({ code: "LEGACY_ACTIVE", message: "حجز المقاعد القديم شغّال. اقفله الأول وبعدين فعّل الحجز بالميعاد. حجوزاته الحالية هتفضل زي ما هي." });
      if (b.enabled === true && !(await ensure())) return res.status(503).json({ message: "قاعدة البيانات لسه ماجهزتش" });
      const merged = { ...settingsOf(restaurant) };
      for (const k of ["timezone", "enabled", "holdBeforeMin", "holdAfterMin", "minLeadMin", "maxDaysAhead", "expireMin"]) if (k in b) merged[k] = b[k];
      if ("timezone" in b && settingsOf({ customUI: { timedReservations: { timezone: b.timezone } } }).timezone !== b.timezone) return res.status(400).json({ message: "المنطقة الزمنية غير صحيحة، مثال: Africa/Cairo" });
      const cleaned = settingsOf({ customUI: { timedReservations: merged } });
      const customUI = { ...(restaurant.customUI || {}), timedReservations: cleaned };
      await store.updateRestaurantCustomUI(restaurant._id, customUI);
      res.json({ status: "success", data: cleaned });
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/v1/timed-reservations/:id/:action", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
      const restaurant = await ownerRestaurant(req);
      if (!restaurant) return res.status(404).json({ message: "لا يوجد مطعم مرتبط بحسابك" });
      const r = await act(restaurant, cleanText(req.params.id, 60), req.body && req.body.version, req.params.action, req.body || {});
      res.status(r.ok ? 200 : r.code === "NOT_FOUND" ? 404 : 409).json(r.ok ? { status: "success", data: r.row } : { message: r.message, code: r.code, data: r.row });
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  // ---- POS (called from live-orders.js socket handlers) ----
  async function posAttach(socket, restaurantId) {
    socket.emit("reservations:ready", {});
    push(restaurantId);
    socket.on("reservations:sync", () => push(restaurantId));
    socket.on("reservations:act", async (msg, cb) => {
      const reply = typeof cb === "function" ? cb : () => {};
      try {
        const restaurant = await store.getRestaurantById(restaurantId);
        if (!restaurant) return reply({ ok: false, code: "NOT_FOUND", message: "المطعم مش موجود" });
        const m = msg || {};
        reply(await act(restaurant, cleanText(m.id, 60), m.version, cleanText(m.action, 20), m));
      } catch (e) { reply({ ok: false, code: "ERROR", message: "حصلت مشكلة" }); }
    });
  }

  return { ensure, act, push, posAttach, activeFor };
}

module.exports = { createReservations, planTransition, settingsOf, zonedInstant, DEFAULTS };
