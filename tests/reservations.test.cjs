"use strict";
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const { Pool } = require("pg");
const { createReservations, planTransition, settingsOf, zonedInstant } = require("../reservations");
const { pgReservations, restReservations } = require("../reservations-db");

const S = settingsOf({ customUI: { timedReservations: { enabled: true } } });
const T0 = Date.parse("2030-05-01T12:00:00Z");
const row = (o) => ({ status: "pending", starts_at: "2030-05-01T18:00:00Z", ...o });

test("planTransition rules", () => {
  const a = planTransition(row(), "approve", { table_label: "5" }, S, T0);
  assert.equal(a.patch.status, "approved");
  assert.equal(a.patch.window_start, "2030-05-01T17:45:00.000Z");
  assert.equal(a.patch.window_end, "2030-05-01T19:30:00.000Z");
  assert.equal(planTransition(row(), "approve", {}, S, T0).error, "TABLE_REQUIRED");
  assert.equal(planTransition(row({ status: "approved" }), "approve", { table_label: "5" }, S, T0).error, "STATE");
  assert.equal(planTransition(row({ status: "approved" }), "no_show", {}, S, T0).error, "TOO_EARLY");
  assert.equal(planTransition(row({ status: "approved" }), "no_show", {}, S, Date.parse("2030-05-01T19:00:00Z")).patch.status, "no_show");
  assert.equal(planTransition(row({ status: "pending" }), "arrived", {}, S, T0).error, "STATE");
  assert.equal(planTransition(row({ status: "arrived" }), "cancel", {}, S, T0).error, "STATE");
  assert.equal(planTransition(row({ starts_at: "2030-05-01T09:00:00Z" }), "approve", { table_label: "1" }, S, T0).error, "PAST");
});

test("venue-zone time: wall clock resolves in the venue zone, not the device", () => {
  const iso = (x) => new Date(x).toISOString();
  assert.equal(iso(zonedInstant("2026-11-23", "20:30", "Africa/Cairo")), "2026-11-23T18:30:00.000Z");
  assert.equal(iso(zonedInstant("2026-07-15", "20:30", "Africa/Cairo")), "2026-07-15T17:30:00.000Z");
  assert.equal(iso(zonedInstant("2026-12-01", "20:30", "America/New_York")), "2026-12-02T01:30:00.000Z");
  for (const bad of [["2026-13-01", "10:00"], ["abc", "10:00"], ["2026-11-23", "25:00"], ["2026-11-23", ""], [null, null]]) assert.ok(Number.isNaN(zonedInstant(bad[0], bad[1], "Africa/Cairo")));
  assert.equal(settingsOf({ customUI: { timedReservations: { timezone: "Nope/Zone" } } }).timezone, "Africa/Cairo");
  assert.equal(settingsOf({ customUI: { timedReservations: { timezone: "Europe/London" } } }).timezone, "Europe/London");
});

const DB = process.env.TEST_DATABASE_URL;
for (const mode of ["pg", "rest"]) {
  test(`reservation routes (${mode})`, { skip: !DB && "TEST_DATABASE_URL not set" }, async (t) => {
    const pool = new Pool({ connectionString: DB });
    await pool.query("DROP TABLE IF EXISTS public.reservation_events, public.reservations");
    let emu, db;
    if (mode === "pg") db = pgReservations(pool);
    else {
      await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$");
      await pgReservations(pool).ensure();
      emu = await require("./helpers/postgrest-emulator.cjs").startEmulator(pool);
      const { createClient } = require("@supabase/supabase-js");
      db = restReservations(createClient(emu.url, "k", { auth: { persistSession: false } }));
    }
    let clock = T0;
    const restaurant = { _id: "rest1", slug: "demo", isActive: true, taxRate: 0, serviceRate: 0, useTableNumbers: false,
      customUI: { timedReservations: { enabled: true } } };
    const store = {
      getRestaurantBySlug: async (s) => (s === "demo" ? restaurant : null),
      getRestaurantById: async (id) => (id === "rest1" ? restaurant : null),
      getRestaurantByOwner: async () => restaurant,
      getProducts: async () => [{ _id: "p1", name: { ar: "برجر كلاسيك" }, price: 100, sizes: [], category: "c", isAvailable: true }],
      updateRestaurantCustomUI: async (id, ui) => { restaurant.customUI = ui; },
    };
    const sockets = new Set();
    const emitted = [];
    const sock = { emit: (e, p) => emitted.push([e, p]), on() {} };
    sockets.add(sock);
    const app = express();
    app.use(express.json());
    const connections = new Map([["rest1", sockets]]);
    const res = createReservations({ app, io: null, db, store, connections, now: () => clock, rateMax: 1000,
      protect: (req, _r, next) => { req.user = { _id: "u1", role: "owner" }; next(); }, restrictTo: () => (_q, _r, next) => next(), log: { error() {}, log() {} } });
    const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
    t.after(async () => { server.close(); if (emu) emu.server.close(); await pool.end(); });
    const base = "http://127.0.0.1:" + server.address().port;
    const api = async (method, path, body) => {
      const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    const good = (o = {}) => ({ name: "منى", phone: "01012345678", partySize: 4, startsAt: "2030-05-02T18:00:00Z", requestKey: "key-" + Math.random().toString(36).slice(2) + "xxxx", ...o });

    await t.test("validation", async () => {
      assert.equal((await api("POST", "/api/v1/timed-reservations/demo", good({ name: "" }))).body.code, "CONTACT");
      assert.equal((await api("POST", "/api/v1/timed-reservations/demo", good({ partySize: 0 }))).body.code, "PARTY");
      assert.equal((await api("POST", "/api/v1/timed-reservations/demo", good({ startsAt: "2030-05-01T12:10:00Z" }))).body.code, "TOO_SOON");
      assert.equal((await api("POST", "/api/v1/timed-reservations/demo", good({ startsAt: "2031-05-01T12:10:00Z" }))).body.code, "TOO_FAR");
      assert.equal((await api("POST", "/api/v1/timed-reservations/nope", good())).status, 404);
    });

    let created;
    await t.test("create with pre-order is idempotent and priced by the server", async () => {
      const body = good({ items: [{ productId: "p1", qty: 2, price: 1 }] });
      const a = await api("POST", "/api/v1/timed-reservations/demo", body);
      const b = await api("POST", "/api/v1/timed-reservations/demo", body);
      assert.equal(a.status, 201); assert.equal(b.status, 200);
      assert.equal(a.body.data.code, b.body.data.code);
      assert.equal(a.body.data.status, "pending");
      assert.equal(a.body.data.phone, undefined);
      created = a.body.data;
      const list = (await api("GET", "/api/v1/timed-reservations")).body.data.reservations;
      assert.equal(list.length, 1);
      assert.equal(list[0].preorder.totalPrice, 200);
      assert.equal(list[0].preorder.items[0].name, "برجر كلاسيك");
      assert.ok(emitted.some(([e]) => e === "reservations:list"));
    });

    await t.test("approve needs a table; conflict and stale are refused cleanly", async () => {
      const list = (await api("GET", "/api/v1/timed-reservations")).body.data.reservations;
      const r1 = list[0];
      assert.equal((await api("POST", `/api/v1/timed-reservations/${r1.id}/approve`, { version: r1.version })).body.code, "TABLE_REQUIRED");
      const ok = await api("POST", `/api/v1/timed-reservations/${r1.id}/approve`, { version: r1.version, table_label: "5" });
      assert.equal(ok.status, 200); assert.equal(ok.body.data.status, "approved");
      const again = await api("POST", `/api/v1/timed-reservations/${r1.id}/approve`, { version: r1.version, table_label: "5" });
      assert.equal(again.status, 409);
      const second = (await api("POST", "/api/v1/timed-reservations/demo", good({ startsAt: "2030-05-02T19:00:00Z" }))).body.data;
      const sr = (await api("GET", "/api/v1/timed-reservations")).body.data.reservations.find((x) => x.code === second.code);
      const clash = await api("POST", `/api/v1/timed-reservations/${sr.id}/approve`, { version: sr.version, table_label: "5" });
      assert.equal(clash.body.code, "TABLE_CONFLICT");
      const free = await api("POST", `/api/v1/timed-reservations/${sr.id}/approve`, { version: sr.version, table_label: "6" });
      assert.equal(free.status, 200);
    });

    await t.test("customer sees status, can cancel; arrived and no_show follow the rules", async () => {
      assert.equal((await api("GET", `/api/v1/timed-reservations/status/${created.code}`)).body.data.status, "approved");
      const r = (await api("GET", "/api/v1/timed-reservations")).body.data.reservations.find((x) => x.code === created.code);
      assert.equal((await api("POST", `/api/v1/timed-reservations/${r.id}/no_show`, {})).body.code, "TOO_EARLY");
      const arr = await api("POST", `/api/v1/timed-reservations/${r.id}/arrived`, {});
      assert.equal(arr.body.data.status, "arrived");
      // Seated guests stay on the POS list however late it gets, until a cashier releases them.
      const keep = clock; clock = new Date(r.startsAt).getTime() + 40 * 3600 * 1000;
      assert.ok((await res.activeFor(restaurant)).some((x) => x.id === r.id && x.status === "arrived"));
      const rel = await api("POST", `/api/v1/timed-reservations/${r.id}/release`, {});
      assert.equal(rel.status, 200);
      assert.ok(!(await res.activeFor(restaurant)).some((x) => x.id === r.id));
      assert.equal((await api("POST", `/api/v1/timed-reservations/${r.id}/release`, {})).status, 409);
      clock = keep;
      assert.equal((await api("POST", `/api/v1/timed-reservations/cancel/${created.code}`)).status, 409);
      const c = (await api("POST", "/api/v1/timed-reservations/demo", good({ startsAt: "2030-05-03T18:00:00Z" }))).body.data;
      assert.equal((await api("POST", `/api/v1/timed-reservations/cancel/${c.code}`)).status, 200);
      assert.equal((await api("GET", `/api/v1/timed-reservations/status/${c.code}`)).body.data.status, "cancelled");
    });

    await t.test("pending request expires after its time; disabled feature refuses", async () => {
      const p = (await api("POST", "/api/v1/timed-reservations/demo", good({ startsAt: "2030-05-04T18:00:00Z" }))).body.data;
      clock = Date.parse("2030-05-04T21:00:00Z");
      assert.equal((await api("GET", `/api/v1/timed-reservations/status/${p.code}`)).body.data.status, "expired");
      restaurant.customUI = { timedReservations: { enabled: false } };
      assert.equal((await api("POST", "/api/v1/timed-reservations/demo", good())).body.code, "DISABLED");
    });

    await t.test("date + time are read in the venue zone (Cairo by default), whatever the device says", async () => {
      clock = T0; restaurant.customUI = { timedReservations: { enabled: true } };
      const r = await api("POST", "/api/v1/timed-reservations/demo", { name: "ليلى", phone: "01012345678", partySize: 2, date: "2030-05-03", time: "20:30", requestKey: "zone-key-" + Math.random().toString(36).slice(2) });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.startsAt, "2030-05-03T17:30:00.000Z"); // Cairo is UTC+3 in May 2030 (DST)
      assert.equal((await api("POST", "/api/v1/timed-reservations/demo", { name: "ليلى", phone: "01012345678", partySize: 2, date: "2030-02-30", time: "20:30", requestKey: "zone-key-bad1xxxx" })).body.code, "TIME");
      const cfgRes = await api("GET", "/api/v1/timed-reservations/config/demo");
      assert.equal(cfgRes.body.data.timezone, "Africa/Cairo");
    });
  });
}

test("rate limit on creating requests", { skip: !DB && "TEST_DATABASE_URL not set" }, async (t) => {
  const express2 = require("express");
  const app = express2(); app.use(express2.json());
  const calls = { n: 0 };
  const store = { getRestaurantBySlug: async () => ({ _id: "r", customUI: { timedReservations: { enabled: true } } }), getRestaurantById: async () => null, getProducts: async () => [] };
  const db = { ensure: async () => {}, create: async (r) => { calls.n++; return { created: true, row: { code: "A", status: "pending", starts_at: r.starts_at, party_size: 2, customer_name: "x" } }; } };
  createReservations({ app, db, store, protect: (_a, _b, n) => n(), restrictTo: () => (_a, _b, n) => n(), now: () => T0, log: { error() {} } });
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  t.after(() => server.close());
  let last;
  for (let i = 0; i < 12; i++) {
    last = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/timed-reservations/x`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "a", phone: "0100000000", partySize: 2, startsAt: "2030-05-02T18:00:00Z", requestKey: "key-" + i + "-abcdef" }) });
  }
  assert.equal(last.status, 429);
  assert.equal(calls.n, 10);
});
