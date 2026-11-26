/* Chefo - iMenu's 3D chef buddy (imenueg.com).
   Drop-in bundle: one <script> tag, zero changes to the site's own code.
   Loads chefo.css + three.min.js + audio/*.mp3 from its own folder. */
(function () {
  "use strict";
  if (window.__chefoLoaded) return;
  window.__chefoLoaded = true;
  var BASE = (function () {
    var s = document.currentScript;
    if (!s) { var a = document.getElementsByTagName("script"); s = a[a.length - 1]; }
    return s && s.src ? s.src.slice(0, s.src.lastIndexOf("/") + 1) : "./";
  })();
  var css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = BASE + "chefo.css";
  document.head.appendChild(css);
  function boot() {

  var ROOT = document;
  var SCROLLER = null;
  var bridge = {
    // The site keeps language in a top-level `let LANG` (not on window), mirrors it
    // to localStorage "imenu-lang" and <html lang>. Read all three, most direct first.
    getLang: function () {
      try { if (typeof window.LANG === "string" && window.LANG) return window.LANG; } catch (e) {}
      try { if (typeof LANG === "string" && LANG) return LANG; } catch (e) {}
      try { var s = localStorage.getItem("imenu-lang"); if (s === "ar" || s === "en") return s; } catch (e) {}
      var hl = ((document.documentElement && document.documentElement.lang) || "").toLowerCase();
      if (hl.indexOf("ar") === 0) return "ar";
      return "en";
    },
    onLangChange: null
  };
  // Hook the site's own language toggle (it sets LANG before calling applyLang,
  // so notify unconditionally; the overlay's nl !== L guard filters no-ops) and
  // poll as a fallback in case the global names differ.
  (function () {
    function hookApply() {
      if (typeof window.applyLang === "function" && !window.applyLang.__chefoHooked) {
        var orig = window.applyLang;
        var wrapped = function () {
          var r = orig.apply(this, arguments);
          if (bridge.onLangChange) { try { bridge.onLangChange(bridge.getLang()); } catch (e) {} }
          return r;
        };
        wrapped.__chefoHooked = true;
        window.applyLang = wrapped;
      }
    }
    hookApply();
    setTimeout(hookApply, 800);
    setTimeout(hookApply, 2500);
    var last = bridge.getLang();
    setInterval(function () {
      var n = bridge.getLang();
      if (n !== last) { last = n; if (bridge.onLangChange) { try { bridge.onLangChange(n); } catch (e) {} } }
    }, 700);
  })();

  var AUDIO_SRC = {
    hero: BASE + "audio/hero.mp3",
    features: BASE + "audio/features.mp3",
    steps: BASE + "audio/steps.mp3",
    partners: BASE + "audio/partners.mp3",
    contact: BASE + "audio/contact.mp3"
  };

  var L = bridge.getLang();

  var LINES = {
    hero: {
      ar: "إزيك! أنا شيفو، صاحبك هنا في iMenu. انزل تحت شوية وأنا هوريك السيستم خطوة خطوة، متقلقش.",
      en: "Hey! I'm Chefo, your buddy here at iMenu. Scroll down and I'll walk you through the system step by step."
    },
    features: {
      ar: "دي المميزات: كاشير سريع، طاولات، طباعة حرارية، مخزون وشيفتات. كله في سيستم واحد.",
      en: "The features: fast cashier, tables, thermal printing, inventory and shifts. All in one system."
    },
    steps: {
      ar: "تلات خطوات بس وتشتغل: سجّل، جهّز المنيو بتاعك، وابدأ بيع.",
      en: "Just 3 steps to go live: sign up, set your menu, and start selling."
    },
    partners: {
      ar: "دي محلات حقيقية شغالة على iMenu دلوقتي.",
      en: "These are real places running on iMenu right now."
    },
    contact: {
      ar: "جاهز تبدأ؟ كلمنا على الأرقام اللي تحت وهنرد عليك على طول.",
      en: "Ready to start? Call the numbers below and we'll answer right away."
    }
  };

  // ---------- DOM ----------
  var wrap = document.createElement("div");
  wrap.id = "chefo-wrap";
  var frame = document.body;
  wrap.innerHTML =
    '<div id="chefo-bubble"><span id="chefo-text"></span></div>' +
    '<div id="chefo-stage">' +
      '<button id="chefo-sound" type="button" aria-label="sound">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/>' +
          '<g class="snd-on"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></g>' +
          '<g class="snd-off"><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></g>' +
        '</svg></button>' +
      '<canvas id="chefo-canvas"></canvas></div>';
  frame.appendChild(wrap);

  // ---------- Tap-to-enter gate (unlocks voice on the tap itself) ----------
  var gate = document.createElement("div");
  gate.id = "chefo-gate";
  gate.innerHTML =
    '<div class="gate-actions">' +
      '<button id="chefo-enter" type="button">' +
        '<span class="pulse"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></svg></span>' +
        '<span>\u062f\u0648\u0633 \u0648\u0627\u0628\u062f\u0623 \u2022 Tap to start</span></button>' +
      '<button id="chefo-skip" type="button">\u0643\u0645\u0651\u0644 \u0645\u0646 \u063a\u064a\u0631 \u0635\u0648\u062a \u2022 Skip without sound</button>' +
    '</div>';
  frame.appendChild(gate);
  wrap.classList.add("gated");
  gate.appendChild(wrap);
  var gateGone = false;
  function leaveGate(withSound) {
    if (gateGone) return;
    gateGone = true;
    if (withSound) { setSound(true); ensureCtx(); }
    gate.classList.add("leave");
    wrap.classList.remove("gated");
    if (withSound) say("hero");
    setTimeout(function () {
      try {
        frame.appendChild(wrap);
        gate.remove();
        wrap.style.transition = "none";
        dockOn = true;
        updateDock();
      } catch (e) {}
    }, 620);
  }
  document.getElementById("chefo-enter").addEventListener("click", function () { leaveGate(true); });
  document.getElementById("chefo-skip").addEventListener("click", function () { leaveGate(false); });

  var bubble = document.getElementById("chefo-bubble");
  var textEl = document.getElementById("chefo-text");
  var canvas = document.getElementById("chefo-canvas");
  var soundBtn = document.getElementById("chefo-sound");

  if (typeof THREE === "undefined") { wrap.style.display = "none"; return; }

  // ---------- Speech ----------
  var soundOn = false;
  var speaking = false;
  var pulse = 0;
  var voices = [];
  function loadVoices() { try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
  if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

  function pickVoice() {
    var pref = (L === "ar") ? ["ar-eg", "ar-sa", "ar"] : ["en-us", "en-gb", "en"];
    for (var i = 0; i < pref.length; i++) {
      for (var j = 0; j < voices.length; j++) {
        var vl = (voices[j].lang || "").toLowerCase().replace("_", "-");
        if (vl.indexOf(pref[i]) === 0) return voices[j];
      }
    }
    return null;
  }

  var curSrc = null, actx = null, audioBufs = {};

  function stopSpeak() {
    // unconditional: an utterance can be queued before onstart fires, and
    // skipping cancel then lets the old language keep playing (user report).
    try { speechSynthesis.cancel(); } catch (e) {} 
    if (curSrc) { try { curSrc.onended = null; curSrc.stop(); } catch (e) {} curSrc = null; }
    if (curAudio) { try { curAudio.pause(); } catch (e) {} curAudio = null; }
    speaking = false;
  }

  function ensureCtx() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === "suspended") { actx.resume().catch(function () {}); }
    return actx;
  }
  function vstatus() {}

  function vstate(s) { wrap.dataset.voice = s; }
  var lastVoiceErr = "";
  function voiceErr(code, e) {
    var d = "";
    if (e) d = (e.name || e.message || ("" + e) || "").slice(0, 32);
    lastVoiceErr = d ? code + ":" + d : code;
    vstate("err-" + code); vstatus(lastVoiceErr);
  }

  function decodeTry(c, url) {
    return fetch(url).then(function (r) {
      if (!r.ok) { throw new Error("http" + r.status); }
      return r.arrayBuffer();
    }).then(function (ab) {
      var p;
      try { p = c.decodeAudioData(ab); } catch (e) { p = null; }
      if (p && typeof p.then === "function") { return p; }
      return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); });
    });
  }

  var curAudio = null;
  function playClipHtml(key, line) {
    try {
      stopSpeak();
      var a = new Audio(AUDIO_SRC[key]);
      curAudio = a;
      vstate("html-" + key); vstatus("html");
      a.onplay = function () { speaking = true; lastVoiceErr = ""; vstate("playing-html-" + key); vstatus("ok-html"); };
      a.onended = function () { speaking = false; if (curAudio === a) curAudio = null; vstate("idle"); };
      a.onerror = function () { speaking = false; if (curAudio === a) curAudio = null; voiceErr("html", a.error ? "media" + a.error.code : "load"); ttsSpeak(line); };
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function (e) { speaking = false; if (curAudio === a) curAudio = null; voiceErr("play", e); ttsSpeak(line); });
      return true;
    } catch (e) { return false; }
  }

  function playClip(key, line) {
    var c = ensureCtx();
    if (!c) {
      voiceErr("noctx");
      return playClipHtml(key, line);
    }
    if (audioBufs[key]) { startClip(c, key, audioBufs[key], line); return true; }
    vstate("loading-" + key); vstatus("loading");
    decodeTry(c, AUDIO_SRC[key]).then(function (buf) {
      audioBufs[key] = buf;
      startClip(c, key, buf, line);
    }).catch(function (e) {
      voiceErr("decode", e);
      if (!playClipHtml(key, line)) ttsSpeak(line);
    });
    return true;
  }

  function startClip(c, key, buf, line) {
    stopSpeak();
    try {
      var s = c.createBufferSource();
      s.buffer = buf;
      s.connect(c.destination);
      curSrc = s;
      speaking = true;
      vstate("playing-" + key); lastVoiceErr = ""; vstatus("ok-clip");
      s.onended = function () { speaking = false; if (curSrc === s) curSrc = null; vstate("idle"); };
      s.start(0);
    } catch (e) {
      speaking = false;
      voiceErr("start", e);
      if (!playClipHtml(key, line)) ttsSpeak(line);
    }
  }

  function speak(key, line) {
    if (!soundOn) return;
    // Egyptian Arabic: pre-recorded clips beat the device's MSA voice.
    if (L === "ar" && AUDIO_SRC[key]) {
      if (playClip(key, line)) return;
    }
    ttsSpeak(line);
  }

  function ttsSpeak(line) {
    if (!soundOn || !("speechSynthesis" in window)) return;
    vstate("tts");
    try {
      loadVoices();
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(line);
      u.lang = (L === "ar") ? "ar-EG" : "en-US";
      var v = pickVoice(); if (v) u.voice = v;
      u.pitch = 1.25; u.rate = 1.02; u.volume = 1;
      u.onstart = function () { speaking = true; };
      u.onend = function () { speaking = false; };
      u.onerror = function () { speaking = false; };
      u.onboundary = function () { pulse = 1; };
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function setSound(on) {
    soundOn = on;
    wrap.classList.toggle("muted", !on);
    if (!on) stopSpeak();
  }
  setSound(false);

  // ---------- Renderer / scene ----------
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  } catch (e) { wrap.style.display = "none"; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(118, 143, false);
  if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(34, 118 / 143, 0.1, 50);
  camera.position.set(0, 0.05, 5.1);
  camera.lookAt(0, -0.05, 0);

  scene.add(new THREE.HemisphereLight(0xfff7e8, 0xcbb996, 0.7));
  var key = new THREE.DirectionalLight(0xffffff, 0.65); key.position.set(2.5, 3.5, 4); scene.add(key);
  var rim = new THREE.DirectionalLight(0xffe3b0, 0.4); rim.position.set(-3, 1.5, -2.5); scene.add(rim);

  var parts = {};

  var bodyAll = null;
  function buildBuddy() {
    var cream = new THREE.MeshStandardMaterial({ color: 0xf7e9cf, roughness: 0.65, metalness: 0.02 });
    var gold  = new THREE.MeshStandardMaterial({ color: 0xc08a2d, roughness: 0.32, metalness: 0.75 });
    var dark  = new THREE.MeshStandardMaterial({ color: 0x33270f, roughness: 0.45 });
    var pink  = new THREE.MeshStandardMaterial({ color: 0xf2b39b, roughness: 0.7 });
    var white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });

    var root = new THREE.Group();
    bodyAll = new THREE.Group();
    root.add(bodyAll);

    var body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 48, 32), cream);
    body.scale.set(1, 0.96, 0.9);
    bodyAll.add(body);
    parts.body = body;

    var hat = new THREE.Group(); hat.position.y = 0.62;
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.53, 0.07, 32), gold);
    band.position.y = 0.0; hat.add(band);
    var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.14, 32), white);
    brim.position.y = 0.08; hat.add(brim);
    var puffG = new THREE.Group(); puffG.position.y = 0.36;
    [[0, 0.14, 0, 0.34], [-0.24, 0.02, 0.02, 0.27], [0.24, 0.02, 0.02, 0.27], [0, 0.02, -0.2, 0.26], [0, 0.05, 0.22, 0.25]].forEach(function (p) {
      var s = new THREE.Mesh(new THREE.SphereGeometry(p[3], 24, 18), white);
      s.position.set(p[0], p[1], p[2]);
      puffG.add(s);
    });
    hat.add(puffG);
    root.add(hat);
    parts.hat = hat;

    function makeEye(side) {
      var g = new THREE.Group(); g.position.set(0.27 * side, 0.16, 0.63);
      var w = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 18), white);
      w.scale.set(1, 1.2, 0.55); g.add(w);
      var pg = new THREE.Group();
      var p = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), dark);
      pg.add(p);
      var h = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      h.position.set(0.025, 0.028, 0.045); pg.add(h);
      pg.position.set(0, 0, 0.085); g.add(pg);
      bodyAll.add(g);
      return { group: g, pupil: pg };
    }
    var eL = makeEye(-1), eR = makeEye(1);
    parts.eyeL = eL.group; parts.eyeR = eR.group;
    parts.pupilL = eL.pupil; parts.pupilR = eR.pupil;

    function brow(side) {
      var b = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.05, 0.05), dark);
      b.position.set(0.28 * side, 0.44, 0.6);
      b.rotation.z = -0.16 * side;
      bodyAll.add(b);
      return b;
    }
    parts.browL = brow(-1); parts.browR = brow(1);

    var mouth = new THREE.Group(); mouth.position.set(0, -0.1, 0.65);
    var smile = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.036, 12, 40, Math.PI * 0.8), dark);
    smile.rotation.z = Math.PI * 1.1;
    mouth.add(smile);
    bodyAll.add(mouth);
    parts.mouth = mouth;

    [-1, 1].forEach(function (s) {
      var c = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), pink);
      c.scale.set(1, 0.7, 0.5);
      c.position.set(0.47 * s, -0.08, 0.53);
      bodyAll.add(c);
    });

    var tie = new THREE.Group(); tie.position.set(0, -0.66, 0.5);
    var c1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), gold);
    c1.rotation.z = Math.PI / 2; c1.position.x = -0.1;
    var c2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), gold);
    c2.rotation.z = -Math.PI / 2; c2.position.x = 0.1;
    var knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), gold);
    tie.add(c1); tie.add(c2); tie.add(knot);
    bodyAll.add(tie);

    function arm(side) {
      var g = new THREE.Group(); g.position.set(0.68 * side, -0.12, 0.08);
      var a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 12), cream);
      a.position.y = -0.21; g.add(a);
      var h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), cream);
      h.position.y = -0.45; g.add(h);
      g.rotation.z = -0.5 * side;
      g.userData.rest = -0.5 * side;
      bodyAll.add(g);
      return g;
    }
    parts.armL = arm(-1);
    parts.armR = arm(1);

    return root;
  }

  var buddy = buildBuddy();
  buddy.scale.setScalar(0.0001);
  scene.add(buddy);

  var shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 24),
    new THREE.MeshBasicMaterial({ color: 0x1b160e, transparent: true, opacity: 0.15, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.28;
  scene.add(shadow);

  // ---------- Animation state ----------
  var clock = new THREE.Clock();
  var t = 0;
  var bornAt = 0.9;
  var freezeQ = -1;
  var waveT = -1;
  var hopY = 0, hopV = 0;
  var squash = 0;
  var nextBlink = 2.2, blinkT = -1;
  var lookX = 0, lookY = 0, lookTX = 0, lookTY = 0;
  var talking = false;
  var started = false;

  function easeOutBack(p) { var c = 1.70158, q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; }

  function wave() { if (waveT < 0) waveT = 0; }
  function hop() { if (hopY === 0) hopV = 2.4; }

  // ---------- Speech bubble ----------
  var curKey = "hero", typing = null, hideTimer = null;
  var TYPE_MS = 26;

  function say(key) {
    curKey = key;
    var entry = LINES[key] || LINES.hero;
    var line = entry[L] || entry.en;
    bubble.dir = (L === "ar") ? "rtl" : "ltr";
    if (typing) { clearInterval(typing); typing = null; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    textEl.textContent = "";
    bubble.classList.add("show");
    talking = true;
    speak(key, line);
    var i = 0;
    typing = setInterval(function () {
      i++;
      textEl.textContent = line.slice(0, i);
      if (i >= line.length) {
        clearInterval(typing); typing = null; talking = false;
        hideTimer = setTimeout(function () { bubble.classList.remove("show"); }, 4000);
      }
    }, TYPE_MS);
  }

  // ---------- Render loop ----------
  var visible = true;
  document.addEventListener("visibilitychange", function () { visible = !document.hidden; if (!visible) stopSpeak(); });

  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.05);
    if (!visible) return;
    t += dt;

    if (freezeQ >= 0) t = bornAt + freezeQ * 1.15;
    var p = (t - bornAt) / 1.15;
    if (p < 0) { renderer.render(scene, camera); return; }
    p = Math.min(p, 1);
    var HAT_END = 0.34;
    var hp = easeOutBack(Math.min(p / HAT_END, 1));
    var pop = p <= HAT_END ? 0 : easeOutBack((p - HAT_END) / (1 - HAT_END));
    if (!started && p >= 1) { started = true; wave(); }

    var bobY = -0.12 + Math.sin(t * 1.6) * 0.07;
    buddy.rotation.z = Math.sin(t * 0.8) * 0.03;
    parts.hat.rotation.z = Math.sin(t * 1.6 + 0.7) * 0.06;
    parts.hat.rotation.x = Math.sin(t * 1.1) * 0.03;

    if (hopV !== 0 || hopY > 0) {
      hopY += hopV * dt;
      hopV -= 9.5 * dt;
      if (hopY <= 0) { hopY = 0; hopV = 0; squash = 0.22; }
    }
    var sq = 1;
    if (squash > 0) { squash -= dt; sq = 1 - Math.sin(Math.max(squash, 0) / 0.22 * Math.PI) * 0.18; }

    buddy.position.y = bobY + hopY;
    buddy.scale.set(1 + (1 - sq) * 0.55, sq, 1 + (1 - sq) * 0.55);
    var bs = Math.max(pop, 0.0001);
    bodyAll.scale.set(bs, bs, bs);
    bodyAll.position.y = -0.768 * (1 - bs);
    parts.hat.scale.setScalar(Math.max(hp, 0.0001));
    parts.hat.position.y = Math.max(-0.733, -0.916 + 1.536 * bs);

    var sh = Math.max(0.55 - hopY * 0.16, 0.25);
    shadow.scale.setScalar(sh / 0.55);
    shadow.material.opacity = Math.max(0.16 - hopY * 0.05, 0.05) * Math.max(hp, pop);

    if (waveT >= 0) {
      waveT += dt;
      var w = Math.min(waveT / 0.28, 1);
      var down = waveT > 1.35 ? Math.max(1 - (waveT - 1.35) / 0.3, 0) : 1;
      var lift = w * down;
      parts.armR.rotation.z = parts.armR.userData.rest - lift * 1.75 + Math.sin(waveT * 13) * 0.35 * lift;
      if (waveT > 1.7) { waveT = -1; parts.armR.rotation.z = parts.armR.userData.rest; }
    } else {
      parts.armR.rotation.z = parts.armR.userData.rest + Math.sin(t * 1.6) * 0.06;
    }
    parts.armL.rotation.z = parts.armL.userData.rest + Math.sin(t * 1.6 + 1.2) * 0.07;

    if (blinkT < 0 && t > nextBlink) blinkT = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      var bp = blinkT / 0.18;
      if (bp >= 1) { blinkT = -1; nextBlink = t + 2.4 + Math.random() * 2.6; parts.eyeL.scale.y = parts.eyeR.scale.y = 1; }
      else { var s = 1 - Math.sin(bp * Math.PI) * 0.92; parts.eyeL.scale.y = parts.eyeR.scale.y = s; }
    }

    lookX += (lookTX - lookX) * Math.min(dt * 6, 1);
    lookY += (lookTY - lookY) * Math.min(dt * 6, 1);
    parts.pupilL.position.x = parts.pupilR.position.x = lookX * 0.045;
    parts.pupilL.position.y = parts.pupilR.position.y = lookY * 0.035;
    buddy.rotation.y = lookX * 0.16;
    buddy.rotation.x = -lookY * 0.07;

    // mouth: typing oscillation + voice word-boundary pulses
    pulse = Math.max(0, pulse - dt * 4);
    var mouthTalk = (talking || speaking);
    var osc = mouthTalk ? Math.abs(Math.sin(t * 16)) * 0.45 : 0;
    parts.mouth.scale.y = 1 + osc + pulse * 0.55;
    parts.mouth.scale.x = 1 - osc * 0.15 - pulse * 0.1;

    renderer.render(scene, camera);
  }
  tick();
  addEventListener("imx-seek", function () {
    var q = parseFloat(document.documentElement.getAttribute("data-imx-seek"));
    freezeQ = isNaN(q) ? -1 : q;
  });

  // ---------- Scroll dock: ride the scroll up to the header, next to the logo ----------
  var dockOn = false;
  function updateDock() {
    if (!dockOn) return;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var p = Math.max(0, Math.min(1, y / 320));
    var e = p * p * (3 - 2 * p);
    var s = 1 + (0.36 - 1) * e;
    wrap.style.setProperty("--cs", s.toFixed(3));
    var canvasW = 118 * s, canvasH = 143 * s;
    var dockRight = 6;
    var dockBottom = 6;
    var logo = document.querySelector("nav .logo");
    if (logo) {
      var lr = logo.getBoundingClientRect();
      if (lr.width > 0) {
        var rtl = L === "ar";
        if (rtl) { dockRight = window.innerWidth - (lr.left - 6); }
        else { dockRight = window.innerWidth - (lr.right + 6 + canvasW); }
        dockBottom = window.innerHeight - (lr.top + lr.height / 2) - canvasH / 2;
      }
    }
    wrap.style.right = (6 + (dockRight - 6) * e).toFixed(1) + "px";
    wrap.style.bottom = (6 + (dockBottom - 6) * e).toFixed(1) + "px";
    if (e > 0.8) { if (!wrap.classList.contains("docked")) wrap.classList.add("docked"); }
    else if (e < 0.6) { if (wrap.classList.contains("docked")) wrap.classList.remove("docked"); }
  }
  addEventListener("resize", function () { updateDock(); });
  if (typeof ResizeObserver !== "undefined") {
    try { new ResizeObserver(function () { updateDock(); }).observe(frame); } catch (e) {}
  }
  if (SCROLLER) {
    SCROLLER.addEventListener("scroll", function () {
      var y = SCROLLER.scrollTop;
      var vel = y - lastSY; lastSY = y;
      lookTY = Math.max(-1, Math.min(1, -vel * 0.02));
      updateDock();
    }, { passive: true });
  }

  // ---------- Input ----------
  addEventListener("pointermove", function (e) {
    lookTX = (e.clientX / innerWidth - 0.5) * 2;
    lookTY = (0.5 - e.clientY / innerHeight) * 2;
  }, { passive: true });

  var lastSY = 0;
  addEventListener("scroll", function () {
    var y = (SCROLLER ? SCROLLER.scrollTop : scrollY);
    var vel = y - lastSY; lastSY = y;
    lookTY = Math.max(-1, Math.min(1, -vel * 0.02));
    updateDock();
  }, { passive: true });

  canvas.addEventListener("click", function () {
    if (!gateGone) { leaveGate(true); return; }
    wave();
    if (!soundOn) setSound(true);
    say(curKey);
  });

  soundBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    setSound(!soundOn);
    if (soundOn) say(curKey);
  });

  // ---------- Section lines ----------
  var secMap = [["header.hero", "hero"], ["#features", "features"], ["#steps", "steps"], ["#partners", "partners"], ["#contact", "contact"]];
  if ("IntersectionObserver" in window) {
    var ioBuddy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && started) {
          var k = e.target.__buddyKey;
          if (k && k !== curKey) { if (soundOn) { say(k); } else { curKey = k; } wave(); }
        }
      });
    }, { threshold: 0.08 });
    secMap.forEach(function (pr) {
      var el = ROOT.querySelector(pr[0]);
      if (el) { el.__buddyKey = pr[1]; ioBuddy.observe(el); }
    });
  }

  // ---------- Cart demo hop ----------
  var lastCount = 0, lastHop = 0;
  setInterval(function () {
    var n = ROOT.querySelectorAll("#ol .rd-ci").length;
    var now = performance.now();
    if (started && n > lastCount && now - lastHop > 1500) { hop(); lastHop = now; }
    lastCount = n;
  }, 600);

  // ---------- Language sync ----------
  bridge.onLangChange = function (nl) {
    if (nl !== L) {
      L = nl;
      stopSpeak();
      if (started) say(curKey);
      setTimeout(updateDock, 60);
    }
  };

  }
  function start() {
    if (document.body) { boot(); }
    else { document.addEventListener("DOMContentLoaded", boot); }
  }
  if (window.THREE) { start(); return; }
  var t = document.createElement("script");
  t.src = BASE + "three.min.js";
  t.onload = start;
  t.onerror = function () { if (window.console) console.warn("chefo: three.min.js failed to load from " + t.src); };
  document.head.appendChild(t);
})();
