"use strict";
// Run: TEST_DATABASE_URL=postgres://... node --test tests/live-orders.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { io: ioClient } = require("socket.io-client");
const { Pool } = require("pg");
const { createLiveOrders, buildOrder } = require("../live-orders");

const products = [
  { _id: "p1", name: { ar: "برجر كلاسيك" }, price: 100, sizes: [], category: "برجر", isAvailable: true },
  { _id: "p2", name: { ar: "بيتزا" }, price: 0, sizes: [{ name: "وسط", price: 80 }, { name: "كبير", price: 120 }], category: "بيتزا", isAvailable: true },
  { _id: "p3", name: { ar: "ممنوع" }, price: 10, sizes: [], category: "x", isAvailable: false },
];
const baseRestaurant = { _id: "r1", slug: "demo", taxRate: 10, serviceRate: 12, useTableNumbers: true, offers: [], customUI: {} };

test("buildOrder: prices come from the server, names untouched", () => {
  const { order, error } = buildOrder({
    restaurant: baseRestaurant, products,
    body: { items: [{ productId: "p1", qty: 2, price: 1 }, { productId: "p2", sizeName: "كبير", qty: 1 }], tableNumber: "5", orderType: "dine_in" },
  });
  assert.ok(!error);
  assert.deepStrictEqual(order.items.map((i) => i.name), ["برجر كلاسيك", "بيتزا (كبير)"]);
  assert.strictEqual(order.subTotal, 320);
  assert.strictEqual(order.taxAmount, 32);
  assert.strictEqual(order.serviceAmount, 38.4);
  assert.strictEqual(order.totalPrice, 390.4);
  assert.strictEqual(order.tableNumber, "5");
});

test("buildOrder: takeaway has no service and uses the takeaway table label", () => {
  const { order } = buildOrder({ restaurant: baseRestaurant, products, body: { items: [{ productId: "p1", qty: 1 }], orderType: "takeaway" } });
  assert.strictEqual(order.serviceAmount, 0);
  assert.strictEqual(order.tableNumber, "تيك أواي");
  assert.strictEqual(order.orderType, "takeaway");
});

test("buildOrder: rejects bad input", () => {
  const b = (items, extra = {}) => buildOrder({ restaurant: baseRestaurant, products, body: { items, tableNumber: "1", ...extra } });
  assert.strictEqual(b([]).code, "EMPTY");
  assert.strictEqual(b([{ productId: "nope", qty: 1 }]).code, "UNKNOWN_PRODUCT");
  assert.strictEqual(b([{ productId: "p3", qty: 1 }]).code, "UNAVAILABLE");
  assert.strictEqual(b([{ productId: "p1", qty: 0 }]).code, "BAD_QTY");
  assert.strictEqual(b([{ productId: "p1", qty: 1000 }]).code, "BAD_QTY");
  assert.strictEqual(b([{ productId: "p2", sizeName: "عملاق", qty: 1 }]).code, "BAD_SIZE");
  assert.strictEqual(b([{ productId: "p2", qty: 1 }]).code, "BAD_SIZE");
  assert.strictEqual(buildOrder({ restaurant: baseRestaurant, products, body: { items: [{ productId: "p1", qty: 1 }] } }).code, "TABLE_REQUIRED");
});

test("buildOrder: product offers and whole-bill offer match the menu logic", () => {
  const restaurant = {
    ...baseRestaurant, taxRate: 0, serviceRate: 0,
    offers: [{ enabled: true, scope: "all", discountPercent: 50, applyPrices: true }],
    customUI: { orderAnnouncements: [{ enabled: true, minAmount: 40, orderPercent: 20 }] },
  };
  const { order } = buildOrder({ restaurant, products, body: { items: [{ productId: "p1", qty: 1 }], tableNumber: "1" } });
  assert.strictEqual(order.items[0].price, 50);
  assert.strictEqual(order.subTotal, 50);
  assert.strictEqual(order.discountAmount, 10);
  assert.strictEqual(order.totalPrice, 40);
});

const DB = process.env.TEST_DATABASE_URL;
test("live orders end to end", { skip: !DB && "TEST_DATABASE_URL not set" }, async (t) => {
  const pool = new Pool({ connectionString: DB });
  await pool.query("DROP TABLE IF EXISTS public.live_orders_inbox, public.live_pos_keys");
  const state = { restaurant: { ...baseRestaurant, customUI: { liveOrders: { enabled: true } } } };
  const store = {
    getRestaurantBySlug: async (s) => (s === state.restaurant.slug ? state.restaurant : null),
    getRestaurantById: async () => state.restaurant,
    getRestaurantByOwner: async () => state.restaurant,
    getProducts: async () => products,
    updateRestaurantCustomUI: async (_id, customUI) => { state.restaurant = { ...state.restaurant, customUI }; },
  };
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const io = new Server(server);
  const protect = (req, res, next) => { req.user = { _id: "u1", role: "owner" }; next(); };
  const restrictTo = () => (req, res, next) => next();
  const quiet = { log() {}, error: console.error };
  const live = createLiveOrders({ app, io, pool, store, protect, restrictTo, log: quiet });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  const inboxCount = async () => Number((await pool.query("SELECT count(*) FROM public.live_orders_inbox")).rows[0].count);
  const connect = (auth) => new Promise((resolve) => {
    const s = ioClient(base + "/pos", { auth, reconnection: false, transports: ["websocket"] });
    s.on("ready", () => resolve({ s }));
    s.on("connect_error", (e) => resolve({ err: e.message, s }));
  });
  const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; };
  const orderBody = (extra = {}) => ({ items: [{ productId: "p1", qty: 1 }], tableNumber: "7", ...extra });

  t.after(async () => { io.close(); server.close(); await pool.end(); });

  await t.test("no key yet: connection refused", async () => {
    const r = await connect({ slug: "demo", key: "imk_wrong" });
    assert.strictEqual(r.err, "AUTH_FAILED");
    r.s.close();
  });

  let key;
  await t.test("owner generates a key (shown once, only a hash is stored)", async () => {
    const r = await j("POST", "/api/v1/live-orders/key");
    assert.strictEqual(r.status, 200);
    key = r.body.data.key;
    assert.match(key, /^imk_[A-Za-z0-9_-]{30,}$/);
    const rows = (await pool.query("SELECT * FROM public.live_pos_keys")).rows;
    assert.strictEqual(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes(key));
    const st = await j("GET", "/api/v1/live-orders/settings");
    assert.strictEqual(st.body.data.hasKey, true);
    assert.strictEqual(st.body.data.keyHint, key.slice(-4));
  });

  await t.test("POS offline: order refused, nothing queued, status says offline", async () => {
    const s = await j("GET", "/api/v1/live-orders/status/demo");
    assert.deepStrictEqual(s.body.data, { enabled: true, online: false });
    const r = await j("POST", "/api/v1/live-orders/demo/orders", orderBody());
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.body.code, "POS_OFFLINE");
    assert.strictEqual(await inboxCount(), 0);
  });

  await t.test("wrong key / wrong slug refused", async () => {
    assert.strictEqual((await connect({ slug: "demo", key: key + "x" })).err, "AUTH_FAILED");
    assert.strictEqual((await connect({ slug: "other", key })).err, "AUTH_FAILED");
    assert.strictEqual((await connect({ slug: "demo" })).err, "AUTH_REQUIRED");
  });

  await t.test("connected POS receives the order instantly; inbox row deleted only after ACK", async () => {
    const { s, err } = await connect({ slug: "demo", key });
    assert.ok(!err);
    assert.deepStrictEqual((await j("GET", "/api/v1/live-orders/status/demo")).body.data, { enabled: true, online: true });
    let received = null, release;
    const gate = new Promise((r) => (release = r));
    s.on("order", async (o, ack) => { received = o; await gate; ack({ ok: true }); });
    const r = await j("POST", "/api/v1/live-orders/demo/orders", orderBody({ items: [{ productId: "p1", qty: 2, price: 1 }] }));
    assert.strictEqual(r.status, 202);
    assert.ok(await waitFor(() => received));
    assert.strictEqual(received.id, r.body.data.id);
    assert.strictEqual(received.items[0].price, 100, "client price must be ignored");
    assert.strictEqual(received.tableNumber, "7");
    assert.strictEqual(await inboxCount(), 1, "still in the cloud inbox before the ACK");
    release();
    assert.ok(await waitFor(async () => (await inboxCount()) === 0));
    s.close();
    assert.ok(await waitFor(async () => !(await j("GET", "/api/v1/live-orders/status/demo")).body.data.online));
  });

  await t.test("unacked orders survive a dropped connection and arrive in order on reconnect", async () => {
    const a = await connect({ slug: "demo", key });
    a.s.on("order", () => { /* never ACKs: simulates a crash mid-save */ });
    const ids = [];
    for (const n of [1, 2, 3]) ids.push((await j("POST", "/api/v1/live-orders/demo/orders", orderBody({ tableNumber: String(n) }))).body.data.id);
    await new Promise((r) => setTimeout(r, 150));
    assert.strictEqual(await inboxCount(), 3);
    a.s.close();
    await waitFor(async () => !(await j("GET", "/api/v1/live-orders/status/demo")).body.data.online);
    const got = [];
    const b = new Promise((resolve) => {
      const s = ioClient(base + "/pos", { auth: { slug: "demo", key }, reconnection: false, transports: ["websocket"] });
      s.on("order", (o, ack) => { got.push(o.id); ack({ ok: true }); if (got.length === 3) resolve(s); });
    });
    const s2 = await Promise.race([b, new Promise((r) => setTimeout(() => r(null), 5000))]);
    assert.ok(s2, "should deliver all three after reconnect (a dropped connection must not block the queue)");
    assert.deepStrictEqual(got, ids);
    assert.ok(await waitFor(async () => (await inboxCount()) === 0));
    s2.close();
  });

  await t.test("view-only restaurant refuses orders and reports disabled", async () => {
    await j("PATCH", "/api/v1/live-orders/settings", { enabled: false });
    assert.strictEqual((await j("POST", "/api/v1/live-orders/demo/orders", orderBody())).body.code, "VIEW_ONLY");
    assert.deepStrictEqual((await j("GET", "/api/v1/live-orders/status/demo")).body.data, { enabled: false, online: false });
    await j("PATCH", "/api/v1/live-orders/settings", { enabled: true });
    assert.strictEqual(state.restaurant.customUI.liveOrders.enabled, true);
  });

  await t.test("expired owner subscription pauses ordering", async () => {
    const saved = state.restaurant;
    state.restaurant = { ...saved, owner: { active: true, subscriptionExpires: "2020-01-01T00:00:00Z" } };
    assert.strictEqual((await j("POST", "/api/v1/live-orders/demo/orders", orderBody())).body.code, "VIEW_ONLY");
    state.restaurant = saved;
  });

  await t.test("rotating the key drops live connections and invalidates the old key", async () => {
    const { s } = await connect({ slug: "demo", key });
    const closed = new Promise((r) => s.on("disconnect", r));
    const r = await j("POST", "/api/v1/live-orders/key");
    await Promise.race([closed, new Promise((r2) => setTimeout(r2, 3000))]);
    assert.strictEqual(s.connected, false);
    assert.strictEqual((await connect({ slug: "demo", key })).err, "AUTH_FAILED");
    assert.ok(!(await connect({ slug: "demo", key: r.body.data.key })).err);
  });

  await t.test("validation errors never reach the inbox", async () => {
    const { s } = await connect({ slug: "demo", key: (await j("POST", "/api/v1/live-orders/key")).body.data.key });
    s.on("order", (o, ack) => ack({ ok: true }));
    const r = await j("POST", "/api/v1/live-orders/demo/orders", { items: [{ productId: "zzz", qty: 1 }], tableNumber: "1" });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(await inboxCount(), 0);
    s.close();
  });
});

test("public menu endpoint never selects the owner's full user row", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../server.js"), "utf8");
  const i = src.indexOf('app.get("/api/v1/restaurants/:slug"');
  assert.ok(i > 0);
  const handler = src.slice(i, src.indexOf("\napp.get(", i + 10));
  assert.ok(!/users\(\s*\*\s*\)/.test(handler), "owner:users(*) would leak email, phone and password hash");
  assert.match(handler, /owner:users\(active, subscriptionExpires, isTrial\)/);
});
