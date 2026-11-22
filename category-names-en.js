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
