'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writeCustomUI } = require('../custom-ui-write');
function client(row, { casError = false, casEmpty = false } = {}) {
  return { from: () => {
    let mode = 'select', patch, conds = [];
    const q = {
      select(c) { if (mode === 'update') { return q; } mode = 'select'; return q; },
      update(p) { mode = 'update'; patch = p; return q; },
      eq(k, v) { conds.push([k, v]); return q; },
      single: async () => ({ data: { customUI: row.customUI }, error: null }),
      then(res) {
        if (mode !== 'update') return res({ data: null, error: null });
        const cas = conds.some(([k]) => k === 'customUI');
        if (cas && casError) return res({ data: null, error: { message: 'bad json' } });
        if (cas && (casEmpty || conds.find(([k]) => k === 'customUI')[1] !== JSON.stringify(row.customUI))) return res({ data: [], error: null });
        row.customUI = patch.customUI; return res({ data: [{ _id: 'r' }], error: null });
      },
    };
    return q;
  } };
}
const add = (ui) => ({ ...ui, deliveryConfig: { types: { delivery: true }, zones: [] } });
test('revision-checked write keeps other keys', async () => {
  const row = { customUI: { liveOrders: { enabled: true }, color: 'x' } };
  const r = await writeCustomUI(client(row), 'r', add);
  assert.equal(r.ok, true); assert.equal(r.fallback, undefined);
  assert.equal(row.customUI.color, 'x'); assert.equal(row.customUI.deliveryConfig.types.delivery, true);
});
test('falls back to a plain update when the check errors', async () => {
  const row = { customUI: { color: 'x' } };
  const r = await writeCustomUI(client(row, { casError: true }), 'r', add);
  assert.equal(r.fallback, true); assert.equal(row.customUI.color, 'x'); assert.ok(row.customUI.deliveryConfig);
});
test('falls back when the check never matches', async () => {
  const row = { customUI: {} };
  const r = await writeCustomUI(client(row, { casEmpty: true }), 'r', add);
  assert.equal(r.fallback, true); assert.ok(row.customUI.deliveryConfig);
});
