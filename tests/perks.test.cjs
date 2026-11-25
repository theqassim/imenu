const test = require("node:test");
const assert = require("node:assert/strict");
const { createPerks, couponCheck, pointsFromOrders, normalizePerksConfig, normalizeCoupons } = require("../perks.js");

function fakeSupabase(tables) {
  let n = 0;
  return {
    from(t) {
      const q = { f: [], op: "select", patch: null, rows: null, one: false };
      const run = () => {
        const all = tables[t] || (tables[t] = []);
        const hit = (r) => q.f.every(([k, v]) => r[k] === v);
        if (q.op === "insert") { for (const r of q.rows) all.push({ _id: "id" + ++n, ...r }); return { data: null, error: null }; }
        if (q.op === "update") { all.filter(hit).forEach((r) => Object.assign(r, q.patch)); return { data: null, error: null }; }
        if (q.op === "delete") { for (let i = all.length - 1; i >= 0; i--) if (hit(all[i])) all.splice(i, 1); return { data: null, error: null }; }
        const rows = all.filter(hit);
        return q.one ? { data: rows[0] || null, error: null } : { data: rows, error: null };
      };
      const b = {
        select() { return b; }, eq(k, v) { q.f.push([k, v]); return b; }, limit() { return b; }, single() { q.one = true; return b; },
        insert(r) { q.op = "insert"; q.rows = r; return b; }, update(p) { q.op = "update"; q.patch = p; return b; }, delete() { q.op = "delete"; return b; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return b;
    },
  };
}
const rest = (perks) => ({ _id: "r1", customUI: { perks } });

test("coupon rules: percent with cap, fixed, minimum, expiry, usage limit", () => {
  const c = { code: "A", discountType: "percent", value: 20, maxDiscount: 30, minOrderVal: 100, usageLimit: 2, usedCount: 1, isActive: true };
  assert.equal(couponCheck(c, 100).discount, 20);
  assert.equal(couponCheck(c, 500).discount, 30);
  assert.equal(couponCheck(c, 50).code, "MIN_ORDER");
  assert.equal(couponCheck({ ...c, usedCount: 2 }, 100).code, "COUPON_USED_UP");
  assert.equal(couponCheck({ ...c, expiresAt: "2020-01-01" }, 100).code, "COUPON_EXPIRED");
  assert.equal(couponCheck({ ...c, isActive: false }, 100).code, "BAD_COUPON");
  assert.equal(couponCheck({ code: "F", discountType: "fixed", value: 500, minOrderVal: 0, usageLimit: 0, usedCount: 9 }, 80).discount, 80);
});

test("points: earned on completed orders, minus redeemed, canceled redemptions return", () => {
  const l = { earnPer: 10, redeemPoints: 50 };
  const orders = [{ status: "completed", totalPrice: 305 }, { status: "pending", totalPrice: 999 }, { status: "completed", totalPrice: 100, couponCode: "LOYALTY:20" }, { status: "canceled", totalPrice: 0, couponCode: "LOYALTY:30" }];
  const p = pointsFromOrders(orders, l);
  assert.equal(p.earned, 40); assert.equal(p.spent, 20); assert.equal(p.balance, 20);
});

test("coupon sync: owner list becomes the cloud list; resolve counts the use", async () => {
  const t = { coupons: [{ _id: "old", restaurant: "r1", code: "GONE", usageLimit: 1 }] };
  const perks = createPerks({ supabase: fakeSupabase(t) });
  await perks.syncCoupons("r1", [{ code: "ramadan", discountType: "fixed", value: 25, usageLimit: 2 }, { code: "WELCOME", value: 5 }]);
  assert.deepEqual(t.coupons.map((c) => c.code), ["RAMADAN"]);
  const r = await perks.resolve({ restaurant: rest(), customer: null, subTotal: 100, body: { couponCode: "ramadan" } });
  assert.equal(r.discount, 25); assert.equal(r.couponCode, "RAMADAN");
  await r.commit(); assert.equal(t.coupons[0].usedCount, 1);
  await perks.syncCoupons("r1", [{ code: "RAMADAN", discountType: "fixed", value: 30, usageLimit: 2, usedCount: 1 }]);
  assert.equal(t.coupons.length, 1); assert.equal(t.coupons[0].value, 30);
  const bad = await perks.resolve({ restaurant: rest(), customer: null, subTotal: 100, body: { couponCode: "NOPE" } });
  assert.equal(bad.code, "BAD_COUPON");
});

test("welcome gift is per device, not per account: a second account on the same phone gets nothing", async () => {
  const cfg = { welcomeGift: { enabled: true, discountType: "percent", value: 15, title: "هدية" } };
  const t = { orders: [] };
  const perks = createPerks({ supabase: fakeSupabase(t) });
  const dev = "abcd1234efgh5678";
  assert.equal((await perks.overview(rest(cfg), { _id: "c1" }, dev)).gift.value, 15);
  assert.equal((await perks.overview(rest(cfg), { _id: "c1" }, "")).gift, null, "no device id, no gift");
  assert.equal((await perks.overview(rest(cfg), { _id: "c1" }, "short")).gift, null);
  const r = await perks.resolve({ restaurant: rest(cfg), customer: { _id: "c1" }, subTotal: 200, body: { useGift: true }, deviceId: dev });
  assert.equal(r.discount, 30); assert.match(r.couponCode, /^WELCOME:[0-9a-f]{20}$/);
  assert.equal((await perks.resolve({ restaurant: rest(cfg), customer: null, subTotal: 200, body: { useGift: true }, deviceId: dev })).code, "LOGIN_REQUIRED");
  t.orders.push({ restaurant: "r1", customerId: "c1", status: "pending", totalPrice: 170, couponCode: r.couponCode });
  // same phone, brand new account
  assert.equal((await perks.overview(rest(cfg), { _id: "c2" }, dev)).gift, null);
  assert.equal((await perks.resolve({ restaurant: rest(cfg), customer: { _id: "c2" }, subTotal: 200, body: { useGift: true }, deviceId: dev })).code, "NO_GIFT");
  // same account, another phone
  assert.equal((await perks.overview(rest(cfg), { _id: "c1" }, "other-device-99")).gift, null);
  // a different venue on the same phone is a separate gift
  assert.ok((await perks.overview({ _id: "r2", customUI: { perks: cfg } }, { _id: "c1" }, dev)).gift);
  t.orders[0].status = "canceled"; // a rejected first order gives the gift back
  assert.ok((await perks.overview(rest(cfg), { _id: "c2" }, dev)).gift);
});

test("loyalty: balance, redeem in whole rewards, off when disabled", async () => {
  const cfg = { loyalty: { enabled: true, earnPer: 10, redeemPoints: 50, redeemValue: 20 } };
  const t = { orders: [{ restaurant: "r1", customerId: "c1", status: "completed", totalPrice: 1230 }], imenu_customers: [] };
  const perks = createPerks({ supabase: fakeSupabase(t) });
  const ov = await perks.overview(rest(cfg), { _id: "c1" });
  assert.equal(ov.loyalty.points, 123); assert.equal(ov.loyalty.rewardsAvailable, 2);
  const r = await perks.resolve({ restaurant: rest(cfg), customer: { _id: "c1" }, subTotal: 500, body: { usePoints: true } });
  assert.equal(r.discount, 40); assert.equal(r.couponCode, "LOYALTY:100");
  const small = await perks.resolve({ restaurant: rest(cfg), customer: { _id: "c1" }, subTotal: 30, body: { usePoints: true } });
  assert.equal(small.discount, 20); assert.equal(small.couponCode, "LOYALTY:50");
  const off = { loyalty: { ...cfg.loyalty, enabled: false } };
  assert.equal((await perks.resolve({ restaurant: rest(off), customer: { _id: "c1" }, subTotal: 500, body: { usePoints: true } })).code, "NO_LOYALTY");
  assert.equal((await perks.overview(rest(off), { _id: "c1" })).loyalty, null);
});

test("config normalizers clamp bad input", () => {
  const c = normalizePerksConfig({ welcomeGift: { enabled: true, discountType: "percent", value: 900 }, loyalty: { enabled: "yes", earnPer: -5 } });
  assert.equal(c.welcomeGift.value, 100); assert.equal(c.loyalty.enabled, false); assert.equal(c.loyalty.earnPer, 1);
  assert.equal(normalizeCoupons("x"), null);
});
