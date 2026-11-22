"use strict";
// Durable storage for timed reservations. The reservations table is the only source of truth;
// reservation_events is a delivery log the POS acknowledges (acking never deletes a booking).
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
        `INSERT INTO public.reservations (id, restaurant_id, code, request_key, customer_name, customer_phone, party_size, starts_at, preorder, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (restaurant_id, request_key) DO NOTHING RETURNING ${COLS}`,
        [id, r.restaurant_id, r.code, r.request_key, r.customer_name, r.customer_phone, r.party_size, r.starts_at,
          r.preorder ? JSON.stringify(r.preorder) : null, r.note || null],
      );
      if (rows[0]) {
        await pool.query("INSERT INTO public.reservation_events (restaurant_id, reservation_id, kind) VALUES ($1,$2,'created')", [r.restaurant_id, id]);
        return { created: true, row: rows[0] };
      }
      const dup = await pool.query(`SELECT ${COLS} FROM public.reservations WHERE restaurant_id=$1 AND request_key=$2`, [r.restaurant_id, r.request_key]);
      return { created: false, row: dup.rows[0] };
    },
    async get(id) {
      const { rows } = await pool.query(`SELECT ${COLS} FROM public.reservations WHERE id=$1`, [id]);
      return rows[0] || null;
    },
    async getByCode(code) {
      const { rows } = await pool.query(`SELECT ${COLS} FROM public.reservations WHERE code=$1`, [code]);
      return rows[0] || null;
    },
    async listActive(rid, fromIso) {
      const { rows } = await pool.query(
        `SELECT ${COLS} FROM public.reservations WHERE restaurant_id=$1 AND status IN ('pending','approved','arrived')
         AND starts_at >= $2 ORDER BY starts_at ASC`, [String(rid), fromIso]);
      return rows;
    },
    async listFor(rid) {
      const { rows } = await pool.query(`SELECT ${COLS} FROM public.reservations WHERE restaurant_id=$1 ORDER BY starts_at DESC LIMIT 200`, [String(rid)]);
      return rows;
    },
    async transition(id, expectedVersion, patch) {
      const keys = Object.keys(patch).filter((k) => PATCHABLE.has(k));
      const sets = keys.map((k, i) => `${k} = $${i + 3}`);
      try {
        const { rows } = await pool.query(
          `UPDATE public.reservations SET ${sets.concat(["version = version + 1", "updated_at = now()"]).join(", ")}
           WHERE id = $1 AND version = $2 RETURNING ${COLS}`,
          [id, expectedVersion, ...keys.map((k) => patch[k])]);
        if (!rows[0]) return { ok: false, reason: (await this.get(id)) ? "stale" : "missing" };
        await pool.query("INSERT INTO public.reservation_events (restaurant_id, reservation_id, kind) VALUES ($1,$2,$3)",
          [rows[0].restaurant_id, id, patch.status || "updated"]);
        return { ok: true, row: rows[0] };
      } catch (e) {
        if (e && e.code === "23P01") return { ok: false, reason: "conflict" };
        throw e;
      }
    },
    async pendingEvents(rid, limit = 100) {
      const { rows } = await pool.query(
        "SELECT id, reservation_id, kind, created_at FROM public.reservation_events WHERE restaurant_id=$1 AND acked=false ORDER BY id ASC LIMIT $2",
        [String(rid), limit]);
      return rows;
    },
    async ackEvent(id) { await pool.query("UPDATE public.reservation_events SET acked=true WHERE id=$1", [id]); },
  };
}

module.exports = { pgReservations, newId };
