"use strict";
// Private socket protocol. No cleanup is possible unless a caller supplies an explicit
// per-venue policy with enabled, ownerId and graceDays. No first-connection election.
const crypto = require("crypto");
const TERMINAL = new Set(["rejected", "cancelled", "no_show", "expired", "completed"]);
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}
function digest(row) { return crypto.createHash("sha256").update(canonical(row)).digest("hex"); }
function eligible(row, venue, cutoff) {
  return row && String(row.restaurant_id) === String(venue) && TERMINAL.has(row.status) &&
    Number.isInteger(row.version) && row.version > 0 &&
    Number.isFinite(Date.parse(row.updated_at)) && Number.isFinite(Date.parse(row.starts_at)) &&
    Date.parse(row.updated_at) <= Date.parse(cutoff) && Date.parse(row.starts_at) <= Date.parse(cutoff);
}
function attachArchive({ socket, venue, db, getPolicy, now = Date.now, log = console }) {
  let offered = new Map();
  let chain = Promise.resolve();
  const policy = async (ownerId) => {
    const p = typeof getPolicy === "function" ? await getPolicy(String(venue)) : null;
    if (!p || p.enabled !== true || typeof p.ownerId !== "string" || p.ownerId.length < 16 || p.ownerId !== ownerId ||
        !Number.isInteger(p.graceDays) || p.graceDays < 1 || p.graceDays > 365) return null;
    return { ownerId: p.ownerId, cutoff: new Date(now() - p.graceDays * 86400000).toISOString() };
  };
  const handle = (name, work) => socket.on(name, (m, cb) => {
    const reply = typeof cb === "function" ? cb : () => {};
    chain = chain.then(async () => {
      try { reply(await work(m || {})); }
      catch (e) { log.error("reservation archive failed:", e.message); reply({ ok: false, code: "ARCHIVE_ERROR" }); }
    });
  });
  handle("reservations:archive:pull", async (m) => {
    const p = await policy(m.ownerId);
    if (!p) return { ok: false, code: "ARCHIVE_DISABLED" };
    const rows = await db.archiveCandidates(venue, p.cutoff, 25);
    offered = new Map();
    const records = [];
    for (const raw of rows) {
      // Normalize Dates to the exact JSON that crosses the socket.
      const row = JSON.parse(JSON.stringify(raw));
      if (!eligible(row, venue, p.cutoff)) continue;
      const token = crypto.randomBytes(24).toString("hex");
      const hash = digest(row);
      offered.set(token, { row, hash, ownerId: p.ownerId, expires: now() + 300000 });
      records.push({ token, hash, row });
    }
    return { ok: true, records, venue: String(venue) };
  });
  handle("reservations:archive:ack", async (m) => {
    const p = await policy(m.ownerId);
    if (!p) return { ok: false, code: "ARCHIVE_DISABLED" };
    if (!Array.isArray(m.records) || m.records.length > 25) return { ok: false, code: "BAD_ACK" };
    const deleted = [];
    for (const a of m.records) {
      const offer = a && offered.get(a.token);
      if (!offer || offer.ownerId !== p.ownerId || offer.expires < now() || offer.hash !== a.hash ||
          !eligible(offer.row, venue, p.cutoff)) continue;
      // CAS repeats venue, version, terminal status, timestamps. No blind purge.
      const result = await db.deleteArchived(venue, offer.row, p.cutoff);
      if (result) deleted.push(offer.row.id);
      offered.delete(a.token);
    }
    return { ok: true, deleted };
  });
  socket.on("disconnect", () => { offered.clear(); });
}
module.exports = { attachArchive, canonical, digest, eligible, TERMINAL };
