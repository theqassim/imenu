"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { Pool } = require("pg");
const { pgReservations, restReservations } = require("../reservations-db");

const url = process.env.TEST_DATABASE_URL;
const skip = !url && "TEST_DATABASE_URL not set";
const base = (o = {}) => ({ restaurant_id: "r_" + (global.__m || "x"), code: "C" + Math.random().toString(36).slice(2, 8), request_key: "k" + Math.random(),
  customer_name: "Test", customer_phone: "0100", party_size: 4, starts_at: "2030-01-01T18:00:00Z", ...o });

for (const mode of ["pg", "rest"]) test("reservations store (" + mode + ")", { skip }, async (t) => {
  const pool = new Pool({ connectionString: url });
  global.__m = mode; let db, emu;
  if (mode === "pg") { db = pgReservations(pool); await db.ensure(); await db.ensure(); }
  else {
    await pgReservations(pool).ensure();
    emu = await require("./helpers/postgrest-emulator.cjs").startEmulator(pool);
    const { createClient } = require("@supabase/supabase-js");
    db = restReservations(createClient(emu.url, "test-service-role-key", { auth: { persistSession: false } }));
    await db.ensure();
  }
  t.after(async () => { if (emu) emu.server.close(); await pool.end(); });

  await t.test("create is idempotent on request_key", async () => {
    const r = base();
    const a = await db.create(r);
    const b = await db.create({ ...r, code: "OTHER" + Math.random() });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.row.id, a.row.id);
    assert.equal((await db.pendingEvents("r_" + global.__m, 1000)).filter((e) => e.reservation_id === a.row.id).length, 1);
  });

  await t.test("two owners approving: only one wins (compare-and-set)", async () => {
    const { row } = await db.create(base());
    const patch = { status: "approved", table_label: "T1", window_start: "2030-01-02T17:45:00Z", window_end: "2030-01-02T19:30:00Z" };
    const [x, y] = await Promise.all([db.transition(row.id, row.version, patch), db.transition(row.id, row.version, patch)]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.equal([x, y].find((z) => !z.ok).reason, "stale");
  });

  await t.test("overlapping window on the same table is rejected by the database", async () => {
    const a = (await db.create(base())).row, b = (await db.create(base())).row;
    const w = { table_label: "T9", status: "approved" };
    const ok = await db.transition(a.id, a.version, { ...w, window_start: "2030-02-01T17:45:00Z", window_end: "2030-02-01T19:30:00Z" });
    const clash = await db.transition(b.id, b.version, { ...w, window_start: "2030-02-01T19:00:00Z", window_end: "2030-02-01T20:30:00Z" });
    const other = await db.transition(b.id, b.version, { ...w, table_label: "T10", window_start: "2030-02-01T19:00:00Z", window_end: "2030-02-01T20:30:00Z" });
    assert.equal(ok.ok, true);
    assert.deepEqual([clash.ok, clash.reason], [false, "conflict"]);
    assert.equal(other.ok, true);
    // back-to-back is allowed
    const c = (await db.create(base())).row;
    const adj = await db.transition(c.id, c.version, { ...w, window_start: "2030-02-01T19:30:00Z", window_end: "2030-02-01T21:00:00Z" });
    assert.equal(adj.ok, true);
  });

  await t.test("archive offer + CAS removal retains active/future/recent and cascades events only after ACK", async () => {
    const rid = "archive_" + mode;
    const cutoff = "2026-11-01T00:00:00Z";
    const past = "2026-10-01T00:00:00Z";
    const make = async (status, extra = {}) => {
      const r = (await db.create(base({ restaurant_id: rid, starts_at: past, ...extra }))).row;
      await pool.query("UPDATE timed_reservations SET status=$1, updated_at=$2 WHERE id=$3", [status, past, r.id]);
      return r.id;
    };
    const ids = [];
    for (const status of ["rejected", "cancelled", "no_show", "expired", "completed"]) ids.push(await make(status));
    const active = [];
    for (const status of ["pending", "approved", "arrived"]) active.push(await make(status));
    const future = await make("cancelled", { starts_at: "2027-01-01T00:00:00Z" });
    const recent = await make("completed");
    await pool.query("UPDATE timed_reservations SET updated_at='2026-11-10T00:00:00Z' WHERE id=$1", [recent]);
    const batch = await db.archiveCandidates(rid, cutoff);
    assert.equal(batch.length, 5);
    assert.deepEqual(new Set(batch.map((r) => r.id)), new Set(ids));
    assert.ok((await db.pendingEvents(rid)).length > 0);
    assert.equal(await db.deleteArchived("wrong_venue", batch[0], cutoff), false);
    assert.equal(await db.deleteArchived(rid, { ...batch[0], version: batch[0].version + 1 }, cutoff), false);
    for (const r of batch) assert.equal(await db.deleteArchived(rid, r, cutoff), true);
    assert.equal(await db.deleteArchived(rid, batch[0], cutoff), false);
    for (const id of [...active, future, recent]) assert.ok(await db.get(id));
    const events = await db.pendingEvents(rid);
    assert.equal(events.some((e) => ids.includes(e.reservation_id)), false);
    const stale = await make("completed");
    const candidate = (await db.archiveCandidates(rid, cutoff)).find((r) => r.id === stale);
    await pool.query("UPDATE timed_reservations SET version=version+1, status='arrived' WHERE id=$1", [stale]);
    assert.equal(await db.deleteArchived(rid, candidate, cutoff), false);
    assert.equal((await db.get(stale)).status, "arrived");
  });

  await t.test("cancelled booking frees the table; events survive ack", async () => {
    const a = (await db.create(base())).row;
    const p = { table_label: "T20", window_start: "2030-03-01T17:00:00Z", window_end: "2030-03-01T19:00:00Z" };
    const ap = await db.transition(a.id, a.version, { ...p, status: "approved" });
    const cx = await db.transition(a.id, ap.row.version, { status: "cancelled" });
    assert.equal(cx.ok, true);
    const b = (await db.create(base())).row;
    assert.equal((await db.transition(b.id, b.version, { ...p, status: "approved" })).ok, true);
    const ev = await db.pendingEvents("r_" + global.__m, 1000);
    await db.ackEvent(ev[0].id);
    assert.ok(await db.get(a.id));
  });
});
