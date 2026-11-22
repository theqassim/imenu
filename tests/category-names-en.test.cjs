"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { applyCategoryNamesEnOps } = require("../category-names-en");

test("categoryNamesEn ops: set, delete, rename, unrelated keys preserved", () => {
  const base = { heroText: "أهلا", categoryNamesEn: { "مشويات": "Grill" } };
  const added = applyCategoryNamesEnOps(base, { set: { "مشروبات": "Drinks" }, delete: [] });
  assert.deepStrictEqual(added.categoryNamesEn, { "مشويات": "Grill", "مشروبات": "Drinks" });
  assert.strictEqual(added.heroText, "أهلا");

  const renamed = applyCategoryNamesEnOps(base, { set: { "مشويات جديدة": "New Grill" }, delete: ["مشويات"] });
  assert.deepStrictEqual(renamed.categoryNamesEn, { "مشويات جديدة": "New Grill" });
  assert.strictEqual(renamed.heroText, "أهلا");

  const cleared = applyCategoryNamesEnOps(base, { set: {}, delete: ["مشويات"] });
  assert.strictEqual("categoryNamesEn" in cleared, false);
  assert.strictEqual(cleared.heroText, "أهلا");
  assert.deepStrictEqual(base.categoryNamesEn, { "مشويات": "Grill" }); // inputs untouched
});

test("categoryNamesEn ops: malformed input is safe", () => {
  assert.deepStrictEqual(applyCategoryNamesEnOps(null, null), {});
  assert.deepStrictEqual(applyCategoryNamesEnOps({ a: 1 }, "junk"), { a: 1 });
  const out = applyCategoryNamesEnOps({}, { set: { "": "x", "حلويات": 42, "قهوة": " Coffee " }, delete: [null, 7] });
  assert.deepStrictEqual(out, { categoryNamesEn: { "قهوة": "Coffee" } });
});

test("categoryNamesEn ops: concurrent unrelated change survives re-read merge", () => {
  // Simulates the route: server re-reads customUI at write time, so a design change
  // saved by another session before our PATCH is preserved.
  const freshFromOtherSession = { bgType: "image", heroImage: "/x.jpg", categoryNamesEn: { "مشويات": "Grill" } };
  const out = applyCategoryNamesEnOps(freshFromOtherSession, { set: { "مشروبات": "Drinks" }, delete: [] });
  assert.strictEqual(out.bgType, "image");
  assert.strictEqual(out.heroImage, "/x.jpg");
  assert.deepStrictEqual(out.categoryNamesEn, { "مشويات": "Grill", "مشروبات": "Drinks" });
});

// Compare-and-set: a tiny supabase-js lookalike over an in-memory row, with jsonb
// semantic equality on the conditional update (key order and whitespace ignored).
function makeCasClient(row, onWrite) {
  const semEq = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
  const chain = () => {
    const c = {
      _cols: null, _id: null, _eqUI: undefined, _update: null,
      select(cols) { c._cols = cols; return c; },
      update(patch) { c._update = patch; return c; },
      eq(col, val) { if (col === "_id") c._id = val; else c._eqUI = val; return c; },
      single: async () => {
        if (c._update) {
          if (onWrite) onWrite(row); // concurrent session's write lands before ours reaches the DB
          if (!semEq(row.customUI, c._eqUI)) return { data: null, error: null }; // 0 rows matched
          Object.assign(row, c._update);
          return { data: row, error: null };
        }
        return { data: { customUI: JSON.parse(JSON.stringify(row.customUI)) }, error: null };
      },
      then(resolve) { // await on the chain itself (update path without .single in CAS helper)
        const run = async () => {
          if (c._update) {
            if (onWrite) onWrite(row); // concurrent session's write lands before ours reaches the DB
            if (!semEq(row.customUI, c._eqUI)) return { data: [], error: null };
            Object.assign(row, c._update);
            return { data: [{ _id: c._id }], error: null };
          }
          return { data: [{ customUI: JSON.parse(JSON.stringify(row.customUI)) }], error: null };
        };
        return run().then(resolve);
      },
    };
    return c;
  };
  return { from: () => chain() };
}

test("CAS: clean write succeeds in one attempt", async () => {
  const { applyCategoryNamesEnOpsCas } = require("../category-names-en");
  const row = { customUI: { heroText: "أهلا", categoryNamesEn: { "مشويات": "Grill" } } };
  const r = await applyCategoryNamesEnOpsCas(makeCasClient(row), "r1", { set: { "مشروبات": "Drinks" } }, 3);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.attempts, 1);
  assert.deepStrictEqual(row.customUI.categoryNamesEn, { "مشويات": "Grill", "مشروبات": "Drinks" });
  assert.strictEqual(row.customUI.heroText, "أهلا");
});

test("CAS: lost race retries on the fresh value and preserves both writes", async () => {
  const { applyCategoryNamesEnOpsCas } = require("../category-names-en");
  const row = { customUI: { categoryNamesEn: { "مشويات": "Grill" } } };
  let writes = 0;
  // Concurrent session lands its own change between our read and our write, exactly once.
  const client = makeCasClient(row, (r) => {
    if (writes++ === 0) r.customUI = { ...r.customUI, bgType: "image", categoryNamesEn: { "مشويات": "BBQ" } };
  });
  const r = await applyCategoryNamesEnOpsCas(client, "r1", { set: { "مشروبات": "Drinks" } }, 3);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.attempts, 2);
  assert.strictEqual(row.customUI.bgType, "image");
  assert.deepStrictEqual(row.customUI.categoryNamesEn, { "مشويات": "BBQ", "مشروبات": "Drinks" });
});

test("CAS: persistent conflict gives up with ok:false after max attempts", async () => {
  const { applyCategoryNamesEnOpsCas } = require("../category-names-en");
  const row = { customUI: { v: 0 } };
  const client = makeCasClient(row, (r) => { r.customUI = { v: r.customUI.v + 1 }; });
  const r = await applyCategoryNamesEnOpsCas(client, "r1", { set: { "مشروبات": "Drinks" } }, 3);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.attempts, 3);
});

test("CAS: multiple mutations + explicit customUI apply atomically in one write", async () => {
  const { writeCustomUICas } = require("../category-names-en");
  const row = { customUI: { heroText: "أهلا", categoryNamesEn: { "مشويات": "Grill" } } };
  const mutations = [
    (ui) => applyCategoryNamesEnOps(ui, { set: { "مشروبات": "Drinks" } }),
    (ui) => ({ ...ui, orderAnnouncements: [{ id: "a1", title: "عرض" }] }),
    (ui) => ({ ...ui, bgValue: "/uploads/bg.jpg", bgType: "image" }),
  ];
  const explicit = { themeColor: "#4f46e5" };
  const r = await writeCustomUICas(makeCasClient(row), "r1",
    (fresh) => mutations.reduce((ui, f) => f(ui), { ...fresh, ...explicit }), 3);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.attempts, 1);
  assert.strictEqual(row.customUI.heroText, "أهلا");               // untouched key preserved
  assert.strictEqual(row.customUI.themeColor, "#4f46e5");          // explicit client UI applied
  assert.strictEqual(row.customUI.orderAnnouncements[0].id, "a1"); // announcements mutation
  assert.strictEqual(row.customUI.bgValue, "/uploads/bg.jpg");     // upload mutation
  assert.deepStrictEqual(row.customUI.categoryNamesEn, { "مشويات": "Grill", "مشروبات": "Drinks" });
});

test("CAS: retry re-applies mutations onto the fresh value, not the stale read", async () => {
  const { writeCustomUICas } = require("../category-names-en");
  const row = { customUI: { files: { logo: "old.png" } } };
  let writes = 0;
  const client = makeCasClient(row, (r) => {
    if (writes++ === 0) r.customUI = { files: { logo: "new.png" }, note: "concurrent" };
  });
  const r = await writeCustomUICas(client, "r1",
    (fresh) => ({ ...fresh, bgValue: "/uploads/bg.jpg" }), 3);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.attempts, 2);
  assert.strictEqual(row.customUI.note, "concurrent");       // concurrent write survived the upload merge
  assert.strictEqual(row.customUI.files.logo, "new.png");
  assert.strictEqual(row.customUI.bgValue, "/uploads/bg.jpg");
});
