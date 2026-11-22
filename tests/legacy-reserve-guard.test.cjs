// Runs the real legacy "settings" handler from server.js against a mocked Supabase source.
const test = require("node:test"), assert = require("node:assert"), fs = require("node:fs"), path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const start = src.lastIndexOf('app.patch("/api/v1/reservations/settings"');
const end = src.indexOf("\n});", start) + 4;
const code = src.slice(start, end);
function run(row, body) {
  let handler; const updates = [];
  const app = { patch: (_p, _a, _b, h) => { handler = h; } };
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }), update: (v) => { updates.push(v); return { eq: () => ({ select: () => ({ single: async () => ({ data: { slug: "x", ...row } }) }) }) }; } }) };
  new Function("app", "protect", "restrictTo", "supabase", code)(app, null, () => null, supabase);
  const out = {}; const res = { status(c) { out.status = c; return this; }, json(j) { out.body = j; } };
  return handler({ body, io: null }, res).then(() => ({ out, updates }));
}
test("old counter cannot be turned on while timed reservations are on", async () => {
  const r = await run({ _id: "1", slug: "x", reservationSettings: { isEnabled: false, totalSeats: 10, bookedSeats: 0 }, customUI: { timedReservations: { enabled: true } } }, { restaurantId: "1", isEnabled: true });
  assert.equal(r.out.status, 400); assert.match(r.out.body.message, /الحجز بالميعاد/); assert.equal(r.updates.length, 0);
});
test("old counter works as before when timed is off", async () => {
  const r = await run({ _id: "1", slug: "x", reservationSettings: { isEnabled: false, totalSeats: 10, bookedSeats: 2 }, customUI: { timedReservations: { enabled: false } } }, { restaurantId: "1", isEnabled: true });
  assert.equal(r.out.status, 200); assert.equal(r.updates.length, 1);
});
test("turning the old counter off or editing seats is not blocked by timed being on", async () => {
  const r = await run({ _id: "1", slug: "x", reservationSettings: { isEnabled: true, totalSeats: 10, bookedSeats: 2 }, customUI: { timedReservations: { enabled: true } } }, { restaurantId: "1", isEnabled: false });
  assert.equal(r.out.status, 200);
});
