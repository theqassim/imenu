"use strict";
// The POS can read and change the timed-reservation settings over its venue socket. Same rules as the web dashboard.
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const { createReservations } = require("../reservations");

function setup(restaurant) {
  const store = {
    getRestaurantById: async (id) => (id === "r1" ? restaurant : null),
    getRestaurantByOwner: async () => restaurant,
    updateRestaurantCustomUI: async (_id, ui) => { restaurant.customUI = ui; },
  };
  const db = { ensure: async () => {}, listFor: async () => [], listActive: async () => [], listActiveFor: async () => [] };
  const res = createReservations({ app: express(), io: null, db, store, connections: new Map(), rateMax: 1000,
    protect: (_q, _r, n) => n(), restrictTo: () => (_q, _r, n) => n(), log: { error() {}, log() {} } });
  const handlers = {};
  const sock = { emit() {}, on: (e, f) => { handlers[e] = f; } };
  return { res, handlers, sock, call: (e, m) => new Promise((r) => handlers[e](m, r)) };
}

test("POS settings over the socket: default off, enable, refuse while legacy is active, never silent", async () => {
  const r = { _id: "r1", customUI: {}, reservationSettings: { isEnabled: false, bookedSeats: 0 } };
  const t = setup(r);
  await t.res.posAttach(t.sock, "r1").catch(() => {});
  const got = await t.call("reservations:settings:get", {});
  assert.deepStrictEqual([got.ok, got.settings.enabled, got.settings.holdAfterMin], [true, false, 90]);

  const bad = await t.call("reservations:settings:set", { timezone: "Nope/Zone" });
  assert.strictEqual(bad.ok, false);

  const on = await t.call("reservations:settings:set", { enabled: true, holdAfterMin: 120 });
  assert.deepStrictEqual([on.ok, on.settings.enabled, on.settings.holdAfterMin], [true, true, 120]);
  assert.strictEqual(r.customUI.timedReservations.enabled, true);

  const off = await t.call("reservations:settings:set", { enabled: false });
  assert.deepStrictEqual([off.ok, off.settings.enabled], [true, false]);

  r.reservationSettings = { isEnabled: false, bookedSeats: 3 };
  const blocked = await t.call("reservations:settings:set", { enabled: true });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.code, "LEGACY_ACTIVE");
  assert.strictEqual(r.customUI.timedReservations.enabled, false);
  r.reservationSettings = { isEnabled: true, bookedSeats: 0 };
  assert.strictEqual((await t.call("reservations:settings:set", { enabled: true })).code, "LEGACY_ACTIVE");

  const none = setup(r); 
  const lost = await new Promise((rr) => { const h = {}; none.res.posAttach({ emit() {}, on: (e, f) => { h[e] = f; } }, "zzz").then(() => h["reservations:settings:set"]({ enabled: true }, rr)); });
  assert.strictEqual(lost.ok, false);
  assert.strictEqual(r.customUI.timedReservations.enabled, false);
});
