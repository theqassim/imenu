"use strict";
// Coupons, welcome gift and loyalty points for customer-app / online-menu orders.
// No new tables: coupons live in the existing `coupons` table (the POS pushes them), the gift and loyalty
// rules live in the restaurant's customUI.perks (the POS pushes them), and each customer's gift status and
// points are worked out from their own orders (orders.couponCode: a coupon code, "WELCOME" or "LOYALTY:<points>").
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const crypto = require("crypto");
const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function normalizePerksConfig(msg) {
  const m = msg && typeof msg === "object" ? msg : {};
  const g = m.welcomeGift && typeof m.welcomeGift === "object" ? m.welcomeGift : {};
  const l = m.loyalty && typeof m.loyalty === "object" ? m.loyalty : {};
  const type = (t) => (t === "fixed" ? "fixed" : "percent");
  const out = {
    welcomeGift: {
      enabled: g.enabled === true,
      discountType: type(g.discountType),
      value: Math.max(0, Math.min(1e6, num(g.value))),
      maxDiscount: Math.max(0, Math.min(1e6, num(g.maxDiscount))),
      minOrderVal: Math.max(0, Math.min(1e6, num(g.minOrderVal))),
      title: clean(g.title, 80),
    },
    loyalty: {
      enabled: l.enabled === true,
      earnPer: Math.max(1, Math.min(1e6, num(l.earnPer, 100))),       // EGP spent per 1 point
      redeemPoints: Math.max(1, Math.min(1e7, Math.floor(num(l.redeemPoints, 100)))), // points needed for one reward
      redeemValue: Math.max(0, Math.min(1e6, num(l.redeemValue, 10))), // EGP off per reward
    },
  };
  if (out.welcomeGift.discountType === "percent") out.welcomeGift.value = Math.min(100, out.welcomeGift.value);
  return out;
}

function normalizeCoupons(list) {
  if (!Array.isArray(list) || list.length > 300) return null;
  const out = []; const seen = new Set();
  for (const c of list) {
    if (!c || typeof c !== "object") return null;
    const code = clean(c.code, 40).toUpperCase();
    if (!/^[A-Z0-9_\-\u0600-\u06FF]{1,40}$/.test(code) || code.startsWith("WELCOME") || code.startsWith("LOYALTY") || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      discountType: c.discountType === "fixed" ? "fixed" : "percent",
      value: Math.max(0, Math.min(1e6, num(c.value))),
      maxDiscount: Math.max(0, Math.min(1e6, num(c.maxDiscount))),
      minOrderVal: Math.max(0, Math.min(1e6, num(c.minOrderVal))),
      usageLimit: Math.max(0, Math.min(1e9, Math.floor(num(c.usageLimit, 1)))),
      usedCount: Math.max(0, Math.min(1e9, Math.floor(num(c.usedCount)))),
      expiresAt: c.expiresAt && !isNaN(new Date(c.expiresAt).getTime()) ? new Date(c.expiresAt).toISOString() : null,
      isActive: c.isActive === false || c.isActive === 0 ? false : true,
    });
  }
  return out;
}

// discount of a rule on a subtotal, or { error, code }
function ruleDiscount(rule, subTotal) {
  if (subTotal < num(rule.minOrderVal)) return { error: `الحد الأدنى ${num(rule.minOrderVal)}`, code: "MIN_ORDER" };
  let d = rule.discountType === "percent" ? (subTotal * num(rule.value)) / 100 : num(rule.value);
  if (rule.discountType === "percent" && num(rule.maxDiscount) > 0 && d > rule.maxDiscount) d = rule.maxDiscount;
  return { discount: round2(Math.max(0, Math.min(subTotal, d))) };
}

function couponCheck(c, subTotal, now = Date.now()) {
  if (!c || c.isActive === false || c.isActive === 0) return { error: "كود غير صحيح", code: "BAD_COUPON" };
  if (c.expiresAt && now > new Date(c.expiresAt).getTime()) return { error: "الكوبون منتهي", code: "COUPON_EXPIRED" };
  if (num(c.usageLimit) > 0 && num(c.usedCount) >= num(c.usageLimit)) return { error: "انتهى عدد مرات الاستخدام", code: "COUPON_USED_UP" };
  return ruleDiscount(c, subTotal);
}

function pointsFromOrders(orders, loyalty) {
  let earned = 0; let spent = 0;
  for (const o of orders || []) {
    if (o.status === "completed") earned += Math.floor(num(o.totalPrice) / loyalty.earnPer);
    const m = /^LOYALTY:(\d+)$/.exec(String(o.couponCode || ""));
    if (m && o.status !== "canceled") spent += Number(m[1]);
  }
  return { earned, spent, balance: Math.max(0, earned - spent) };
}

function createPerks({ supabase, log = console }) {
  const perksOf = (restaurant) => {
    const p = restaurant && restaurant.customUI && restaurant.customUI.perks;
    return p ? normalizePerksConfig(p) : normalizePerksConfig({});
  };
  async function myOrders(restaurantId, customerId) {
    const { data, error } = await supabase.from("orders").select("totalPrice,status,couponCode").eq("restaurant", restaurantId).eq("customerId", customerId).limit(2000);
    if (error) throw error;
    return data || [];
  }
  // The welcome gift belongs to the phone the app is installed on (ANDROID_ID sent by the app), not to the account, so
  // extra accounts do not get it again. A claim is an order with couponCode "WELCOME:<hash of device + venue>"; a canceled order frees it.
  const cleanDeviceId = (v) => { const d = String(v == null ? "" : v).trim(); return /^[A-Za-z0-9_\-]{8,64}$/.test(d) ? d : ""; };
  const claimCode = (restaurantId, deviceId) => "WELCOME:" + crypto.createHash("sha256").update(String(restaurantId) + "|" + deviceId).digest("hex").slice(0, 20);
  async function giftState(restaurant, customer, orders, deviceId) {
    const g = perksOf(restaurant).welcomeGift;
    if (!g.enabled || g.value <= 0) return { available: false };
    const dev = cleanDeviceId(deviceId);
    if (!dev) return { available: false, reason: "NO_DEVICE" };
    if (orders.some((o) => o.status !== "canceled" && String(o.couponCode || "").startsWith("WELCOME:"))) return { available: false };
    const { data } = await supabase.from("orders").select("status").eq("restaurant", restaurant._id).eq("couponCode", claimCode(restaurant._id, dev)).limit(20);
    if ((data || []).some((o) => o.status !== "canceled")) return { available: false };
    return { available: true, code: claimCode(restaurant._id, dev), ...g };
  }

  // What the app shows: gift, points, whether coupons are on.
  async function overview(restaurant, customer, deviceId) {
    const cfg = perksOf(restaurant);
    const orders = customer ? await myOrders(restaurant._id, customer._id) : [];
    const gift = customer ? await giftState(restaurant, customer, orders, deviceId) : { available: false };
    const pts = pointsFromOrders(orders, cfg.loyalty);
    const rewards = Math.floor(pts.balance / cfg.loyalty.redeemPoints);
    return {
      gift: gift.available ? { title: gift.title, discountType: gift.discountType, value: gift.value, maxDiscount: gift.maxDiscount, minOrderVal: gift.minOrderVal } : null,
      loyalty: cfg.loyalty.enabled ? { points: pts.balance, earnPer: cfg.loyalty.earnPer, redeemPoints: cfg.loyalty.redeemPoints, redeemValue: cfg.loyalty.redeemValue, rewardsAvailable: rewards } : null,
    };
  }

  async function findCoupon(restaurantId, code) {
    const { data } = await supabase.from("coupons").select("*").eq("code", code).eq("restaurant", restaurantId).limit(1);
    return data && data[0] ? data[0] : null;
  }

  // Works out the one discount for an order. body: { couponCode?, useGift?, usePoints? } (only one is honoured, in that order).
  async function resolve({ restaurant, customer, subTotal, body, deviceId }) {
    const b = body || {};
    const code = clean(b.couponCode, 40).toUpperCase();
    if (code) {
      const c = await findCoupon(restaurant._id, code);
      const r = couponCheck(c, subTotal);
      if (r.error) return r;
      return { discount: r.discount, couponCode: c.code, commit: async () => { await supabase.from("coupons").update({ usedCount: num(c.usedCount) + 1 }).eq("_id", c._id); } };
    }
    if (b.useGift === true) {
      if (!customer) return { error: "سجل دخولك الأول", code: "LOGIN_REQUIRED" };
      const orders = await myOrders(restaurant._id, customer._id);
      const gs = await giftState(restaurant, customer, orders, deviceId || b.deviceId);
      if (!gs.available) return { error: "الهدية مش متاحة", code: "NO_GIFT" };
      const r = ruleDiscount(gs, subTotal);
      if (r.error) return r;
      return { discount: r.discount, couponCode: gs.code };
    }
    if (b.usePoints === true) {
      if (!customer) return { error: "سجل دخولك الأول", code: "LOGIN_REQUIRED" };
      const cfg = perksOf(restaurant).loyalty;
      if (!cfg.enabled) return { error: "برنامج النقاط مش شغال", code: "NO_LOYALTY" };
      const orders = await myOrders(restaurant._id, customer._id);
      const pts = pointsFromOrders(orders, cfg);
      let rewards = Math.floor(pts.balance / cfg.redeemPoints);
      if (cfg.redeemValue <= 0 || rewards < 1) return { error: "رصيد النقاط مش كفاية", code: "NO_POINTS" };
      rewards = Math.min(rewards, Math.max(1, Math.floor(subTotal / cfg.redeemValue)));
      const discount = round2(Math.min(subTotal, rewards * cfg.redeemValue));
      return { discount, couponCode: "LOYALTY:" + rewards * cfg.redeemPoints };
    }
    return { discount: 0, couponCode: null };
  }

  // POS -> cloud: make the coupons table match the POS list for this restaurant.
  async function syncCoupons(restaurantId, listIn) {
    const list = normalizeCoupons(listIn);
    if (!list) throw new Error("bad coupons");
    const { data: existing, error } = await supabase.from("coupons").select("_id,code").eq("restaurant", restaurantId);
    if (error) throw error;
    const byCode = new Map((existing || []).map((c) => [String(c.code).toUpperCase(), c]));
    for (const c of list) {
      const row = byCode.get(c.code);
      if (row) { const { error: e } = await supabase.from("coupons").update(c).eq("_id", row._id); if (e) throw e; byCode.delete(c.code); }
      else { const { error: e } = await supabase.from("coupons").insert([{ ...c, restaurant: restaurantId }]); if (e) throw e; }
    }
    for (const row of byCode.values()) { await supabase.from("coupons").delete().eq("_id", row._id); }
    return list.length;
  }

  return { cleanDeviceId, overview, resolve, syncCoupons, perksOf };
}

module.exports = { createPerks, normalizePerksConfig, normalizeCoupons, couponCheck, ruleDiscount, pointsFromOrders };
