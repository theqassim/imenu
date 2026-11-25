const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "menu.html"), "utf8");
const a = html.indexOf("function dvSavedKey()");
const b = html.indexOf("async function submitOrder()");
assert.ok(a > 0 && b > a, "delivery memory block found");
const block = html.slice(a, b);

function makeEnv(stored, zones) {
  const els = { "dv-name": { value: "" }, "dv-phone": { value: "" }, "dv-address": { value: "" } };
  const store = Object.assign({}, stored);
  const win = { __liveSlug: "shaker-cafe", __orderOpts: { zones } };
  const picked = [];
  const ctx = {
    window: win,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    document: { getElementById: (id) => els[id] || null },
    location: { pathname: "/menu/shaker-cafe" },
    dvZones: () => win.__orderOpts.zones,
    dvZonePick: (id) => { picked.push(id); win.__dvZoneId = id; },
  };
  const fn = new Function(...Object.keys(ctx), block + "\nreturn { dvRestoreSaved, dvSaveDetails, dvSavedKey };");
  return { api: fn(...Object.values(ctx)), els, store, win, picked };
}

test("delivery details are saved per venue and restored", () => {
  const e = makeEnv({}, [{ id: "z1", name: "الشروق" }]);
  e.api.dvSaveDetails({ id: "z1", name: "الشروق" }, "أحمد", "01012345678", "شارع 9");
  assert.ok(e.store["dvSaved:shaker-cafe"]);
  const e2 = makeEnv(e.store, [{ id: "z1", name: "الشروق" }]);
  e2.api.dvRestoreSaved();
  assert.strictEqual(e2.els["dv-name"].value, "أحمد");
  assert.strictEqual(e2.els["dv-phone"].value, "01012345678");
  assert.strictEqual(e2.els["dv-address"].value, "شارع 9");
  assert.deepStrictEqual(e2.picked, ["z1"]);
});

test("zone is matched by name when the zone id changed, and skipped when it no longer exists", () => {
  const stored = { "dvSaved:shaker-cafe": JSON.stringify({ name: "a", phone: "1", address: "x", zoneId: "old", zoneName: "الشروق" }) };
  const e = makeEnv(stored, [{ id: "new", name: "الشروق" }]);
  e.api.dvRestoreSaved();
  assert.deepStrictEqual(e.picked, ["new"]);
  const e2 = makeEnv(stored, [{ id: "q", name: "مكان تاني" }]);
  e2.api.dvRestoreSaved();
  assert.deepStrictEqual(e2.picked, []);
});

test("zones that load later are still restored, typed fields are not overwritten again", () => {
  const stored = { "dvSaved:shaker-cafe": JSON.stringify({ name: "أحمد", phone: "010", address: "x", zoneId: "z1", zoneName: "الشروق" }) };
  const e = makeEnv(stored, []);
  e.api.dvRestoreSaved();
  assert.deepStrictEqual(e.picked, []);
  e.els["dv-name"].value = "";
  e.win.__orderOpts.zones = [{ id: "z1", name: "الشروق" }];
  e.api.dvRestoreSaved();
  assert.deepStrictEqual(e.picked, ["z1"]);
  assert.strictEqual(e.els["dv-name"].value, "");
});
