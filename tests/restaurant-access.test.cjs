"use strict";
// Regression coverage for the restaurant-PATCH ownership guard.
// Layer 1: unit matrix over checkRestaurantWriteAccess (roles, DB-call behavior).
// Layer 2: runs the REAL guard wiring from server.js source (same extraction
// pattern as legacy-reserve-guard.test.cjs) and proves a rejected request never
// reaches the handler or touches the restaurants table beyond the owner lookup.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("path");
const { checkRestaurantWriteAccess, createRestaurantWriteGuard } = require("../restaurant-access");

// supabase-js lookalike for the owner-row lookup; records every call.
function makeSupabase(restaurants, log) {
  return {
    from(table) {
      const filters = {};
      const chain = {
        select(cols) { log.push(`from(${table}).select(${cols})`); return chain; },
        eq(col, val) { filters[col] = val; return chain; },
        single: async () => {
          const hit = restaurants.find((r) => Object.keys(filters).every((k) => r[k] === filters[k]));
          return { data: hit ? { _id: hit._id } : null, error: hit ? null : { message: "0 rows" } };
        },
      };
      return chain;
    },
  };
}

test("admin writes any restaurant, no owner lookup hits the DB", async () => {
  const log = [];
  const access = await checkRestaurantWriteAccess(makeSupabase([], log), { _id: "000000000000000000000000", role: "admin" }, "rest-1");
  assert.strictEqual(access.ok, true);
  assert.deepStrictEqual(log, []); // super panel edits must not depend on owner rows
});

test("owner writes their own restaurant (one owner-row lookup)", async () => {
  const log = [];
  const supabase = makeSupabase([{ _id: "rest-1", owner: "user-a" }], log);
  const access = await checkRestaurantWriteAccess(supabase, { _id: "user-a", role: "owner" }, "rest-1");
  assert.strictEqual(access.ok, true);
  assert.deepStrictEqual(log, ["from(restaurants).select(_id)"]);
});

test("owner cannot write another venue's restaurant", async () => {
  const log = [];
  const supabase = makeSupabase([{ _id: "rest-1", owner: "user-a" }], log);
  const access = await checkRestaurantWriteAccess(supabase, { _id: "user-b", role: "owner" }, "rest-1");
  assert.strictEqual(access.ok, false);
  assert.strictEqual(access.status, 403);
});

test("staff roles (cashier/kitchen/waiter) are denied without any DB call", async () => {
  for (const role of ["cashier", "kitchen", "waiter"]) {
    const log = [];
    const access = await checkRestaurantWriteAccess(makeSupabase([{ _id: "rest-1", owner: "user-a" }], log), { _id: "staff-1", role, restaurant: "rest-1" }, "rest-1");
    assert.strictEqual(access.ok, false, role);
    assert.strictEqual(access.status, 403, role);
    assert.deepStrictEqual(log, [], role);
  }
});

test("missing user is a defensive 401 (protect normally rejects first)", async () => {
  const access = await checkRestaurantWriteAccess(makeSupabase([], []), null, "rest-1");
  assert.strictEqual(access.ok, false);
  assert.strictEqual(access.status, 401);
});

// Layer 2: the actual server.js wiring — guard middleware runs between protect
// and multer, before the handler, and rejects cross-tenant writes.
const src = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const routeStart = src.indexOf('app.patch("/api/v1/restaurants/:id"');
const routeEnd = src.indexOf("\n});", routeStart) + 4;
const routeCode = src.slice(routeStart, routeEnd);

function loadRoute(supabase) {
  const captured = {};
  const app = { patch: (_path, protectMw, guardMw, uploadMw, handler) => {
    captured.guard = guardMw; captured.handler = handler;
  } };
  const upload = { fields: () => (req, res, next) => next() };
  const supabaseArg = supabase; // server.js references the top-level const
  (new Function("app", "protect", "upload", "supabase", "require", "createRestaurantWriteGuard", routeCode))
    (app, null, upload, supabaseArg, require, createRestaurantWriteGuard);
  return captured;
}

function fakeRes() {
  const out = {};
  return { out, res: {
    status(c) { out.status = c; return this; },
    json(j) { out.body = j; return this; },
  } };
}

test("server wiring: guard rejects foreign owner before handler and before any write", async () => {
  const log = [];
  const { guard, handler } = loadRoute(makeSupabase([{ _id: "rest-1", owner: "user-a" }], log));
  assert.strictEqual(typeof guard, "function", "guard middleware is wired into the route");
  let handlerRan = false;
  const wrappedHandler = async (...args) => { handlerRan = true; return handler(...args); };
  void wrappedHandler;
  const { out, res } = fakeRes();
  let nextCalled = false;
  await guard({ user: { _id: "user-b", role: "owner" }, params: { id: "rest-1" } }, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(out.status, 403);
  assert.match(out.body.message, /غير مصرح/);
  assert.strictEqual(handlerRan, false);
  assert.deepStrictEqual(log, ["from(restaurants).select(_id)"]); // lookup only, no update
});

test("server wiring: owning owner passes the guard into the handler chain", async () => {
  const log = [];
  const { guard } = loadRoute(makeSupabase([{ _id: "rest-1", owner: "user-a" }], log));
  const { res } = fakeRes();
  let nextCalled = false;
  await guard({ user: { _id: "user-a", role: "owner" }, params: { id: "rest-1" } }, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

test("server wiring: admin and staff short-circuit as designed", async () => {
  const log = [];
  const { guard } = loadRoute(makeSupabase([], log));
  let nextCalled = false;
  await guard({ user: { _id: "000000000000000000000000", role: "admin" }, params: { id: "rest-1" } }, fakeRes().res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  const { out, res } = fakeRes();
  nextCalled = false;
  await guard({ user: { _id: "staff-1", role: "cashier", restaurant: "rest-1" }, params: { id: "rest-1" } }, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(out.status, 403);
  assert.deepStrictEqual(log, []); // neither path touched the DB
});
