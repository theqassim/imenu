const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('retired simulator URLs are handled before static hosting', () => {
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const start = source.indexOf('app.use(/^\\/simulator');
  const end = source.indexOf('app.use(express.static', start);
  assert.ok(start > 0 && end > start);
  let route, handler;
  vm.runInNewContext(source.slice(start, end), {app:{use:(r,h)=>{route=r;handler=h;}}});
  for (const url of ['/simulator','/simulator/','/simulator.html','/simulator.js','/SIMULATOR.HTML']) assert.ok(route.test(url));
  for (const url of ['/menu/test','/owner','/admin.html','/store/test','/reserve/test']) assert.ok(!route.test(url));
  const state = {};
  const res = {set:(k,v)=>state[k]=v,status:(n)=>{state.status=n;return res;},type:()=>res,send:(s)=>state.body=s};
  handler({},res);
  assert.equal(state.status,410);
  assert.equal(state['Cache-Control'],'no-store');
});
test('landing page and static files no longer expose simulator', () => {
  const html = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  assert.ok(!/simulator|المحاكي|heroSim|btnSim/i.test(html));
  assert.ok(!fs.existsSync(path.join(root,'public/simulator.html')));
  assert.ok(!fs.existsSync(path.join(root,'public/simulator.js')));
});
