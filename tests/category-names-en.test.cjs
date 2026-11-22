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
