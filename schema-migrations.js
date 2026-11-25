"use strict";
// Small additive migrations applied at startup over the direct Postgres connection, when there is one.
// Every statement is idempotent (IF NOT EXISTS) and only adds. Failures are logged, never thrown.
const STEPS = [
  {
    name: "imenu_customer_addresses.zone_name",
    sql: "ALTER TABLE public.imenu_customer_addresses ADD COLUMN IF NOT EXISTS zone_name text",
  },
];

async function runMigrations(pool, log = console) {
  const result = { applied: [], failed: [] };
  if (!pool || typeof pool.query !== "function") return result;
  for (const step of STEPS) {
    try {
      await pool.query(step.sql);
      result.applied.push(step.name);
    } catch (e) {
      result.failed.push(step.name);
      log.error(`schema migration skipped (${step.name}): ${e.message}`);
    }
  }
  if (result.applied.length) {
    try { await pool.query("NOTIFY pgrst, 'reload schema'"); } catch (e) { /* PostgREST reload is best effort */ }
    log.log(`schema migrations ok: ${result.applied.join(", ")}`);
  }
  return result;
}

module.exports = { runMigrations, STEPS };
