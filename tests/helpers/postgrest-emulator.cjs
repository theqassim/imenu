"use strict";
// Minimal PostgREST look-alike over a real Postgres, enough for the live-orders REST backend.
// Handles exactly the request shapes supabase-js produces for live_pos_keys / live_orders_inbox.
const http = require("http");
const COLS = {
  live_pos_keys: ["restaurant_id", "key_hash", "key_hint", "created_at"],
  live_orders_inbox: ["id", "restaurant_id", "payload", "attempts", "created_at"],
};
const ident = (n) => `"${n}"`;

function parseFilters(url, cols) {
  const where = [];
  const vals = [];
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
    if (!cols.includes(k)) throw Object.assign(new Error("bad column " + k), { status: 400 });
    const m = /^eq\.(.*)$/.exec(v);
    if (!m) throw Object.assign(new Error("unsupported filter"), { status: 400 });
    vals.push(m[1]);
    where.push(`${ident(k)} = $${vals.length}`);
  }
  return { where: where.length ? " WHERE " + where.join(" AND ") : "", vals };
}

function startEmulator(pool, opts = {}) {
  const log = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, "http://x");
      const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
      if (!m) return send(404, { message: "not found" });
      log.push(req.method + " " + url.pathname);
      if (opts.rejectAuth) return send(401, { message: "Invalid API key", code: "PGRST301" });
      const table = m[1];
      const cols = COLS[table];
      if (!cols || opts.missingTables) {
        return send(404, { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` });
      }
      const apikey = req.headers.apikey || "";
      if (!apikey) return send(401, { message: "No API key found in request" });
      if (req.method === "GET") {
        const sel = (url.searchParams.get("select") || "*").split(",").map((s) => s.trim());
        const use = sel[0] === "*" ? cols : sel;
        if (!use.every((c) => cols.includes(c))) return send(400, { code: "42703", message: "bad select" });
        const { where, vals } = parseFilters(url, cols);
        let order = "";
        const ords = url.searchParams.getAll("order").join(",").split(",").filter(Boolean);
        if (ords.length) order = " ORDER BY " + ords.map((o) => { const [c, d] = o.split("."); if (!cols.includes(c)) throw new Error("bad order"); return ident(c) + (d === "desc" ? " DESC" : " ASC"); }).join(", ");
        const limit = url.searchParams.get("limit") ? ` LIMIT ${parseInt(url.searchParams.get("limit"), 10)}` : "";
        const r = await pool.query(`SELECT ${use.map(ident).join(", ")} FROM public.${ident(table)}${where}${order}${limit}`, vals);
        return send(200, r.rows);
      }
      if (req.method === "POST") {
        const body = JSON.parse(raw);
        const rows = Array.isArray(body) ? body : [body];
        const upsert = /resolution=merge-duplicates/.test(req.headers.prefer || "");
        const onConflict = url.searchParams.get("on_conflict");
        for (const row of rows) {
          const keys = Object.keys(row);
          if (!keys.every((k) => cols.includes(k))) return send(400, { code: "PGRST204", message: "unknown column" });
          const vals = keys.map((k) => (row[k] !== null && typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k]));
          let sql = `INSERT INTO public.${ident(table)} (${keys.map(ident).join(", ")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(", ")})`;
          if (upsert && onConflict) {
            sql += ` ON CONFLICT (${ident(onConflict)}) DO UPDATE SET ${keys.filter((k) => k !== onConflict).map((k) => `${ident(k)} = EXCLUDED.${ident(k)}`).join(", ")}`;
          }
          try { await pool.query(sql, vals); } catch (e) {
            if (e.code === "23505") return send(409, { code: "23505", message: e.message });
            throw e;
          }
        }
        return send(201);
      }
      if (req.method === "PATCH" || req.method === "DELETE") {
        const { where, vals } = parseFilters(url, cols);
        if (!where) return send(400, { message: "filter required" });
        if (req.method === "DELETE") {
          await pool.query(`DELETE FROM public.${ident(table)}${where}`, vals);
        } else {
          const body = JSON.parse(raw);
          const keys = Object.keys(body);
          if (!keys.every((k) => cols.includes(k))) return send(400, { code: "PGRST204", message: "unknown column" });
          const set = keys.map((k, i) => `${ident(k)} = $${vals.length + i + 1}`).join(", ");
          await pool.query(`UPDATE public.${ident(table)} SET ${set}${where}`, [...vals, ...keys.map((k) => body[k])]);
        }
        return send(204);
      }
      return send(405, { message: "method" });
    } catch (e) {
      return send(e.status || 500, { code: e.code || "XX000", message: e.message });
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: "http://127.0.0.1:" + server.address().port, log })));
}

module.exports = { startEmulator };
