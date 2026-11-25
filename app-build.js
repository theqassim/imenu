"use strict";
// One-tap customer app build per venue. The server asks GitHub Actions to build a branded APK for the venue,
// waits for the run, downloads the signed APK from the release itself, and publishes it to the menu page.
// Disabled (returns DISABLED, does nothing) until APP_BUILD_GITHUB_TOKEN is set on the server.
// The token needs only: Actions Read and write + Contents Read on the single customer-app repo. It is never sent to a client.

const REPO = "theqassim/imenu-customer-app";
const WORKFLOW = "build-apk.yml";
const GH = "https://api.github.com/repos/" + REPO;
const MAX_APK_BYTES = 80 * 1024 * 1024;
const POLL_MS = 10000;
const MAX_WAIT_MS = 20 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;
const MAX_PARALLEL = 3;

function createAppBuild({ token, fetchImpl = fetch, writeCustomUI, uploadApk, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), pollMs = POLL_MS, maxWaitMs = MAX_WAIT_MS, log = console }) {
  const states = new Map(); // restaurantId -> { state, message, startedAt, finishedAt, requestId, version }
  const enabled = () => !!token;

  const gh = (path, opts = {}) => fetchImpl(path.startsWith("http") ? path : GH + path, {
    ...opts,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "imenu-app-build", ...(opts.headers || {}) },
  });

  function inputsFor(restaurant, requestId) {
    const slug = String(restaurant.slug || "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) return null;
    let name = restaurant.restaurantName;
    if (name && typeof name === "object") name = name.ar || name.en || "";
    name = String(name || slug).replace(/[\u0000-\u001f\u007f<>"'\\&]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || slug;
    const ui = restaurant.customUI || {};
    const color = /^#[0-9a-fA-F]{6}$/.test(String(ui.primaryColor || "")) ? ui.primaryColor : "#D4AF37";
    const inputs = { slug, app_name: name, color, request_id: requestId };
    const fb = ui.appFirebase;
    if (fb && /^[\w-]{20,80}$/.test(fb.apiKey || "") && /^[0-9]:[0-9]+:android:[0-9a-f]+$/.test(fb.appId || "") && /^[a-z0-9-]{4,60}$/.test(fb.projectId || "") && /^[0-9]{6,20}$/.test(String(fb.senderId || ""))) {
      Object.assign(inputs, { fb_api_key: fb.apiKey, fb_app_id: fb.appId, fb_project_id: fb.projectId, fb_sender_id: String(fb.senderId) });
    }
    return inputs;
  }

  function view(restaurant) {
    const s = states.get(String(restaurant._id));
    const apk = restaurant.customUI && restaurant.customUI.appApk;
    return {
      enabled: enabled(),
      state: s ? s.state : "idle",
      message: s ? s.message : "",
      startedAt: s ? s.startedAt : null,
      published: !!(apk && apk.url),
      playUrl: (restaurant.customUI && restaurant.customUI.appPlayUrl) || "",
      version: apk && apk.version ? apk.version : "",
      publishedAt: apk && apk.uploadedAt ? apk.uploadedAt : null,
    };
  }

  async function start(restaurant) {
    if (!enabled()) return { ok: false, code: "DISABLED", message: "البناء الأوتوماتيك لسه مش مفعّل على السيرفر" };
    const rid = String(restaurant._id);
    const cur = states.get(rid);
    if (cur && (cur.state === "building" || cur.state === "publishing") && now() - cur.startedAt < maxWaitMs + 60000) return { ok: false, code: "BUSY", message: "التطبيق بيتبني دلوقتي", view: view(restaurant) };
    if (cur && cur.finishedAt && now() - cur.finishedAt < COOLDOWN_MS) return { ok: false, code: "COOLDOWN", message: "استنى شوية وحاول تاني" };
    let running = 0;
    for (const s of states.values()) if (s.state === "building" || s.state === "publishing") running++;
    if (running >= MAX_PARALLEL) return { ok: false, code: "BUSY", message: "في تطبيقات كتير بتتبني، حاول بعد شوية" };

    const requestId = "r" + now().toString(36) + Math.random().toString(36).slice(2, 8);
    const inputs = inputsFor(restaurant, requestId);
    if (!inputs) return { ok: false, code: "BAD_SLUG", message: "اسم المكان (slug) غير صالح لإنشاء تطبيق" };

    let res;
    try {
      res = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main", inputs }) });
    } catch (e) { return { ok: false, code: "GITHUB", message: "تعذر الاتصال بخدمة البناء" }; }
    if (res.status !== 204) {
      log.error("app build dispatch failed:", res.status);
      return { ok: false, code: "GITHUB", message: "تعذر بدء البناء (" + res.status + ")" };
    }
    states.set(rid, { state: "building", message: "بيتبني...", startedAt: now(), requestId, finishedAt: 0 });
    run(restaurant, requestId, inputs.slug).catch((e) => fail(rid, "حصلت مشكلة أثناء البناء"));
    return { ok: true, view: view(restaurant) };
  }

  function fail(rid, message) {
    const s = states.get(rid) || {};
    states.set(rid, { ...s, state: "failed", message, finishedAt: now() });
  }

  async function findRun(requestId, since) {
    const r = await gh(`/actions/runs?event=workflow_dispatch&per_page=30`);
    if (!r.ok) return null;
    const j = await r.json();
    return (j.workflow_runs || []).find((x) => String(x.display_title || x.name || "").includes(requestId)) || null;
  }

  async function run(restaurant, requestId, slug) {
    const rid = String(restaurant._id);
    const t0 = now();
    let found = null;
    while (now() - t0 < maxWaitMs) {
      await sleep(pollMs);
      try {
        if (!found) found = await findRun(requestId, t0);
        if (found) {
          const r = await gh(`/actions/runs/${found.id}`);
          if (r.ok) {
            found = await r.json();
            if (found.status === "completed") break;
          }
        }
      } catch (e) { /* transient, keep polling */ }
    }
    if (!found || found.status !== "completed") return fail(rid, "البناء أخد وقت طويل، حاول تاني");
    if (found.conclusion !== "success") return fail(rid, "البناء فشل");

    states.set(rid, { ...states.get(rid), state: "publishing", message: "بينشر التطبيق..." });
    const tag = `build-${slug}-v${found.run_number}`;
    const rel = await gh(`/releases/tags/${encodeURIComponent(tag)}`);
    if (!rel.ok) return fail(rid, "ملف التطبيق مش موجود");
    const relJson = await rel.json();
    if (!/Signature: release/.test(String(relJson.body || ""))) return fail(rid, "النسخة مش موقّعة بمفتاح ثابت، مش هتتنشر");
    const asset = (relJson.assets || []).find((a) => /\.apk$/i.test(a.name || ""));
    if (!asset || asset.size > MAX_APK_BYTES) return fail(rid, "ملف التطبيق غير صالح");
    const dl = await gh(`/releases/assets/${asset.id}`, { headers: { Accept: "application/octet-stream" } });
    if (!dl.ok) return fail(rid, "تعذر تحميل ملف التطبيق");
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf.length < 4 || buf.length > MAX_APK_BYTES || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) return fail(rid, "ملف التطبيق غير صالح");

    const url = await uploadApk(slug, buf);
    const version = "build " + found.run_number;
    await writeCustomUI(rid, (ui) => ({ ...ui, appApk: { url, version, uploadedAt: new Date().toISOString() } }));
    states.set(rid, { ...states.get(rid), state: "done", message: "التطبيق جاهز وظهر في المنيو", version, finishedAt: now() });
  }

  return { enabled, start, view, states, inputsFor };
}

module.exports = { createAppBuild, REPO };
