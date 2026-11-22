"use strict";
// Category English-name map (customUI.categoryNamesEn) merge for the owner dashboard.
// The restaurants PATCH route replaces customUI wholesale, so the dashboard sends
// narrow ops instead of a full object: the route re-reads customUI at write time and
// applies these ops, preserving unrelated keys set by other sessions.
// Ops shape: { set: { "<arabic name>": "<english name>", ... }, delete: ["<arabic name>", ...] }

function applyCategoryNamesEnOps(currentUI, ops) {
  const ui = currentUI && typeof currentUI === "object" && !Array.isArray(currentUI) ? { ...currentUI } : {};
  const map = ui.categoryNamesEn && typeof ui.categoryNamesEn === "object" && !Array.isArray(ui.categoryNamesEn)
    ? { ...ui.categoryNamesEn } : {};
  const o = ops && typeof ops === "object" ? ops : {};
  const dels = Array.isArray(o.delete) ? o.delete : [];
  for (const k of dels) {
    if (typeof k === "string" && k) delete map[k];
  }
  const sets = o.set && typeof o.set === "object" && !Array.isArray(o.set) ? o.set : {};
  for (const k of Object.keys(sets)) {
    const v = sets[k];
    if (typeof k !== "string" || !k.trim()) continue;
    if (typeof v === "string" && v.trim()) map[k] = v.trim().slice(0, 120);
    else delete map[k];
  }
  if (Object.keys(map).length) ui.categoryNamesEn = map;
  else delete ui.categoryNamesEn;
  return ui;
}

module.exports = { applyCategoryNamesEnOps };

// Revision-checked write of the ops result: a single conditional UPDATE per attempt
// (WHERE _id AND customUI = the value just read — PostgREST jsonb equality is semantic),
// retried when a concurrent write wins the race. `client` is the small slice of the
// supabase-js API the restaurants route uses, so tests can stub it.
async function applyCategoryNamesEnOpsCas(client, restaurantId, ops, maxAttempts) {
  const attempts = maxAttempts || 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data: row, error: readErr } = await client
      .from("restaurants")
      .select("customUI")
      .eq("_id", restaurantId)
      .single();
    if (readErr) throw readErr;
    const current = row && row.customUI && typeof row.customUI === "object" ? row.customUI : {};
    const merged = applyCategoryNamesEnOps(current, ops);
    const { data: wrote, error: writeErr } = await client
      .from("restaurants")
      .update({ customUI: merged })
      .eq("_id", restaurantId)
      .eq("customUI", current)
      .select("_id");
    if (writeErr) throw writeErr;
    if (Array.isArray(wrote) && wrote.length > 0) return { ok: true, attempts: attempt + 1, customUI: merged };
  }
  return { ok: false, attempts };
}

module.exports = { applyCategoryNamesEnOps, applyCategoryNamesEnOpsCas };
