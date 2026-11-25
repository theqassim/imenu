"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { runMigrations } = require("../schema-migrations");

test("migrations are additive and idempotent statements", async () => {
  const seen = [];
  const r = await runMigrations({ query: async (q) => { seen.push(q); } }, { log() {}, error() {} });
  assert.deepStrictEqual(r.failed, []);
  assert.ok(seen[0].includes("ADD COLUMN IF NOT EXISTS zone_name"));
  assert.ok(seen.every((q) => !/DROP|DELETE|TRUNCATE|ALTER COLUMN/i.test(q)));
});

test("a DDL failure is logged and never thrown; no pool is a no-op", async () => {
  const errs = [];
  const r = await runMigrations({ query: async () => { throw new Error("permission denied"); } }, { log() {}, error: (m) => errs.push(m) });
  assert.strictEqual(r.failed.length, 1);
  assert.ok(errs[0].includes("permission denied"));
  assert.deepStrictEqual(await runMigrations(null), { applied: [], failed: [] });
});
