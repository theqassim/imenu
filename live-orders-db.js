"use strict";
// Storage backends for live orders. Same small interface, two implementations:
//  - pgBackend(pool): direct Postgres (creates its own tables). Used when a Postgres URL is configured.
//  - restBackend(supabase): the Supabase REST API with the service-role key the site already uses.
//    The two tables must exist (see sql/live-orders.sql); this backend never runs DDL.
// Interface: ensure(), getKey(rid), setKey(rid, hash, hint), insertOrder(id, rid, payload),
//            oldest(rid), bumpAttempts(row), remove(id).

const TABLE_KEYS = "live_pos_keys";
const TABLE_INBOX = "live_orders_inbox";

function pgBackend(pool) {
  return {
    kind: "pg",
    async ensure() {
      await pool.query(`CREATE TABLE IF NOT EXISTS public.live_pos_keys (
          restaurant_id text PRIMARY KEY,
          key_hash text NOT NULL,
          key_hint text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS public.live_orders_inbox (
          id text PRIMARY KEY,
          restaurant_id text NOT NULL,
          payload jsonb NOT NULL,
          attempts integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
      await pool.query(
        "CREATE INDEX IF NOT EXISTS live_orders_inbox_rest_idx ON public.live_orders_inbox (restaurant_id, created_at)",
      );
      // Private tables: never expose through the public PostgREST API.
      await pool.query("ALTER TABLE public.live_pos_keys ENABLE ROW LEVEL SECURITY");
      await pool.query("ALTER TABLE public.live_orders_inbox ENABLE ROW LEVEL SECURITY");
    },
    async getKey(rid) {
      const { rows } = await pool.query("SELECT key_hash, key_hint FROM public.live_pos_keys WHERE restaurant_id = $1", [
        String(rid),
      ]);
      return rows[0] || null;
    },
    async setKey(rid, hash, hint) {
      await pool.query(
        `INSERT INTO public.live_pos_keys (restaurant_id, key_hash, key_hint)
         VALUES ($1, $2, $3)
         ON CONFLICT (restaurant_id) DO UPDATE SET key_hash = EXCLUDED.key_hash, key_hint = EXCLUDED.key_hint, created_at = now()`,
        [String(rid), hash, hint],
      );
    },
    async insertOrder(id, rid, payload) {
      await pool.query("INSERT INTO public.live_orders_inbox (id, restaurant_id, payload) VALUES ($1, $2, $3)", [
        id,
        String(rid),
        JSON.stringify(payload),
      ]);
    },
    async oldest(rid) {
      const { rows } = await pool.query(
        "SELECT id, payload, created_at FROM public.live_orders_inbox WHERE restaurant_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1",
        [String(rid)],
      );
      return rows[0] || null;
    },
    async bumpAttempts(row) {
      await pool.query("UPDATE public.live_orders_inbox SET attempts = attempts + 1 WHERE id = $1", [row.id]);
    },
    async remove(id) {
      await pool.query("DELETE FROM public.live_orders_inbox WHERE id = $1", [id]);
    },
  };
}

function restBackend(supabase) {
  const fail = (error) => {
    const e = new Error(error.message || "supabase request failed");
    e.code = error.code || (error.status ? "HTTP_" + error.status : "");
    e.rest = true;
    throw e;
  };
  const run = async (q) => {
    const { data, error } = await q;
    if (error) fail(error);
    return data;
  };
  return {
    kind: "rest",
    async ensure() {
      // Both tables must be reachable with the service-role key.
      await run(supabase.from(TABLE_KEYS).select("restaurant_id").limit(1));
      await run(supabase.from(TABLE_INBOX).select("id").limit(1));
    },
    async getKey(rid) {
      const data = await run(
        supabase.from(TABLE_KEYS).select("key_hash, key_hint").eq("restaurant_id", String(rid)).limit(1),
      );
      return (data && data[0]) || null;
    },
    async setKey(rid, hash, hint) {
      await run(
        supabase
          .from(TABLE_KEYS)
          .upsert(
            { restaurant_id: String(rid), key_hash: hash, key_hint: hint, created_at: new Date().toISOString() },
            { onConflict: "restaurant_id" },
          ),
      );
    },
    async insertOrder(id, rid, payload) {
      await run(supabase.from(TABLE_INBOX).insert({ id, restaurant_id: String(rid), payload }));
    },
    async oldest(rid) {
      const data = await run(
        supabase
          .from(TABLE_INBOX)
          .select("id, payload, created_at, attempts")
          .eq("restaurant_id", String(rid))
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(1),
      );
      return (data && data[0]) || null;
    },
    async bumpAttempts(row) {
      await run(
        supabase
          .from(TABLE_INBOX)
          .update({ attempts: (Number(row.attempts) || 0) + 1 })
          .eq("id", row.id),
      );
    },
    async remove(id) {
      await run(supabase.from(TABLE_INBOX).delete().eq("id", id));
    },
  };
}

module.exports = { pgBackend, restBackend };
