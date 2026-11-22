/* iMenu online - Arabic/English interface engine for customer pages (menu, booking).
 * Translates interface strings only; venue data (place, product and category names)
 * is handled by the pages themselves and never touched here.
 * Language stored in localStorage 'imenu_lang' (default 'ar').
 */
(function () {
  'use strict';
  var DICT = {
    // ---- shared / menu ----
    "سلة الطلب": "Cart",
    "فاتورة الطلب": "Order bill",
    "الإجمالي:": "Total:",
    "المجموع:": "Subtotal:",
    "خصم العرض:": "Offer discount:",
    "لديك كوبون خصم؟": "Have a discount coupon?",
    "أدخل الكود": "Enter the code",
    "تطبيق": "Apply",
    "رقم الطاولة (Table No):": "Table number:",
    "اكتب رقم الطاولة هنا...": "Type your table number...",
    "من فضلك اكتب رقم الطاولة لاستكمال طلب الصالة": "Please enter the table number to complete your dine-in order",
    "إرسال الطلب": "Send order",
    "جاري إرسال الطلب للمكان...": "Sending your order to the venue...",
    "تم إرسال طلبك للمكان": "Your order has been sent to the venue",
    "جاري إرسال الطلب للتحضير...": "Sending your order for preparation...",
    "صالة 🍽️": "Dine-in 🍽️",
    "صالة": "Dine-in",
    "تيك أواي 🛍️": "Takeaway 🛍️",
    "تيك أواي": "Takeaway",
    "🛍️ تيك أواي": "🛍️ Takeaway",
    "🍽️ طاولة:": "🍽️ Table:",
    "ج.م": "EGP",
    "تحب تطلب إيه النهاردة؟": "What would you like?",
    "راجع السلة وأكّد الطلب 🛒": "Review your cart and confirm 🛒",
    "كمّل اختيارك 🔥": "Pick your items 🔥",
    "ابدأ اطلب دلوقتي 🔥": "Start your order now 🔥",
    "ابدأ اطلب دلوقتي": "Start your order now",
    "قائمة المأكولات والمشروبات": "Food & drinks menu",
    "🗓️ احجز طاولة": "🗓️ Book a table",
    "احجز طاولة": "Book a table",
    "طلبي الحالي": "My current order",
    "سجل طلباتك اليوم": "Your orders today",
    "استقبال الطلبات من المنيو متوقف مؤقتًا، تقدر تتصفح المنيو وتطلب من الكاشير مباشرة": "Online ordering is paused right now. You can browse the menu and order directly from the cashier",
    "عذراً، هذا المنيو غير متاح حالياً": "Sorry, this menu is currently unavailable",
    "يرجى التواصل مع إدارة المكان.": "Please contact the venue management.",
    "هذا المنيو يعمل بنسخة تجريبية مؤقتة.": "This menu is running on a temporary trial version.",
    "الأحجام والأسعار المتاحة:": "Available sizes and prices:",
    "اختر الحجم المناسب:": "Choose a size:",
    "⛔ عذراً، لقد استخدمت هذا الكوبون سابقاً على هذا الجهاز.": "⛔ Sorry, this coupon was already used on this device.",
    "جاري التحقق...": "Checking...",
    "خطأ في الاتصال": "Connection error",
    "✅ الخصم متطبق على طلبك — وفّرت": "✅ Discount applied to your order — you saved",
    "إلغاء 🗑️": "Remove 🗑️",
    "هل تريد إلغاء الطلب؟": "Cancel this order?",
    "نعم، إلغاء": "Yes, cancel",
    "تراجع": "Keep it",
    "تم إلغاء الطلب": "Order cancelled",
    "فشل الاتصال بالسيرفر": "Could not reach the server",
    "قيد الانتظار ⏳": "Pending ⏳",
    "جاري التحضير 👨‍🍳": "Being prepared 👨‍🍳",
    "جاهز / مكتمل ✅": "Ready ✅",
    "ملغي ❌": "Cancelled ❌",
    "تم استلام طلبك!": "Your order has been received!",
    "جاري تحضير طلبك الآن.": "Your order is being prepared now.",
    "✅ الطلب جاهز!": "✅ Your order is ready!",
    "طلبك جاهز للاستلام أو في الطريق إليك.": "Your order is ready for pickup or on its way to you.",
    "❌ تم إلغاء الطلب": "❌ Order cancelled",
    "نعتذر، تم إلغاء طلبك من قبل الإدارة.": "Sorry, your order was cancelled by management.",
    "👨‍🍳 بدأ التحضير!": "👨‍🍳 Preparation started!",
    "شكراً": "Thank you",
    "مسح السجل": "Clear history",
    "تم مسح السجل": "History cleared",
    "تم تحديث القائمة 🔄": "Menu updated 🔄",
    "سيتم حذفه من القائمة": "It will be removed from the list",
    "استمتع بالعرض": "Enjoy the offer",
    "⏳ العرض ينتهي خلال": "⏳ Offer ends in",
    "⏳ انتهى": "⏳ Ended",
    "⚡ عرض خاص على الفاتورة كلها": "⚡ Special offer on your whole bill",
    "على المنيو بالكامل": "on the whole menu",
    "% على طلبك": "% off your order",
    "حدثت مشكلة، حاول مرة أخرى": "Something went wrong, please try again",
    "حدث مشكلة في الاتصال، حاول مرة أخرى": "Connection problem, please try again",
    "تنبيه": "Note",
    "تمام": "OK",
    "خطأ": "Error",
    "إغلاق": "Close",
    "خصم": "Discount",
    "ضريبة": "Tax",
    "خدمة": "Service",
    "يوم": "Day",
    "ساعة": "Hour",
    "دقيقة": "Min",
    "ثانية": "Sec",
    // ---- booking ----
    "خطوات الحجز": "Booking steps",
    "ميعاد الحجز": "Booking time",
    "أيام الحجز": "Booking days",
    "تقليل عدد الأشخاص": "Decrease party size",
    "زيادة عدد الأشخاص": "Increase party size",
    "بيانات التواصل": "Contact details",
    "الاسم اللي هنسجّل بيه الحجز": "The name we will book under",
    "مناسبة خاصة، كرسي أطفال، أو أي طلب تاني…": "Special occasion, high chair, or any other request…",
    "الطلب المسبق الاختياري": "Optional pre-order",
    "الخطوة السابقة": "Previous step",
    "الميعاد ده فات أو قريب جدًا، اختار وقت أبعد": "That slot has passed or is too soon — pick a later time",
    "فات أو قريب": "Passed or too soon",
    "الساعة اللي تناسبك": "The time that suits you",
    "الساعة": "Time",
    "في انتظار موافقة المكان": "Waiting for the venue approval",
    "الصفحة بتتحدث لوحدها أول ما المكان يرد. تقدر ترجع لها بنفس المتصفح في أي وقت.": "This page updates itself as soon as the venue replies. You can come back to it in this browser anytime.",
    "تمت الموافقة": "Approved",
    "طاولتك محجوزة. مستنيينك في الميعاد.": "Your table is booked. See you at your slot.",
    "المكان مش قادر يقبل الحجز ده": "The venue could not accept this booking",
    "تقدر تجرب ميعاد تاني.": "You can try another time.",
    "الحجز اتلغى": "Booking cancelled",
    "الطلب انتهى من غير رد": "The request expired without a reply",
    "تقدر تبعت طلب جديد.": "You can send a new request.",
    "تم تسجيل وصولك": "Your arrival has been recorded",
    "بالهنا.": "Enjoy!",
    "الحجز اتقفل لأنك ماحضرتش": "The booking was closed because you did not show up",
    "شكرًا لزيارتك": "Thanks for visiting",
    "طلبك وصل للمكان": "Your request reached the venue",
    "نشوفك على خير!": "See you next time!",
    "متأكد إنك عايز تلغي الحجز؟": "Sure you want to cancel the booking?",
    "تعذر الإلغاء": "Could not cancel",
    "أشخاص": "guests",
    "كمّل بياناتك": "Continue to your details",
    "كمّل للطلب": "Continue to the order",
    "اختار اليوم والساعة": "Pick a day and time",
    "اختار يوم داخل فترة الحجز المتاحة": "Pick a day within the available booking window",
    "اكتب اسمك": "Enter your name",
    "اكتب رقم موبايل صحيح": "Enter a valid mobile number",
    "النهارده": "Today",
    "كل المواعيد بتوقيت المكان": "All times are in the venue timezone",
    ". ساعة جهازك على توقيت مختلف.": ". Your device is set to a different timezone.",
    "ابعت طلبك قبل الميعاد بـ": "Send your request at least",
    "ساعة على الأقل.": "hour(s) before.",
    "دقيقة على الأقل.": "minute(s) before.",
    "تقليل الكمية": "Decrease quantity",
    "زيادة الكمية": "Increase quantity",
    "حجز طاولة": "Book a table",
    "صنف مع الحجز": "Item with booking",
    "الحجز من غير طلب": "Booking without an order",
    "حوالي": "approx.",
    "بنبعت...": "Sending...",
    "حصلت مشكلة، حاول تاني": "Something went wrong, try again",
    "مفيش اتصال، اتأكد من النت وحاول تاني": "No connection — check your internet and try again",
    "ابعت طلب الحجز": "Send booking request",
    "تعذر تحميل الصفحة، حاول تاني": "Could not load the page, try again",
    "أهلًا بيك في": "Welcome to",
    "الرجوع للمنيو": "Back to the menu",
    "لمّتك تبدأ من هنا": "Your gathering starts here",
    "كل لمّة حلوة،": "Every good gathering",
    "ليها مكان.": "deserves a place.",
    "اختار الميعاد اللي يناسبك، وسيب لنا": "Pick the time that suits you and leave",
    "طلب حجزك. الباقي نرتّبه سوا.": "your booking request. We will arrange the rest together.",
    "الحجز بيتأكد بعد موافقة المكان.": "Bookings are confirmed after the venue approves.",
    "هنوضح لك حالة طلبك أول بأول.": "We will keep your request status up to date.",
    "ناخدها وقت تاني؟": "Shall we do it another time?",
    "المكان مش بيستقبل حجوزات أونلاين دلوقتي.": "The venue is not taking online bookings right now.",
    "تقدر ترجع للمنيو وتختار طلبك.": "You can go back to the menu and pick your order.",
    "بنجهّز لك الصفحة…": "Preparing your page…",
    "ميعادك": "Your slot",
    "بياناتك": "Your details",
    "طلبك": "Your order",
    "نشوفك إمتى؟": "When should we expect you?",
    "اختار اليوم": "Pick a day",
    "تاريخ تاني": "Another date",
    "التاريخ": "Date",
    "كام شخص في اللمّة؟": "How many people?",
    "نتشرّف باسمك": "May we have your name?",
    "تعديل الميعاد": "Edit the slot",
    "اسمك": "Your name",
    "رقم الموبايل": "Mobile number",
    "عشان المكان يقدر يتواصل معاك بخصوص الحجز.": "So the venue can reach you about the booking.",
    "حاجة نعرفها قبل ما تيجي؟": "Anything we should know before you come?",
    "اختياري": "Optional",
    "تحب تضيف طلب؟": "Want to add an order?",
    "اختار من المنيو، أو ابعت الحجز من غير طلب.": "Pick from the menu, or send the booking without an order.",
    "التجهيز بيبدأ لما توصل، والسعر النهائي عند المكان.": "Preparation starts when you arrive, and the final price is at the venue.",
    "طلبك مش تأكيد نهائي، المكان هيراجعه الأول.": "Your request is not a final confirmation — the venue reviews it first.",
    "بدون طلب": "No order",
    "الحجز بيتأكد بعد موافقة المكان": "Bookings are confirmed after the venue approves",
    "رقم حجزك، احتفظ بيه": "Your booking number — keep it",
    "حجز جديد": "New booking",
    "إلغاء الحجز": "Cancel booking",
    "المنيو مش متاح دلوقتي.": "The menu is unavailable right now.",
    "القاهرة": "Cairo"
  };

  var KEY = 'imenu_lang';
  var current = 'ar';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'ar' || saved === 'en') current = saved;
  } catch (e) {}

  var AR_LETTER = /[\u0621-\u064A\u0671-\u06D3]/;
  var normalized = Object.create(null);
  Object.keys(DICT).forEach(function (key) { normalized[key.replace(/\s+/g, ' ').trim()] = DICT[key]; });
  var phrases = Object.keys(normalized).filter(function (key) { return AR_LETTER.test(key); }).sort(function (a, b) { return b.length - a.length; });
  var phraseRE = new RegExp(phrases.map(function (key) { return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g');

  function t(text) {
    var v = String(text == null ? '' : text).replace(/\s+/g, ' ');
    return v.replace(phraseRE, function (m) { return normalized[m] || m; });
  }

  var textOrig = new Map();
  var attrOrig = new Map();
  var ATTRS = ['placeholder', 'title', 'aria-label', 'value'];
  var translating = false;

  function isSkipEl(el) {
    return el && el.nodeType === 1 && el.closest && el.closest('[data-imenu-skip]');
  }
  function translateTextNode(node) {
    var v = node.nodeValue;
    if (!v || !AR_LETTER.test(v)) return;
    if (!textOrig.has(node)) textOrig.set(node, v);
    var nv = t(textOrig.get(node));
    if (nv !== v) node.nodeValue = nv;
  }
  function restoreTextNode(node) {
    if (textOrig.has(node)) node.nodeValue = textOrig.get(node);
  }
  function translateAttrs(el) {
    if (isSkipEl(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (a === 'value' && !(el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit'))) continue;
      var v = el.getAttribute && el.getAttribute(a);
      if (v && AR_LETTER.test(v)) {
        var rec = attrOrig.get(el) || {};
        if (!(a in rec)) rec[a] = v;
        attrOrig.set(el, rec);
        var nv = t(rec[a]);
        if (nv !== v) el.setAttribute(a, nv);
      }
    }
  }
  function restoreAttrs(el) {
    var rec = attrOrig.get(el);
    if (!rec) return;
    Object.keys(rec).forEach(function (a) { el.setAttribute(a, rec[a]); });
  }
  function walk(root, fn) {
    if (!root) return;
    if (root.nodeType === 3) { fn(root, false); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    var tag = root.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
    if (tag === 'TEXTAREA') return;
    if (isSkipEl(root)) return;
    fn(root, true);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, function (n) {
      return isSkipEl(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    });
    var n;
    while ((n = walker.nextNode())) fn(n, n.nodeType === 1);
  }

  function applyDirLang(lang) {
    var html = document.documentElement;
    html.lang = lang;
    html.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    html.setAttribute('data-imenu-lang', lang);
  }

  var titleOrig = null;
  function applyLang(lang) {
    translating = true;
    try {
      applyDirLang(lang);
      if (lang === 'en') {
        walk(document.body || document.documentElement, function (node, isEl) {
          if (isEl) translateAttrs(node); else translateTextNode(node);
        });
        if (titleOrig === null) titleOrig = document.title;
        document.title = t(titleOrig);
      } else {
        textOrig.forEach(function (_, node) { restoreTextNode(node); });
        attrOrig.forEach(function (_, el) { restoreAttrs(el); });
        if (titleOrig !== null) document.title = titleOrig;
      }
    } finally {
      translating = false;
    }
    updateToggle();
  }
  function translateSubtree(root) {
    if (!root || current !== 'en') return;
    translating = true;
    try {
      walk(root, function (node, isEl) { if (isEl) translateAttrs(node); else translateTextNode(node); });
    } finally {
      translating = false;
    }
  }

  var observer = null;
  function startObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(function (muts) {
      if (translating || current !== 'en') return;
      textOrig.forEach(function (_, node) { if (node.isConnected === false) textOrig.delete(node); });
      attrOrig.forEach(function (_, el) { if (el.isConnected === false) attrOrig.delete(el); });
      muts.forEach(function (m) {
        if (m.type === 'attributes') { translateAttrs(m.target); }
        else if (m.type === 'characterData' && m.target.nodeType === 3) {
          var v = m.target.nodeValue;
          if (v && AR_LETTER.test(v)) { translating = true; try { translateTextNode(m.target); } finally { translating = false; } }
        } else {
          m.addedNodes && m.addedNodes.forEach(function (node) {
            if (node.nodeType === 3) {
              if (node.nodeValue && AR_LETTER.test(node.nodeValue)) { translating = true; try { translateTextNode(node); } finally { translating = false; } }
            } else if (node.nodeType === 1) {
              translating = true;
              try { walk(node, function (n2, isEl) { if (isEl) translateAttrs(n2); else translateTextNode(n2); }); } finally { translating = false; }
            }
          });
        }
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  var toggles = [];
  function injectStyle() {
    var st = document.createElement('style');
    st.id = 'imenu-web-i18n-style';
    st.textContent =
      '.imenu-lang-toggle{background:rgba(255,255,255,.14);color:inherit;border:1px solid rgba(128,128,128,.35);border-radius:999px;' +
      'padding:6px 12px;font-family:inherit;font-size:12px;font-weight:800;line-height:1;cursor:pointer;display:inline-flex;' +
      'align-items:center;justify-content:center;gap:5px;white-space:nowrap;min-height:32px;backdrop-filter:blur(4px)}' +
      '.imenu-lang-toggle svg{width:13px;height:13px;flex-shrink:0}' +
      '.imenu-lang-toggle:hover{filter:brightness(1.15)}' +
      '.imenu-lang-toggle:focus-visible{outline:2px solid currentColor;outline-offset:2px}';
    (document.head || document.documentElement).appendChild(st);
  }
  function updateToggle() {
    toggles.forEach(function (button) {
      button.querySelector('.imenu-lang-label').textContent = current === 'ar' ? 'English' : 'عربي';
      button.setAttribute('aria-label', current === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
      button.setAttribute('lang', current === 'ar' ? 'en' : 'ar');
    });
  }
  function buildToggle() {
    if (!document.body) return;
    if (!document.getElementById('imenu-web-i18n-style')) injectStyle();
    document.querySelectorAll('[data-imenu-lang-host]:not([data-imenu-lang-done])').forEach(function (host) {
      host.setAttribute('data-imenu-lang-done', '1');
      var button = document.createElement('button');
      button.className = 'imenu-lang-toggle';
      button.setAttribute('data-imenu-skip', '1');
      button.type = 'button';
      button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></svg><span class="imenu-lang-label"></span>';
      button.addEventListener('click', function () { window.imenuSetLang(current === 'ar' ? 'en' : 'ar'); });
      host.appendChild(button);
      toggles.push(button);
    });
    updateToggle();
  }

  window.imenuT = t;
  window.imenuUI = function (s) { return current === 'en' ? t(s) : s; };
  window.imenuGetLang = function () { return current; };
  window.imenuTranslateSubtree = translateSubtree;
  window.imenuSetLang = function (lang) {
    if (lang !== 'ar' && lang !== 'en') return;
    current = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    applyLang(lang);
    startObserver();
    try { window.dispatchEvent(new CustomEvent('imenu-lang-changed', { detail: { lang: lang } })); } catch (e) {}
  };

  function boot() {
    applyDirLang(current);
    buildToggle();
    if (current === 'en') applyLang('en');
    else updateToggle();
    startObserver();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
