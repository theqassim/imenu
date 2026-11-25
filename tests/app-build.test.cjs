'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAppBuild } = require('../app-build');

const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const rest = { _id: 'r1', slug: 'fake-cafe', restaurantName: 'Fake <Cafe>', customUI: { primaryColor: '#112233' } };

function harness({ conclusion = 'success', notes = 'Signature: release.', asset = zip, dispatchStatus = 204 } = {}) {
  const calls = []; const writes = []; const uploads = [];
  let reqId = null; let polls = 0;
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', auth: opts.headers && opts.headers.Authorization, body: opts.body });
    const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, arrayBuffer: async () => asset });
    if (url.endsWith('/dispatches')) { reqId = JSON.parse(opts.body).inputs.request_id; return json({}, dispatchStatus); }
    if (url.includes('/actions/runs?')) return json({ workflow_runs: polls++ ? [{ id: 9, display_title: 'Build fake-cafe ' + reqId }] : [] });
    if (url.endsWith('/actions/runs/9')) return json({ id: 9, run_number: 7, status: 'completed', conclusion });
    if (url.includes('/releases/tags/')) return json({ body: notes, assets: [{ id: 5, name: 'iMenu-fake-cafe-v7.apk', size: 7 }] });
    if (url.includes('/releases/assets/5')) return json({});
    throw new Error('unexpected ' + url);
  };
  const ab = createAppBuild({ token: 'T', fetchImpl, sleep: async () => {}, pollMs: 1,
    writeCustomUI: async (id, fn) => { writes.push(fn({ keep: 1 })); }, uploadApk: async (slug, b) => { uploads.push([slug, b.length]); return 'https://cdn/x.apk'; } });
  return { ab, calls, writes, uploads };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test('disabled without token: does nothing', async () => {
  const ab = createAppBuild({ token: '', fetchImpl: async () => { throw new Error('no network'); }, writeCustomUI() {}, uploadApk() {} });
  const r = await ab.start(rest);
  assert.equal(r.code, 'DISABLED');
});

test('happy path: dispatch, poll, download, publish, state done', async () => {
  const h = harness();
  const r = await h.ab.start(rest);
  assert.equal(r.ok, true);
  const d = JSON.parse(h.calls[0].body);
  assert.equal(d.ref, 'main');
  assert.deepEqual([d.inputs.slug, d.inputs.app_name, d.inputs.color], ['fake-cafe', 'Fake Cafe', '#112233']);
  assert.equal(h.calls[0].auth, 'Bearer T');
  await settle();
  assert.deepEqual(h.uploads, [['fake-cafe', 7]]);
  assert.equal(h.writes[0].appApk.url, 'https://cdn/x.apk');
  assert.equal(h.writes[0].appApk.version, 'build 7');
  assert.equal(h.writes[0].keep, 1);
  assert.equal(h.ab.view(rest).state, 'done');
});

test('busy: second start while building is refused, one dispatch only', async () => {
  const h = harness();
  await h.ab.start(rest);
  const r2 = await h.ab.start(rest);
  assert.equal(r2.code, 'BUSY');
  assert.equal(h.calls.filter((c) => c.url.endsWith('/dispatches')).length, 1);
  await settle();
});

test('failed run: nothing published', async () => {
  const h = harness({ conclusion: 'failure' });
  await h.ab.start(rest); await settle();
  assert.equal(h.uploads.length, 0);
  assert.equal(h.ab.view(rest).state, 'failed');
});

test('debug-signed release is never published', async () => {
  const h = harness({ notes: 'Signature: debug.' });
  await h.ab.start(rest); await settle();
  assert.equal(h.uploads.length, 0);
  assert.equal(h.ab.view(rest).state, 'failed');
});

test('non-zip asset is rejected', async () => {
  const h = harness({ asset: Buffer.from('not an apk at all') });
  await h.ab.start(rest); await settle();
  assert.equal(h.uploads.length, 0);
});

test('github refuses dispatch: error, no state stuck', async () => {
  const h = harness({ dispatchStatus: 403 });
  const r = await h.ab.start(rest);
  assert.equal(r.code, 'GITHUB');
  assert.equal(h.ab.view(rest).state, 'idle');
});

test('bad slug is refused before any network call', async () => {
  const h = harness();
  const r = await h.ab.start({ ...rest, slug: 'Bad Slug!' });
  assert.equal(r.code, 'BAD_SLUG');
  assert.equal(h.calls.length, 0);
});

test('firebase config passed only when well formed', () => {
  const h = harness();
  const ok = h.ab.inputsFor({ ...rest, customUI: { appFirebase: { apiKey: 'A'.repeat(39), appId: '1:123456789012:android:abcdef0123', projectId: 'my-proj', senderId: '123456789012' } } }, 'x');
  assert.equal(ok.fb_app_id, '1:123456789012:android:abcdef0123');
  const bad = h.ab.inputsFor({ ...rest, customUI: { appFirebase: { apiKey: 'x', appId: 'y', projectId: 'z', senderId: 'q' } } }, 'x');
  assert.equal(bad.fb_app_id, undefined);
});

test('play link validation: only Google Play app pages, empty clears', () => {
  const { normalizePlayUrl: n } = require('../live-orders');
  assert.equal(n('https://play.google.com/store/apps/details?id=com.imenu.customer.shakercafe'), 'https://play.google.com/store/apps/details?id=com.imenu.customer.shakercafe');
  assert.equal(n('  '), '');
  assert.equal(n('https://play.google.com/store/apps/details?id=com.x.y&hl=ar'), 'https://play.google.com/store/apps/details?id=com.x.y&hl=ar');
  for (const bad of ['http://play.google.com/store/apps/details?id=com.x', 'https://evil.com/store/apps/details?id=com.x', 'javascript:alert(1)', 'https://play.google.com.evil.com/store/apps/details?id=a', 'https://play.google.com/store/apps/details?id=a b']) assert.equal(n(bad), null);
});

test('icon_url: store logo first, then image; none keeps the template icon; junk rejected', () => {
  const h = harness();
  const base = { slug: 'cafe-x', restaurantName: 'X', customUI: {} };
  assert.equal(h.ab.inputsFor({ ...base, storePage: { logo: 'https://res.cloudinary.com/a/logo.png' }, image: 'https://i/x.png' }, 'r').icon_url, 'https://res.cloudinary.com/a/logo.png');
  assert.equal(h.ab.inputsFor({ ...base, image: 'uploads/pic.jpg' }, 'r').icon_url, 'https://www.imenueg.com/uploads/pic.jpg');
  assert.equal(h.ab.inputsFor({ ...base, storePage: { logo: 'http://x.com/l.png' } }, 'r').icon_url, 'https://x.com/l.png');
  assert.equal('icon_url' in h.ab.inputsFor({ ...base }, 'r'), false);
  assert.equal('icon_url' in h.ab.inputsFor({ ...base, storePage: { logo: 'https://x.com/a b"c.png' } }, 'r'), false);
});

test('normalizeAppTheme accepts only known mode, language and hex slots', () => {
  const { normalizeAppTheme: n } = require('../live-orders');
  assert.deepEqual(n({ mode: 'light', language: 'ar', slots: { primary: '#d4af37', card: '' } }), { mode: 'light', slots: { primary: '#D4AF37' }, language: 'ar' });
  assert.deepEqual(n({}), { mode: 'dark', slots: {}, language: '' });
  assert.equal(n({ mode: 'neon' }), null);
  assert.equal(n({ language: 'fr' }), null);
  assert.equal(n({ slots: { primary: 'red' } }), null);
  assert.equal(n({ slots: { evil: '#112233' } }), null);
  assert.equal(n({ slots: { primary: '#12345' } }), null);
});
