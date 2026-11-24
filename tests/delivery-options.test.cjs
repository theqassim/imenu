'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildOrder, normalizeDeliveryConfig, orderOptions } = require('../live-orders');

const products = [{ _id: 'p1', name: { ar: 'برجر' }, price: 100, sizes: [], category: 'c', isAvailable: true }];
const cfg = { types: { dine_in: true, takeaway: true, delivery: true }, zones: [{ id: 'zone-1', name: 'المعادي', price: 30 }] };
const rest = (c) => ({ taxRate: 10, serviceRate: 12, customUI: c ? { deliveryConfig: c } : {} });
const items = [{ productId: 'p1', qty: 2 }];
const dv = { zoneId: 'zone-1', customerName: 'أحمد', customerPhone: '01000000000', customerAddress: 'شارع 9' };

test('no config: dine_in and takeaway work as before, delivery refused', () => {
  assert.ok(buildOrder({ restaurant: rest(), products, body: { items, orderType: 'takeaway' } }).order);
  assert.ok(buildOrder({ restaurant: rest(), products, body: { items, orderType: 'dine_in', tableNumber: '3' } }).order);
  assert.equal(buildOrder({ restaurant: rest(), products, body: { items, orderType: 'delivery', ...dv } }).code, 'TYPE_DISABLED');
});

test('delivery: fee comes from the zone, not the client; total excludes the fee; no service', () => {
  const r = buildOrder({ restaurant: rest(cfg), products, body: { items, orderType: 'delivery', ...dv, deliveryFee: 0 } });
  assert.equal(r.order.deliveryFee, 30);
  assert.equal(r.order.orderType, 'delivery');
  assert.equal(r.order.serviceAmount, 0);
  assert.equal(r.order.totalPrice, 220);
  assert.equal(r.order.zoneName, 'المعادي');
});

test('delivery validation', () => {
  const b = (o) => buildOrder({ restaurant: rest(cfg), products, body: { items, orderType: 'delivery', ...dv, ...o } }).code;
  assert.equal(b({ zoneId: 'nope' }), 'ZONE_REQUIRED');
  assert.equal(b({ customerName: '' }), 'NAME_REQUIRED');
  assert.equal(b({ customerPhone: '12' }), 'PHONE_REQUIRED');
  assert.equal(b({ customerAddress: '' }), 'ADDRESS_REQUIRED');
});

test('delivery refused when POS is offline, switched off or has no zones', () => {
  const body = { items, orderType: 'delivery', ...dv };
  assert.equal(buildOrder({ restaurant: rest(cfg), products, body, posOnline: false }).code, 'TYPE_DISABLED');
  assert.equal(buildOrder({ restaurant: rest({ ...cfg, types: { ...cfg.types, delivery: false } }), products, body }).code, 'TYPE_DISABLED');
  assert.equal(buildOrder({ restaurant: rest({ ...cfg, zones: [] }), products, body }).code, 'TYPE_DISABLED');
});

test('disabled dine-in/takeaway are refused', () => {
  const r = rest({ types: { dine_in: false, takeaway: true, delivery: false }, zones: [] });
  assert.equal(buildOrder({ restaurant: r, products, body: { items, orderType: 'dine_in', tableNumber: '1' } }).code, 'TYPE_DISABLED');
  assert.ok(buildOrder({ restaurant: r, products, body: { items, orderType: 'takeaway' } }).order);
});

test('normalize and public options', () => {
  const n = normalizeDeliveryConfig({ types: { delivery: true }, zones: [{ id: 'abcd', name: ' س ', price: '5' }, { id: 'abcd', name: 'dup', price: 1 }, { id: 'x', name: 'bad id', price: 1 }, { id: 'efgh', name: 'neg', price: -3 }] });
  assert.equal(n.zones.length, 1);
  assert.equal(n.zones[0].name, 'س');
  const o = orderOptions(rest(cfg), false);
  assert.equal(o.types.delivery, false);
  assert.deepEqual(o.zones, []);
  assert.equal(orderOptions(rest(cfg), true).zones.length, 1);
});
