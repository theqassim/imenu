"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { attachArchive, digest } = require("../reservation-archive");
const ownerId = "a".repeat(48);
const row = (o = {}) => ({ id: "rsv_one", restaurant_id: "venue1", status: "completed", version: 4,
  starts_at: "2026-10-01T18:00:00Z", updated_at: "2026-10-01T20:00:00Z", customer_name: "Archive test",
  preorder: null, ...o });
function setup(options = {}) {
  const handlers = {}, deleted = [], rows = options.rows || [row()];
  let p = options.disabled ? null : { enabled: true, ownerId, graceDays: 7 };
  const socket = { on: (event, fn) => handlers[event] = fn };
  attachArchive({ socket, venue: "venue1", now: () => Date.parse("2026-11-20T00:00:00Z"),
    getPolicy: options.noPolicy ? undefined : async () => p,
    log: { error() {} }, db: {
      archiveCandidates: async (_v, _c, limit) => rows.slice(0, limit),
      deleteArchived: async (_v, r) => { if (options.stale) return false; deleted.push(r); return true; },
    } });
  return { deleted, policy: (x) => p = x, call: (e, body) => new Promise((resolve) => handlers[e](body, resolve)) };
}
test("default deny, disabled policy, wrong installation, invalid grace all refuse", async () => {
  for (const options of [{ noPolicy: true }, { disabled: true }, {}]) {
    const t = setup(options);
    const got = await t.call("reservations:archive:pull", { ownerId: options.noPolicy || options.disabled ? ownerId : "b".repeat(48) });
    assert.equal(got.code, "ARCHIVE_DISABLED");
    assert.equal(t.deleted.length, 0);
  }
  const t = setup(); t.policy({ enabled: true, ownerId, graceDays: 0 });
  assert.equal((await t.call("reservations:archive:pull", { ownerId })).ok, false);
});
test("terminal-only offer including no preorder, future and active rows retained", async () => {
  const t = setup({ rows: [row(), row({ status: "pending" }), row({ status: "approved" }), row({ status: "arrived" }),
    row({ starts_at: "2026-12-01T00:00:00Z" }), row({ updated_at: "2026-11-19T00:00:00Z" }), row({ restaurant_id: "other" })] });
  const got = await t.call("reservations:archive:pull", { ownerId });
  assert.equal(got.records.length, 1);
  assert.equal(got.records[0].row.preorder, null);
  assert.equal(got.records[0].hash, digest(got.records[0].row));
  assert.equal(t.deleted.length, 0);
  const ack = await t.call("reservations:archive:ack", { ownerId, records: got.records.map(({ token, hash }) => ({ token, hash })) });
  assert.deepEqual(ack.deleted, ["rsv_one"]);
});
test("forged, wrong hash, revoked policy, lost socket offer and stale row cannot delete", async () => {
  const t = setup();
  const { records } = await t.call("reservations:archive:pull", { ownerId });
  for (const a of [{ token: "x", hash: records[0].hash }, { token: records[0].token, hash: "bad" }])
    assert.deepEqual((await t.call("reservations:archive:ack", { ownerId, records: [a] })).deleted, []);
  t.policy(null);
  assert.equal((await t.call("reservations:archive:ack", { ownerId, records })).ok, false);
  const reconnect = setup();
  assert.deepEqual((await reconnect.call("reservations:archive:ack", { ownerId, records })).deleted, []);
  const stale = setup({ stale: true });
  const offered = await stale.call("reservations:archive:pull", { ownerId });
  assert.deepEqual((await stale.call("reservations:archive:ack", { ownerId, records: offered.records })).deleted, []);
});
test("repeated pull invalidates old tokens, successful ACK repeats harmlessly", async () => {
  const t = setup();
  const first = await t.call("reservations:archive:pull", { ownerId });
  const second = await t.call("reservations:archive:pull", { ownerId });
  assert.deepEqual((await t.call("reservations:archive:ack", { ownerId, records: first.records })).deleted, []);
  assert.equal((await t.call("reservations:archive:ack", { ownerId, records: second.records })).deleted.length, 1);
  assert.deepEqual((await t.call("reservations:archive:ack", { ownerId, records: second.records })).deleted, []);
  assert.equal(t.deleted.length, 1);
});
