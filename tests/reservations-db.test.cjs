"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { Pool } = require("pg");
const { pgReservations } = require("../reservations-db");

const url = process.env.TEST_DATABASE_URL;
const skip = !url && "TEST_DATABASE_URL not set";
const base = (o = {}) => ({ restaurant_id: "r1", code: "C" + Math.random().toString(36).slice(2, 8), request_key: "k" + Math.random(),
  customer_name: "Test", customer_phone: "0100", party_size: 4, starts_at: "2030-01-01T18:00:00Z", ...o });

test("reservations store", { skip }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const db = pgReservations(pool);
  await db.ensure();
  await db.ensure(); // idempotent
  t.after(() => pool.end());

  await t.test("create is idempotent on request_key", async () => {
    const r = base();
    const a = await db.create(r);
    const b = await db.create({ ...r, code: "OTHER" + Math.random() });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.row.id, a.row.id);
    assert.equal((await db.pendingEvents("r1", 1000)).filter((e) => e.reservation_id === a.row.id).length, 1);
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

  await t.test("cancelled booking frees the table; events survive ack", async () => {
    const a = (await db.create(base())).row;
    const p = { table_label: "T20", window_start: "2030-03-01T17:00:00Z", window_end: "2030-03-01T19:00:00Z" };
    const ap = await db.transition(a.id, a.version, { ...p, status: "approved" });
    const cx = await db.transition(a.id, ap.row.version, { status: "cancelled" });
    assert.equal(cx.ok, true);
    const b = (await db.create(base())).row;
    assert.equal((await db.transition(b.id, b.version, { ...p, status: "approved" })).ok, true);
    const ev = await db.pendingEvents("r1", 1000);
    await db.ackEvent(ev[0].id);
    assert.ok(await db.get(a.id));
  });
});
