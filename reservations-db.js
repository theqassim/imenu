"use strict";
// Durable storage for timed reservations. The reservations table is the only source of truth;
// timed_reservation_events is a delivery log the POS acknowledges (acking never deletes a booking).
// Interface: ensure(), create(r), get(id), getByCode(code), listActive(rid, fromIso), listFor(rid),
//   transition(id, expectedVersion, patch) -> {ok, row} | {ok:false, reason: 'stale'|'conflict'|'missing'},
//   pendingEvents(rid, limit), ackEvent(id).
const crypto = require("crypto");

const COLS = `id, restaurant_id, code, request_key, customer_name, customer_phone, party_size, starts_at, status,
  table_label, window_start, window_end, preorder, note, version, created_at, updated_at`;
const PATCHABLE = new Set(["status", "table_label", "window_start", "window_end"]);

function newId() { return "rsv_" + crypto.randomBytes(9).toString("hex"); }

function pgReservations(pool) {
  return {
    kind: "pg",
    async ensure() {
      const fs = require("fs"), path = require("path");
      await pool.query(fs.readFileSync(path.join(__dirname, "sql", "reservations.sql"), "utf8"));
    },
    async create(r) {
      const id = newId();
      const { rows } = await pool.query(
        `INSERT INTO public.timed_reservations (id, restaurant_id, code, request_key, customer_name, customer_phone, party_size, starts_at, preorder, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (restaurant_id, request_key) DO NOTHING RETURNING ${COLS}`,
        [id, r.restaurant_id, r.code, r.request_key, r.customer_name, r.customer_phone, r.party_size, r.starts_at,
          r.preorder ? JSON.stringify(r.preorder) : null, r.note || null],
      );
      if (rows[0]) {
        await pool.query("INSERT INTO public.timed_reservation_events (restaurant_id, reservation_id, kind) VALUES ($1,$2,'created')", [r.restaurant_id, id]);
        return { created: true, row: rows[0] };
      }
      const dup = await pool.query(`SELECT ${COLS} FROM public.timed_reservations WHERE restaurant_id=$1 AND request_key=$2`, [r.restaurant_id, r.request_key]);
      return { created: false, row: dup.rows[0] };
    },
    async get(id) {
      const { rows } = await pool.query(`SELECT ${COLS} FROM public.timed_reservations WHERE id=$1`, [id]);
      return rows[0] || null;
    },
    async getByCode(code) {
      const { rows } = await pool.query(`SELECT ${COLS} FROM public.timed_reservations WHERE code=$1`, [code]);
      return rows[0] || null;
    },
    async listActive(rid, fromIso) {
      const { rows } = await pool.query(
        `SELECT ${COLS} FROM public.timed_reservations WHERE restaurant_id=$1 AND status IN ('pending','approved','arrived')
         AND (starts_at >= $2 OR status = 'arrived') ORDER BY starts_at ASC`, [String(rid), fromIso]);
      return rows;
    },
    async listFor(rid) {
      const { rows } = await pool.query(`SELECT ${COLS} FROM public.timed_reservations WHERE restaurant_id=$1 ORDER BY starts_at DESC LIMIT 200`, [String(rid)]);
      return rows;
    },
    async transition(id, expectedVersion, patch) {
      const keys = Object.keys(patch).filter((k) => PATCHABLE.has(k));
      const sets = keys.map((k, i) => `${k} = $${i + 3}`);
      try {
        const { rows } = await pool.query(
          `UPDATE public.timed_reservations SET ${sets.concat(["version = version + 1", "updated_at = now()"]).join(", ")}
           WHERE id = $1 AND version = $2 RETURNING ${COLS}`,
          [id, expectedVersion, ...keys.map((k) => patch[k])]);
        if (!rows[0]) return { ok: false, reason: (await this.get(id)) ? "stale" : "missing" };
        await pool.query("INSERT INTO public.timed_reservation_events (restaurant_id, reservation_id, kind) VALUES ($1,$2,$3)",
          [rows[0].restaurant_id, id, patch.status || "updated"]);
        return { ok: true, row: rows[0] };
      } catch (e) {
        if (e && e.code === "23P01") return { ok: false, reason: "conflict" };
        throw e;
      }
    },
    async pendingEvents(rid, limit = 100) {
      const { rows } = await pool.query(
        "SELECT id, reservation_id, kind, created_at FROM public.timed_reservation_events WHERE restaurant_id=$1 AND acked=false ORDER BY id ASC LIMIT $2",
        [String(rid), limit]);
      return rows;
    },
    async ackEvent(id) { await pool.query("UPDATE public.timed_reservation_events SET acked=true WHERE id=$1", [id]); },
  };
}

function restReservations(supabase) {
  const fail = (error) => {
    const e = new Error(error.message || "supabase request failed");
    e.code = error.code || (error.status ? "HTTP_" + error.status : "");
    throw e;
  };
  const run = async (q) => { const { data, error } = await q; if (error) fail(error); return data; };
  const one = async (q) => { const d = await run(q); return (d && d[0]) || null; };
  const T = "timed_reservations", E = "timed_reservation_events";
  const self = {
    kind: "rest",
    async ensure() {
      await run(supabase.from(T).select("id").limit(1));
      await run(supabase.from(E).select("id").limit(1));
    },
    async create(r) {
      const id = newId();
      const row = { id, restaurant_id: r.restaurant_id, code: r.code, request_key: r.request_key, customer_name: r.customer_name,
        customer_phone: r.customer_phone, party_size: r.party_size, starts_at: r.starts_at, preorder: r.preorder || null, note: r.note || null };
      const { data, error } = await supabase.from(T).insert(row).select(COLS);
      if (error) {
        if (error.code !== "23505") fail(error);
        // A duplicate request_key is the same booking; a duplicate code is a bad luck collision and must not be hidden.
        const dup = await one(supabase.from(T).select(COLS).eq("restaurant_id", r.restaurant_id).eq("request_key", r.request_key).limit(1));
        if (!dup) fail(error);
        return { created: false, row: dup };
      }
      await run(supabase.from(E).insert({ restaurant_id: r.restaurant_id, reservation_id: id, kind: "created" }));
      return { created: true, row: data[0] };
    },
    async get(id) { return one(supabase.from(T).select(COLS).eq("id", id).limit(1)); },
    async getByCode(code) { return one(supabase.from(T).select(COLS).eq("code", code).limit(1)); },
    async listActive(rid, fromIso) {
      // Two plain queries (no OR filter): the normal window, plus every guest still marked arrived.
      const base = () => supabase.from(T).select(COLS).eq("restaurant_id", String(rid));
      const recent = await run(base().in("status", ["pending", "approved", "arrived"]).gte("starts_at", fromIso).order("starts_at", { ascending: true }));
      const seated = await run(base().eq("status", "arrived").order("starts_at", { ascending: true }));
      const ids = new Set(recent.map((x) => x.id));
      return [...seated.filter((x) => !ids.has(x.id)), ...recent];
    },

    async listFor(rid) {
      return run(supabase.from(T).select(COLS).eq("restaurant_id", String(rid)).order("starts_at", { ascending: false }).limit(200));
    },
    async transition(id, expectedVersion, patch) {
      const set = {};
      for (const k of Object.keys(patch)) if (PATCHABLE.has(k)) set[k] = patch[k];
      set.version = expectedVersion + 1;
      set.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from(T).update(set).eq("id", id).eq("version", expectedVersion).select(COLS);
      if (error) {
        if (error.code === "23P01") return { ok: false, reason: "conflict" };
        fail(error);
      }
      if (!data || !data[0]) return { ok: false, reason: (await self.get(id)) ? "stale" : "missing" };
      // The booking row is the truth. If this event insert fails, the POS still heals on its next full refresh.
      await run(supabase.from(E).insert({ restaurant_id: data[0].restaurant_id, reservation_id: id, kind: patch.status || "updated" }));
      return { ok: true, row: data[0] };
    },
    async pendingEvents(rid, limit = 100) {
      return run(supabase.from(E).select("id, reservation_id, kind, created_at").eq("restaurant_id", String(rid)).eq("acked", false)
        .order("id", { ascending: true }).limit(limit));
    },
    async ackEvent(id) { await run(supabase.from(E).update({ acked: true }).eq("id", id)); },
  };
  return self;
}

module.exports = { pgReservations, restReservations, newId };
