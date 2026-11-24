/* PRIMO demo cart: classic script, safe on every page. Demo only: nothing is ever sent or charged.

   window.primoCart API
     items()                       → array of lines {key, id, pack, qty, sub}
     add(id, pack=1, qty=1, {sub}) → line
     remove(key) / setQty(key, qty) / setSub(key, bool) / clear()
     count() → packs in cart          bottles() → bottles in cart
     subtotal()                     → AUD after subscribe discount
     totals()                       → {subtotal, list, subSave, promo, promoCode, shipping, total, gst, freeLeft, freeAt}
     setPromo(code) → true|false     promoCode()
     unitPrice(line) / lineTotal(line) / packPrice(pack, sub) / perBottle(pack, sub)
     format(n) → "$12.00"           label(line)
     on(fn) → unsubscribe            toast(msg)
     open(view?) / close()          the slide-in cart drawer ('cart' | 'checkout')
     fly(fromEl, flavourId)         add-to-cart flight from an element to the nav cart
     snapshot(id) → Promise<url>    the real 3D bottle render (bottle3d.js), SVG fallback
     FLAVOURS, PACKS, SUB_DISCOUNT, FREE_SHIP, SHIPPING

   Auto-binds:
     [data-add-to-cart="id"] (+ data-pack, data-qty, data-sub="true")  adds, flies, toasts
     [data-cart-count]                                                 item count
     .nav-cart / [data-open-cart]                                      opens the drawer
   Storage: localStorage 'primo:cart' and 'primo:promo'; falls back to memory. */
(function () {
  'use strict';
  var KEY = 'primo:cart', PROMO_KEY = 'primo:promo';
  var FLAVOURS = {
    volt: { name: 'Volt Lime', short: 'Volt', ink: '#c8ff2e', liquid: '#4f6a12' },
    berry: { name: 'Midnight Berry', short: 'Berry', ink: '#b3a3ff', liquid: '#2f2458' },
    glacier: { name: 'Glacier Mint', short: 'Glacier', ink: '#8fe3dc', liquid: '#174a52' },
    ember: { name: 'Ember Citrus', short: 'Ember', ink: '#ffae78', liquid: '#6e2e14' }
  };
  var PACKS = {
    1: { label: 'Single', price: 4.5 },
    6: { label: '6-pack', price: 24 },
    12: { label: '12-pack', price: 45 },
    24: { label: '24-pack', price: 84 }
  };
  var PROMOS = { PRIMO10: 0.10 };
  var SUB_DISCOUNT = 0.15, FREE_SHIP = 60, SHIPPING = 9.95;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var memory = [], memPromo = '';
  var listeners = [];

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return memory.slice();
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(valid) : [];
    } catch (e) { return memory.slice(); }
  }
  function valid(l) { return l && FLAVOURS[l.id] && PACKS[l.pack] && l.qty > 0; }
  function write(lines) {
    memory = lines.slice();
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch (e) { /* memory only */ }
    emit();
  }
  function keyOf(id, pack, sub) { return id + '-' + pack + (sub ? '-sub' : ''); }
  function clampQty(q) { q = Math.round(+q || 0); return Math.max(0, Math.min(99, q)); }
  function r2(n) { return Math.round(n * 100) / 100; }

  function packPrice(pack, sub) {
    var p = PACKS[pack] ? PACKS[pack].price : 0;
    return r2(p * (sub ? 1 - SUB_DISCOUNT : 1));
  }
  function readPromo() {
    try { var v = localStorage.getItem(PROMO_KEY); return PROMOS[v] != null ? v : ''; } catch (e) { return memPromo; }
  }

  var api = {
    FLAVOURS: FLAVOURS, PACKS: PACKS, SUB_DISCOUNT: SUB_DISCOUNT, FREE_SHIP: FREE_SHIP, SHIPPING: SHIPPING,
    items: function () { return read(); },
    add: function (id, pack, qty, opts) {
      pack = +pack || 1; qty = clampQty(qty == null ? 1 : qty) || 1;
      var sub = !!(opts && opts.sub);
      if (!FLAVOURS[id] || !PACKS[pack]) return null;
      var lines = read(), k = keyOf(id, pack, sub), line = null;
      for (var i = 0; i < lines.length; i++) if (lines[i].key === k) line = lines[i];
      if (line) line.qty = clampQty(line.qty + qty);
      else { line = { key: k, id: id, pack: pack, qty: qty, sub: sub }; lines.push(line); }
      write(lines);
      return line;
    },
    remove: function (key) { write(read().filter(function (l) { return l.key !== key; })); },
    setQty: function (key, qty) {
      qty = clampQty(qty);
      if (!qty) return api.remove(key);
      var lines = read();
      lines.forEach(function (l) { if (l.key === key) l.qty = qty; });
      write(lines);
    },
    setSub: function (key, sub) {
      var lines = read(), line = null;
      lines.forEach(function (l) { if (l.key === key) line = l; });
      if (!line) return;
      var nk = keyOf(line.id, line.pack, !!sub);
      if (nk === key) return;
      var other = null;
      lines.forEach(function (l) { if (l.key === nk) other = l; });
      if (other) { other.qty = clampQty(other.qty + line.qty); lines = lines.filter(function (l) { return l !== line; }); }
      else { line.sub = !!sub; line.key = nk; }
      write(lines);
      return nk;
    },
    clear: function () { write([]); },
    count: function () { return read().reduce(function (n, l) { return n + l.qty; }, 0); },
    bottles: function () { return read().reduce(function (n, l) { return n + l.qty * l.pack; }, 0); },
    packPrice: packPrice,
    perBottle: function (pack, sub) { return r2(packPrice(pack, sub) / pack); },
    unitPrice: function (l) { return packPrice(l.pack, l.sub); },
    lineTotal: function (l) { return r2(packPrice(l.pack, l.sub) * l.qty); },
    subtotal: function () { return r2(read().reduce(function (s, l) { return s + api.lineTotal(l); }, 0)); },
    promoCode: readPromo,
    setPromo: function (code) {
      code = String(code || '').trim().toUpperCase();
      if (code && PROMOS[code] == null) return false;
      memPromo = code;
      try { if (code) localStorage.setItem(PROMO_KEY, code); else localStorage.removeItem(PROMO_KEY); } catch (e) {}
      emit();
      return true;
    },
    totals: function () {
      var lines = read();
      var list = r2(lines.reduce(function (s, l) { return s + PACKS[l.pack].price * l.qty; }, 0));
      var subtotal = api.subtotal();
      var code = readPromo();
      var promo = code ? r2(subtotal * PROMOS[code]) : 0;
      var after = r2(subtotal - promo);
      var shipping = !lines.length || after >= FREE_SHIP ? 0 : SHIPPING;
      var total = r2(after + shipping);
      return {
        list: list, subtotal: subtotal, subSave: r2(list - subtotal), promo: promo, promoCode: code,
        shipping: shipping, total: total, gst: r2(total / 11),
        freeAt: FREE_SHIP, freeLeft: Math.max(0, r2(FREE_SHIP - after)), progress: Math.min(1, after / FREE_SHIP)
      };
    },
    format: function (n) { return '$' + (+n).toFixed(2); },
    label: function (l) { return FLAVOURS[l.id].name + ' · ' + PACKS[l.pack].label; },
    on: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    }
  };

  function emit() {
    renderCounts();
    var items = read();
    listeners.forEach(function (fn) { try { fn(items); } catch (e) { console.error(e); } });
    try { window.dispatchEvent(new CustomEvent('primo:cart', { detail: { items: items } })); } catch (e) {}
    if (drawer && !drawer.hidden) renderDrawer();
  }

  var lastCount = null;
  function renderCounts() {
    var n = api.count();
    var els = document.querySelectorAll('[data-cart-count]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.textContent = n;
      el.setAttribute('data-count', n);
      if (lastCount !== null && n > lastCount) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
    var cartLinks = document.querySelectorAll('.nav-cart');
    for (var j = 0; j < cartLinks.length; j++) cartLinks[j].setAttribute('aria-label', 'Open cart, ' + n + (n === 1 ? ' item' : ' items'));
    lastCount = n;
  }

  /* ---------- real bottle snapshots (bottle3d.js), SVG fallback ---------- */
  var snapCache = {}, b3d = null;
  function loadB3d() {
    if (!b3d) {
      b3d = (function () {
        try { return import('./bottle3d.js'); } catch (e) { return Promise.reject(e); }
      })();
      b3d.catch(function () {});
    }
    return b3d;
  }
  function fallbackSnap(id) {
    var f = FLAVOURS[id] || FLAVOURS.volt;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 300"><defs><linearGradient id="g" x1="0" x2="1">' +
      '<stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>' +
      '<rect x="40" y="6" width="40" height="22" rx="4" fill="#24262c"/><path d="M44 28h32v14c0 12 26 18 26 40v196c0 10-8 16-42 16S18 288 18 278V82c0-22 26-28 26-40z" fill="' + f.liquid + '"/>' +
      '<rect x="18" y="104" width="84" height="150" fill="#0d0f0c"/><text x="60" y="180" fill="' + f.ink + '" font-family="Space Grotesk,sans-serif" font-weight="700" font-size="30" text-anchor="middle" transform="rotate(-90 60 180)">PRIMO</text>' +
      '<path d="M44 28h32v14c0 12 26 18 26 40v196c0 10-8 16-42 16S18 288 18 278V82c0-22 26-28 26-40z" fill="url(#g)"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function snapshot(id, opts) {
    id = FLAVOURS[id] ? id : 'volt';
    opts = opts || {};
    var k = id + JSON.stringify(opts);
    if (!snapCache[k]) {
      snapCache[k] = loadB3d().then(function (m) {
        if (!m || !m.bottleSnapshot) throw new Error('no bottleSnapshot');
        return m.bottleSnapshot(id, Object.assign({ width: 360, height: 720, tilt: -0.08, turn: 0.35, fill: 1 }, opts));
      }).catch(function () { return fallbackSnap(id); });
    }
    return snapCache[k];
  }
  function fillSnaps(scope) {
    var imgs = (scope || document).querySelectorAll('img[data-snap]:not([data-snapped])');
    Array.prototype.forEach.call(imgs, function (img) {
      img.setAttribute('data-snapped', '');
      snapshot(img.getAttribute('data-snap')).then(function (url) {
        img.src = url;
        if (img.complete) img.classList.add('ready'); else img.onload = function () { img.classList.add('ready'); };
      });
    });
  }
  api.snapshot = snapshot;
  api.fillSnaps = fillSnaps;

  /* ---------- toast ---------- */
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'primo-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = '<span class="primo-toast-dot" aria-hidden="true"></span><span></span>' +
      '<button type="button" data-open-cart>View cart</button>';
    toastEl.children[1].textContent = msg;
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
  }
  api.toast = toast;

  /* ---------- fly to cart ---------- */
  function fly(from, id) {
    var target = document.querySelector('.nav-cart');
    if (!from || !target || reduced || !document.body.animate) return Promise.resolve();
    var a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!a.width || !b.width) return Promise.resolve();
    return snapshot(id).then(function (url) {
      var img = new Image();
      img.src = url; img.alt = ''; img.className = 'primo-fly';
      document.body.appendChild(img);
      var w = 54, h = 108;
      var x0 = a.left + a.width / 2 - w / 2, y0 = a.top + a.height / 2 - h / 2;
      var x1 = b.left + b.width / 2 - w / 2, y1 = b.top + b.height / 2 - h / 2;
      var mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 140;
      var anim = img.animate([
        { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.6) rotate(-8deg)', opacity: 0 },
        { transform: 'translate(' + x0 + 'px,' + (y0 - 30) + 'px) scale(1.15) rotate(-14deg)', opacity: 1, offset: 0.18 },
        { transform: 'translate(' + mx + 'px,' + my + 'px) scale(.95) rotate(12deg)', opacity: 1, offset: 0.6 },
        { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.22) rotate(30deg)', opacity: 0.2 }
      ], { duration: 950, easing: 'cubic-bezier(.45,.05,.3,1)' });
      return new Promise(function (res) {
        anim.onfinish = function () { img.remove(); target.classList.remove('catch'); void target.offsetWidth; target.classList.add('catch'); res(); };
      });
    });
  }
  api.fly = fly;

  /* ---------- drawer ---------- */
  var drawer = null, panel = null, live = null, view = 'cart', opener = null, orderNo = '';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function announce(msg) { if (live) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); } }

  function buildDrawer() {
    drawer = document.createElement('div');
    drawer.className = 'pc';
    drawer.hidden = true;
    drawer.innerHTML =
      '<div class="pc-scrim" data-close-cart></div>' +
      '<aside class="pc-panel" role="dialog" aria-modal="true" aria-labelledby="pcTitle" data-lenis-prevent tabindex="-1">' +
        '<div class="pc-glow" aria-hidden="true"></div>' +
        '<header class="pc-head">' +
          '<div><p class="pc-kicker"><span></span>Your cart</p><h2 id="pcTitle" class="pc-title"></h2></div>' +
          '<button type="button" class="pc-x" data-close-cart aria-label="Close cart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '</header>' +
        '<div class="pc-ship" aria-hidden="false"><div class="pc-ship-text"></div><div class="pc-ship-bar"><i></i></div></div>' +
        '<div class="pc-body"></div>' +
        '<footer class="pc-foot"></footer>' +
        '<div class="sr-only pc-live" aria-live="polite" aria-atomic="true"></div>' +
      '</aside>';
    document.body.appendChild(drawer);
    panel = drawer.querySelector('.pc-panel');
    live = drawer.querySelector('.pc-live');

    drawer.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-close-cart]')) { e.preventDefault(); close(); return; }
      var row = t.closest('[data-line]'), key = row && row.getAttribute('data-line');
      var line = key && read().filter(function (l) { return l.key === key; })[0];
      if (t.closest('[data-inc]') && line) { api.setQty(key, line.qty + 1); announce(api.label(line) + ', quantity ' + (line.qty + 1)); bumpLine(key); return; }
      if (t.closest('[data-dec]') && line) {
        if (line.qty <= 1) removeLine(row, key, line); else { api.setQty(key, line.qty - 1); announce(api.label(line) + ', quantity ' + (line.qty - 1)); bumpLine(key); }
        return;
      }
      if (t.closest('[data-remove]') && line) { removeLine(row, key, line); return; }
      if (t.closest('[data-checkout]')) { view = 'checkout'; renderDrawer(true); focusFirst(); return; }
      if (t.closest('[data-back]')) { view = 'cart'; renderDrawer(true); focusFirst(); return; }
      if (t.closest('[data-place]')) { placeOrder(); return; }
      if (t.closest('[data-done]')) { view = 'cart'; close(); return; }
    });
    drawer.addEventListener('change', function (e) {
      var sw = e.target.closest('[data-subtoggle]');
      if (sw) {
        var key = sw.closest('[data-line]').getAttribute('data-line');
        api.setSub(key, sw.checked);
        announce(sw.checked ? 'Subscribe and save on, 15% off' : 'Subscribe and save off');
      }
      if (e.target.name === 'pcSpeed') renderFoot();
    });
    drawer.addEventListener('submit', function (e) {
      var f = e.target.closest('.pc-promo');
      if (!f) return;
      e.preventDefault();
      var input = f.querySelector('input'), msg = f.querySelector('.pc-promo-msg');
      var code = input.value.trim();
      if (!code) { api.setPromo(''); msg.textContent = 'Promo removed.'; return; }
      if (api.setPromo(code)) { msg.textContent = code.toUpperCase() + ' applied: 10% off.'; msg.className = 'pc-promo-msg ok'; announce('Promo code applied, 10% off'); }
      else { msg.textContent = 'That code isn’t valid. Try PRIMO10.'; msg.className = 'pc-promo-msg err'; input.setAttribute('aria-invalid', 'true'); input.focus(); }
    });
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  function focusables() {
    return Array.prototype.filter.call(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null; });
  }
  function focusFirst() { setTimeout(function () { var f = focusables(); (f[1] || f[0] || panel).focus({ preventScroll: true }); }, 60); }
  function bumpLine(key) {
    var el = drawer.querySelector('[data-line="' + key + '"] .pc-qty-n');
    if (el) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
  }
  function removeLine(row, key, line) {
    announce('Removed ' + api.label(line));
    if (reduced || !row.animate) { api.remove(key); return; }
    row.style.height = row.offsetHeight + 'px';
    var a = row.animate([{ opacity: 1, transform: 'none', height: row.offsetHeight + 'px' },
      { opacity: 0, transform: 'translateX(40px)', height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px' }],
      { duration: 380, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'forwards' });
    a.onfinish = function () { api.remove(key); };
  }

  function lineHTML(l) {
    var f = FLAVOURS[l.id], stack = Math.min(3, l.pack);
    var imgs = '';
    for (var i = 0; i < stack; i++) imgs += '<img alt="" data-snap="' + l.id + '" style="--i:' + i + '">';
    return '<li class="pc-line" data-line="' + l.key + '" style="--line-ink:' + f.ink + '">' +
      '<div class="pc-thumb s' + stack + '" aria-hidden="true">' + imgs + (l.pack > 1 ? '<b>×' + l.pack + '</b>' : '') + '</div>' +
      '<div class="pc-info">' +
        '<p class="pc-name">' + esc(f.name) + '</p>' +
        '<p class="pc-meta">' + PACKS[l.pack].label + ' · ' + api.format(api.perBottle(l.pack, l.sub)) + ' / bottle</p>' +
        '<label class="pc-sub"><input type="checkbox" data-subtoggle ' + (l.sub ? 'checked' : '') + '><span class="pc-switch" aria-hidden="true"></span>Subscribe &amp; save 15%</label>' +
        '<div class="pc-row">' +
          '<div class="pc-qty" role="group" aria-label="Quantity for ' + esc(api.label(l)) + '">' +
            '<button type="button" data-dec aria-label="' + (l.qty <= 1 ? 'Remove' : 'Decrease') + '">' + (l.qty <= 1 ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>' : '−') + '</button>' +
            '<span class="pc-qty-n" aria-live="off">' + l.qty + '</span>' +
            '<button type="button" data-inc aria-label="Increase">+</button>' +
          '</div>' +
          '<p class="pc-price">' + (l.sub ? '<s>' + api.format(PACKS[l.pack].price * l.qty) + '</s>' : '') + api.format(api.lineTotal(l)) + '</p>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="pc-remove" data-remove aria-label="Remove ' + esc(api.label(l)) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '</li>';
  }

  function renderDrawer(animate) {
    if (!drawer) return;
    var lines = read(), t = api.totals(), n = api.bottles();
    drawer.setAttribute('data-view', lines.length || view === 'done' ? view : 'empty');
    drawer.querySelector('.pc-title').textContent =
      view === 'done' ? 'Order placed (demo)' : view === 'checkout' ? 'Checkout' : lines.length ? n + (n === 1 ? ' bottle' : ' bottles') : 'Empty, for now';

    var ship = drawer.querySelector('.pc-ship');
    ship.hidden = !lines.length || view === 'done';
    ship.querySelector('.pc-ship-text').innerHTML = t.freeLeft > 0
      ? '<b>' + api.format(t.freeLeft) + '</b> away from free shipping'
      : '<b>Free shipping</b> unlocked';
    ship.style.setProperty('--p', t.progress.toFixed(3));
    ship.classList.toggle('full', t.freeLeft <= 0);

    var body = drawer.querySelector('.pc-body');
    var html;
    if (view === 'done') {
      html = '<div class="pc-done">' +
        '<div class="pc-done-ring" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>' +
        '<p class="pc-done-no">' + esc(orderNo) + '</p>' +
        '<h3>Demo order complete.</h3>' +
        '<p>Nothing was charged, no order was placed and nothing was sent anywhere. PRIMO is a fictional brand.</p>' +
        '<button type="button" class="pc-btn pc-btn-primary" data-done>Back to the site</button>' +
      '</div>';
    } else if (!lines.length) {
      html = '<div class="pc-empty">' +
        '<div class="pc-empty-stage" aria-hidden="true"><img alt="" data-snap="' + currentFlavour() + '"><span class="pc-empty-floor"></span></div>' +
        '<h3>Your cart is thirsty.</h3>' +
        '<p>Four flavours, zero added sugar, 830mg of electrolytes. Start with a 6-pack and find your one.</p>' +
        '<div class="pc-empty-cta">' +
          '<a class="pc-btn pc-btn-primary" href="shop.html">Shop flavours</a>' +
          '<button type="button" class="pc-btn pc-btn-ghost" data-add-to-cart="' + currentFlavour() + '" data-pack="6">Add a ' + FLAVOURS[currentFlavour()].short + ' 6-pack</button>' +
        '</div>' +
      '</div>';
    } else if (view === 'checkout') {
      html = '<div class="pc-checkout">' +
        '<button type="button" class="pc-back" data-back><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Back to cart</button>' +
        '<ol class="pc-review">' + lines.map(function (l) {
          return '<li><img alt="" data-snap="' + l.id + '"><span>' + esc(api.label(l)) + (l.sub ? ' · subscribed' : '') + ' <em>× ' + l.qty + '</em></span><b>' + api.format(api.lineTotal(l)) + '</b></li>';
        }).join('') + '</ol>' +
        '<fieldset class="pc-speed"><legend>Delivery</legend>' +
          '<label><input type="radio" name="pcSpeed" value="std" checked><span><b>Standard</b> 3–5 business days</span><i>' + (t.shipping ? api.format(t.shipping) : 'Free') + '</i></label>' +
          '<label><input type="radio" name="pcSpeed" value="exp"><span><b>Express</b> next business day</span><i>+$8.00</i></label>' +
        '</fieldset>' +
        '<p class="pc-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z"/></svg>This is a demo checkout. There are no payment fields, nothing is charged and nothing is sent.</p>' +
      '</div>';
    } else {
      html = '<ul class="pc-lines">' + lines.map(lineHTML).join('') + '</ul>' +
        '<form class="pc-promo" novalidate><label for="pcPromo" class="sr-only">Promo code</label>' +
          '<input id="pcPromo" name="promo" autocomplete="off" spellcheck="false" placeholder="Promo code · try PRIMO10" value="' + esc(t.promoCode) + '">' +
          '<button type="submit" class="pc-btn pc-btn-ghost">' + (t.promoCode ? 'Update' : 'Apply') + '</button>' +
          '<p class="pc-promo-msg' + (t.promoCode ? ' ok' : '') + '" aria-live="polite">' + (t.promoCode ? t.promoCode + ' applied: 10% off.' : '') + '</p>' +
        '</form>' +
        '<div class="pc-upsell">' + upsellHTML(lines) + '</div>';
    }
    var prevScroll = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = animate ? 0 : prevScroll;
    if (animate && !reduced && body.animate) body.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.1,1)' });
    renderFoot();
    fillSnaps(drawer);
  }
  function upsellHTML(lines) {
    var have = {};
    lines.forEach(function (l) { have[l.id] = 1; });
    var ids = Object.keys(FLAVOURS).filter(function (id) { return !have[id]; });
    if (!ids.length) return '<p class="pc-upsell-done">All four flavours in. Respect.</p>';
    return '<p class="pc-upsell-h">Complete the day</p><div class="pc-upsell-row">' + ids.map(function (id) {
      return '<button type="button" class="pc-up" data-add-to-cart="' + id + '" data-pack="6" style="--line-ink:' + FLAVOURS[id].ink + '">' +
        '<img alt="" data-snap="' + id + '"><span>' + FLAVOURS[id].short + '</span><em>6-pack · ' + api.format(PACKS[6].price) + '</em><i aria-hidden="true">+</i></button>';
    }).join('') + '</div>';
  }
  function renderFoot() {
    var foot = drawer.querySelector('.pc-foot');
    var lines = read();
    if (!lines.length || view === 'done') { foot.hidden = true; foot.innerHTML = ''; return; }
    foot.hidden = false;
    var t = api.totals();
    var exp = view === 'checkout' && drawer.querySelector('input[name="pcSpeed"][value="exp"]:checked');
    var shipping = t.shipping + (exp ? 8 : 0), total = Math.round((t.total + (exp ? 8 : 0)) * 100) / 100;
    foot.innerHTML =
      '<dl class="pc-sum">' +
        '<div><dt>Subtotal</dt><dd>' + api.format(t.list) + '</dd></div>' +
        (t.subSave ? '<div class="save"><dt>Subscribe &amp; save</dt><dd>−' + api.format(t.subSave) + '</dd></div>' : '') +
        (t.promo ? '<div class="save"><dt>Promo ' + esc(t.promoCode) + '</dt><dd>−' + api.format(t.promo) + '</dd></div>' : '') +
        '<div><dt>Shipping</dt><dd>' + (shipping ? api.format(shipping) : 'Free') + '</dd></div>' +
        '<div class="total"><dt>Total <small>incl. ' + api.format(total / 11) + ' GST</small></dt><dd data-total>' + api.format(total) + '</dd></div>' +
      '</dl>' +
      (view === 'checkout'
        ? '<button type="button" class="pc-btn pc-btn-primary pc-cta" data-place>Place demo order · ' + api.format(total) + '</button>'
        : '<button type="button" class="pc-btn pc-btn-primary pc-cta" data-checkout>Checkout<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>') +
      '<p class="pc-fine">Demo store. Prices in AUD are illustrative.</p>';
  }
  function placeOrder() {
    var btn = drawer.querySelector('[data-place]');
    if (btn) { btn.disabled = true; btn.classList.add('loading'); btn.textContent = 'Placing demo order…'; }
    setTimeout(function () {
      orderNo = 'PRIMO-' + Math.random().toString(36).slice(2, 7).toUpperCase() + ' · DEMO';
      view = 'done';
      api.clear();
      api.setPromo('');
      renderDrawer(true);
      announce('Demo order complete. Nothing was charged.');
      focusFirst();
    }, reduced ? 150 : 1100);
  }
  function currentFlavour() {
    try { var v = localStorage.getItem('primo:flavour'); if (FLAVOURS[v]) return v; } catch (e) {}
    var d = document.documentElement.getAttribute('data-flavour');
    return FLAVOURS[d] ? d : 'volt';
  }

  function lockScroll(on) {
    document.documentElement.classList.toggle('pc-open', on);
    var lenis = (window.primo && window.primo.lenis) || window.primoLenis;
    if (lenis) { try { on ? lenis.stop() : lenis.start(); } catch (e) {} }
  }
  function open(v) {
    if (!drawer) buildDrawer();
    if (v) view = v;
    if (view === 'done') view = 'cart';
    if (!read().length && view === 'checkout') view = 'cart';
    opener = document.activeElement;
    renderDrawer(true);
    drawer.hidden = false;
    void drawer.offsetWidth;
    drawer.classList.add('open');
    lockScroll(true);
    if (toastEl) toastEl.classList.remove('show');
    focusFirst();
  }
  function close() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('open');
    lockScroll(false);
    setTimeout(function () { if (!drawer.classList.contains('open')) { drawer.hidden = true; if (view === 'done') view = 'cart'; } }, reduced ? 0 : 520);
    if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
  }
  api.open = open;
  api.close = close;

  /* ---------- bindings ---------- */
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var btn = e.target.closest('[data-add-to-cart]');
    if (btn) {
      e.preventDefault();
      var id = btn.getAttribute('data-add-to-cart');
      var pack = +btn.getAttribute('data-pack') || 1;
      var qty = +btn.getAttribute('data-qty') || 1;
      var sub = btn.getAttribute('data-sub') === 'true';
      var line = api.add(id, pack, qty, { sub: sub });
      if (!line) return;
      var inDrawer = drawer && drawer.contains(btn);
      if (!inDrawer) {
        fly(btn, id);
        toast('Added ' + FLAVOURS[id].short + ' · ' + PACKS[pack].label + (qty > 1 ? ' × ' + qty : '') + (sub ? ' · subscribed' : ''));
      } else announce('Added ' + FLAVOURS[id].name + ' 6-pack');
      btn.classList.remove('added'); void btn.offsetWidth; btn.classList.add('added');
      return;
    }
    var opener2 = e.target.closest('.nav-cart, [data-open-cart]');
    if (opener2 && !(drawer && drawer.contains(opener2))) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      open('cart');
    }
  });

  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === PROMO_KEY) emit(); });

  function injectStyles() {
    if (document.getElementById('primo-cart-css')) return;
    var s = document.createElement('style');
    s.id = 'primo-cart-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var CSS = `
.primo-toast{position:fixed;left:50%;bottom:24px;z-index:220;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:999px;background:rgba(16,18,24,.82);color:#eceef2;border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);box-shadow:0 20px 60px rgba(0,0,0,.5);font:500 14px/1.2 var(--font-body,Inter,system-ui,sans-serif);transform:translate(-50%,140%);opacity:0;transition:transform .5s cubic-bezier(.2,.7,.1,1),opacity .4s;pointer-events:none;max-width:calc(100vw - 32px)}
.primo-toast.show{transform:translate(-50%,0);opacity:1;pointer-events:auto}
.primo-toast-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--accent,#c8ff2e);box-shadow:0 0 12px var(--accent,#c8ff2e)}
.primo-toast button{flex:none;font:600 13px/1 var(--font-body,Inter,sans-serif);color:var(--accent-ink,#0b0d06);background:var(--accent,#c8ff2e);border:0;padding:9px 13px;border-radius:999px;cursor:pointer}
[data-cart-count].bump{animation:primoBump .5s cubic-bezier(.2,.7,.1,1)}
.nav-cart.catch{animation:primoCatch .6s cubic-bezier(.2,.7,.1,1)}
@keyframes primoBump{0%{transform:scale(1)}40%{transform:scale(1.45)}100%{transform:scale(1)}}
@keyframes primoCatch{0%{box-shadow:0 0 0 0 var(--accent,#c8ff2e)}100%{box-shadow:0 0 0 14px transparent}}
.primo-fly{position:fixed;left:0;top:0;width:54px;height:108px;object-fit:contain;z-index:230;pointer-events:none;filter:drop-shadow(0 10px 18px rgba(0,0,0,.5)) drop-shadow(0 0 14px var(--glow,rgba(200,255,46,.3)))}
html.pc-open,html.pc-open body{overflow:hidden}
.pc{position:fixed;inset:0;z-index:210;font-family:var(--font-body,Inter,system-ui,sans-serif);color:var(--text,#eceef2)}
.pc[hidden]{display:none}
.pc-scrim{position:absolute;inset:0;background:rgba(4,5,7,.55);backdrop-filter:blur(6px) saturate(120%);-webkit-backdrop-filter:blur(6px) saturate(120%);opacity:0;transition:opacity .5s cubic-bezier(.2,.7,.1,1)}
.pc.open .pc-scrim{opacity:1}
.pc-panel{position:absolute;top:10px;right:10px;bottom:10px;width:min(460px,calc(100vw - 20px));display:flex;flex-direction:column;overflow:hidden;border-radius:26px;outline:none;
  background:linear-gradient(180deg,color-mix(in srgb,var(--tint,#0d0f09) 82%,transparent),rgba(9,10,13,.94) 40%);border:1px solid rgba(255,255,255,.1);
  box-shadow:0 40px 120px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(30px) saturate(150%);-webkit-backdrop-filter:blur(30px) saturate(150%);
  transform:translateX(calc(100% + 30px));transition:transform .62s cubic-bezier(.2,.75,.1,1)}
.pc.open .pc-panel{transform:none}
.pc-glow{position:absolute;inset:-30% -40% auto auto;width:120%;height:60%;background:radial-gradient(closest-side,var(--glow,rgba(200,255,46,.14)),transparent);pointer-events:none;filter:blur(10px)}
.pc-panel::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.06;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.pc-head{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:24px 24px 14px}
.pc-kicker{display:flex;align-items:center;gap:8px;font:600 11px/1 var(--font-body,Inter,sans-serif);letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#8b91a0)}
.pc-kicker span{width:6px;height:6px;border-radius:50%;background:var(--accent,#c8ff2e);box-shadow:0 0 10px var(--accent,#c8ff2e)}
.pc-title{margin-top:10px;font:700 clamp(26px,4vw,34px)/1 var(--font-display,'Space Grotesk',sans-serif);letter-spacing:-.03em}
.pc-x{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:inherit;cursor:pointer;transition:background .25s,border-color .25s,transform .4s cubic-bezier(.2,.7,.1,1)}
.pc-x:hover{background:rgba(255,255,255,.1);transform:rotate(90deg)}
.pc svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.pc :focus-visible{outline:2px solid var(--accent,#c8ff2e);outline-offset:3px}
.pc-ship{position:relative;margin:0 24px 6px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}
.pc-ship[hidden]{display:none}
.pc-ship-text{font-size:13px;color:var(--muted,#8b91a0)}
.pc-ship-text b{color:var(--text,#eceef2);font-weight:600}
.pc-ship.full .pc-ship-text b{color:var(--accent,#c8ff2e)}
.pc-ship-bar{margin-top:9px;height:4px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden}
.pc-ship-bar i{display:block;height:100%;width:100%;transform-origin:0 50%;transform:scaleX(var(--p,0));border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--accent,#c8ff2e) 50%,transparent),var(--accent,#c8ff2e));box-shadow:0 0 14px var(--accent,#c8ff2e);transition:transform .8s cubic-bezier(.2,.7,.1,1)}
.pc-body{position:relative;flex:1;overflow-y:auto;overscroll-behavior:contain;padding:8px 24px 18px;scrollbar-width:thin}
.pc-lines{list-style:none;margin:0;padding:0}
.pc-line{position:relative;display:grid;grid-template-columns:86px 1fr auto;gap:14px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);overflow:hidden}
.pc-thumb{position:relative;height:112px;border-radius:16px;background:radial-gradient(70% 55% at 50% 80%,color-mix(in srgb,var(--line-ink) 26%,transparent),transparent 70%),rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
.pc-thumb img{position:absolute;bottom:8px;left:50%;height:92px;width:46px;object-fit:contain;transform:translateX(-50%);opacity:0;transition:opacity .5s;filter:drop-shadow(0 8px 10px rgba(0,0,0,.55))}
.pc-thumb img.ready{opacity:1}
.pc-thumb.s2 img{height:84px}.pc-thumb.s2 img[style*="--i:0"]{transform:translateX(-78%) rotate(-5deg)}.pc-thumb.s2 img[style*="--i:1"]{transform:translateX(-22%) rotate(4deg)}
.pc-thumb.s3 img{height:78px}.pc-thumb.s3 img[style*="--i:0"]{transform:translateX(-100%) rotate(-7deg) scale(.92);filter:brightness(.7) drop-shadow(0 6px 8px rgba(0,0,0,.55))}.pc-thumb.s3 img[style*="--i:2"]{transform:translateX(0) rotate(7deg) scale(.92);filter:brightness(.7) drop-shadow(0 6px 8px rgba(0,0,0,.55))}.pc-thumb.s3 img[style*="--i:1"]{z-index:1;transform:translateX(-50%) translateY(4px)}
.pc-thumb b{position:absolute;top:7px;right:7px;z-index:2;font:700 11px/1 var(--font-display,'Space Grotesk',sans-serif);padding:4px 6px;border-radius:999px;background:var(--line-ink);color:#0b0c0a}
.pc-name{font:700 17px/1.15 var(--font-display,'Space Grotesk',sans-serif);letter-spacing:-.01em}
.pc-meta{margin-top:3px;font-size:12.5px;color:var(--muted,#8b91a0)}
.pc-sub{display:inline-flex;align-items:center;gap:8px;margin-top:9px;font-size:12.5px;color:var(--muted,#8b91a0);cursor:pointer;user-select:none}
.pc-sub input{position:absolute;opacity:0;width:1px;height:1px}
.pc-switch{position:relative;width:30px;height:18px;border-radius:999px;background:rgba(255,255,255,.12);transition:background .3s}
.pc-switch::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#eceef2;transition:transform .35s cubic-bezier(.2,.7,.1,1)}
.pc-sub input:checked+.pc-switch{background:var(--accent,#c8ff2e)}
.pc-sub input:checked+.pc-switch::after{transform:translateX(12px);background:#0b0c0a}
.pc-sub input:focus-visible+.pc-switch{outline:2px solid var(--accent,#c8ff2e);outline-offset:2px}
.pc-sub input:checked~*{color:var(--text,#eceef2)}
.pc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
.pc-qty{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.03)}
.pc-qty button{width:34px;height:34px;display:grid;place-items:center;border:0;background:none;color:inherit;font:500 18px/1 var(--font-body,Inter,sans-serif);cursor:pointer;border-radius:50%;transition:background .2s}
.pc-qty button:hover{background:rgba(255,255,255,.08)}
.pc-qty button svg{width:15px;height:15px}
.pc-qty-n{min-width:22px;text-align:center;font:600 14px/1 var(--font-display,'Space Grotesk',sans-serif);font-variant-numeric:tabular-nums}
.pc-qty-n.tick{animation:pcTick .45s cubic-bezier(.2,.7,.1,1)}
@keyframes pcTick{0%{transform:translateY(-60%);opacity:0}100%{transform:none;opacity:1}}
.pc-price{font:600 15px/1 var(--font-display,'Space Grotesk',sans-serif);font-variant-numeric:tabular-nums;text-align:right}
.pc-price s{display:block;margin-bottom:4px;font:500 11.5px/1 var(--font-body,Inter,sans-serif);color:var(--muted,#8b91a0)}
.pc-remove{align-self:start;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;background:none;color:var(--muted,#8b91a0);cursor:pointer;transition:color .2s,background .2s}
.pc-remove:hover{color:var(--text,#eceef2);background:rgba(255,255,255,.07)}
.pc-remove svg{width:14px;height:14px}
.pc-promo{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:16px}
.pc-promo input{min-width:0;height:44px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:inherit;font:500 14px/1 var(--font-body,Inter,sans-serif);text-transform:uppercase;letter-spacing:.06em;transition:border-color .25s}
.pc-promo input::placeholder{text-transform:none;letter-spacing:0;color:var(--muted,#8b91a0)}
.pc-promo input:focus{border-color:var(--accent,#c8ff2e);outline:none}
.pc-promo-msg{grid-column:1/-1;min-height:1em;font-size:12.5px;color:var(--muted,#8b91a0)}
.pc-promo-msg.ok{color:var(--accent,#c8ff2e)}.pc-promo-msg.err{color:#ff8a7a}
.pc-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:44px;padding:0 20px;border-radius:999px;font:600 14px/1 var(--font-body,Inter,sans-serif);cursor:pointer;text-decoration:none;border:1px solid transparent;transition:transform .3s cubic-bezier(.2,.7,.1,1),background .25s,box-shadow .3s,border-color .25s;white-space:nowrap}
.pc-btn-primary{background:var(--accent,#c8ff2e);color:var(--accent-ink,#0b0d06);box-shadow:0 10px 30px -10px var(--accent,#c8ff2e)}
.pc-btn-primary:hover{transform:translateY(-1px);box-shadow:0 16px 44px -10px var(--accent,#c8ff2e)}
.pc-btn-ghost{color:var(--text,#eceef2);border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.04)}
.pc-btn-ghost:hover{border-color:color-mix(in srgb,var(--accent,#c8ff2e) 60%,transparent);background:rgba(255,255,255,.08)}
.pc-btn.loading{opacity:.75;cursor:progress}
.pc-upsell{margin-top:22px}
.pc-upsell-h{font:600 11px/1 var(--font-body,Inter,sans-serif);letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#8b91a0);margin-bottom:10px}
.pc-upsell-done{font-size:13px;color:var(--muted,#8b91a0)}
.pc-upsell-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pc-up{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 6px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:radial-gradient(80% 60% at 50% 40%,color-mix(in srgb,var(--line-ink) 18%,transparent),transparent 70%),rgba(255,255,255,.025);color:inherit;cursor:pointer;transition:border-color .25s,transform .35s cubic-bezier(.2,.7,.1,1)}
.pc-up:hover{border-color:color-mix(in srgb,var(--line-ink) 55%,transparent);transform:translateY(-2px)}
.pc-up img{height:70px;width:36px;object-fit:contain;opacity:0;transition:opacity .5s;filter:drop-shadow(0 6px 8px rgba(0,0,0,.5))}
.pc-up img.ready{opacity:1}
.pc-up span{font:700 13px/1.1 var(--font-display,'Space Grotesk',sans-serif)}
.pc-up em{font-style:normal;font-size:11px;color:var(--muted,#8b91a0)}
.pc-up i{position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:14px;background:var(--line-ink);color:#0b0c0a}
.pc-foot{position:relative;padding:16px 24px 20px;border-top:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(9,10,13,.4),rgba(9,10,13,.85))}
.pc-foot[hidden]{display:none}
.pc-sum{margin:0;display:grid;gap:7px;font-size:13.5px}
.pc-sum div{display:flex;justify-content:space-between;gap:10px}
.pc-sum dt{color:var(--muted,#8b91a0)}.pc-sum dd{margin:0;font-variant-numeric:tabular-nums}
.pc-sum .save dd{color:var(--accent,#c8ff2e)}
.pc-sum .total{margin-top:6px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);align-items:baseline}
.pc-sum .total dt{color:var(--text,#eceef2);font-weight:600}
.pc-sum .total small{display:block;margin-top:3px;font-size:11.5px;font-weight:400;color:var(--muted,#8b91a0)}
.pc-sum .total dd{font:700 28px/1 var(--font-display,'Space Grotesk',sans-serif);letter-spacing:-.02em}
.pc-cta{width:100%;height:54px;margin-top:14px;font-size:15px}
.pc-cta svg{transition:transform .3s cubic-bezier(.2,.7,.1,1)}.pc-cta:hover svg{transform:translateX(4px)}
.pc-fine{margin-top:10px;text-align:center;font-size:11.5px;color:var(--muted,#8b91a0)}
.pc-empty,.pc-done{display:flex;flex-direction:column;align-items:center;text-align:center;padding:6px 6px 20px}
.pc-empty-stage{position:relative;width:180px;height:250px;margin:4px 0 10px;display:grid;place-items:end center}
.pc-empty-stage::before{content:'';position:absolute;inset:10% 0 0;background:radial-gradient(closest-side,var(--glow,rgba(200,255,46,.2)),transparent);filter:blur(8px)}
.pc-empty-stage img{position:relative;height:230px;width:115px;object-fit:contain;opacity:0;transform:translateY(10px) rotate(-6deg);transition:opacity .7s,transform .9s cubic-bezier(.2,.7,.1,1);filter:drop-shadow(0 18px 20px rgba(0,0,0,.6))}
.pc-empty-stage img.ready{opacity:1;transform:rotate(-6deg);animation:pcFloat 5s ease-in-out infinite}
.pc-empty-floor{position:absolute;bottom:-6px;width:110px;height:16px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.7),transparent)}
@keyframes pcFloat{0%,100%{translate:0 0}50%{translate:0 -8px}}
.pc-empty h3,.pc-done h3{font:700 26px/1.05 var(--font-display,'Space Grotesk',sans-serif);letter-spacing:-.02em}
.pc-empty p,.pc-done p{margin-top:10px;max-width:32ch;font-size:14px;color:var(--muted,#8b91a0)}
.pc-empty-cta{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:20px}
.pc-done .pc-btn{margin-top:22px}
.pc-done-ring{width:84px;height:84px;margin:24px 0 16px;color:var(--accent,#c8ff2e);filter:drop-shadow(0 0 20px var(--accent,#c8ff2e))}
.pc-done-ring svg{width:100%;height:100%;stroke-width:2.4}
.pc-done-ring circle{stroke-dasharray:151;stroke-dashoffset:151;animation:pcDraw .9s .1s cubic-bezier(.2,.7,.1,1) forwards}
.pc-done-ring path{stroke-dasharray:40;stroke-dashoffset:40;animation:pcDraw .5s .75s cubic-bezier(.2,.7,.1,1) forwards}
@keyframes pcDraw{to{stroke-dashoffset:0}}
.pc-done-no{font:600 11px/1 var(--font-body,Inter,sans-serif);letter-spacing:.16em;color:var(--muted,#8b91a0);margin-bottom:10px}
.pc-back{display:inline-flex;align-items:center;gap:6px;padding:6px 10px 6px 4px;margin-bottom:12px;border:0;background:none;color:var(--muted,#8b91a0);font:500 13px/1 var(--font-body,Inter,sans-serif);cursor:pointer;border-radius:999px}
.pc-back:hover{color:var(--text,#eceef2)}
.pc-review{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.pc-review li{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:12px;padding:8px 12px 8px 8px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);font-size:13.5px}
.pc-review img{height:56px;width:28px;object-fit:contain;opacity:0;transition:opacity .4s}.pc-review img.ready{opacity:1}
.pc-review em{font-style:normal;color:var(--muted,#8b91a0)}
.pc-review b{font-weight:600;font-variant-numeric:tabular-nums}
.pc-speed{border:0;margin:20px 0 0;padding:0;display:grid;gap:8px}
.pc-speed legend{font:600 11px/1 var(--font-body,Inter,sans-serif);letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#8b91a0);margin-bottom:10px}
.pc-speed label{position:relative;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.025);cursor:pointer;font-size:13px;color:var(--muted,#8b91a0);transition:border-color .25s,background .25s}
.pc-speed label b{display:block;color:var(--text,#eceef2);font-size:14px;margin-bottom:2px}
.pc-speed label i{margin-left:auto;font-style:normal;color:var(--text,#eceef2);font-weight:600}
.pc-speed input{appearance:none;-webkit-appearance:none;flex:none;width:18px;height:18px;border-radius:50%;border:1.5px solid rgba(255,255,255,.3);margin:0;transition:border .2s}
.pc-speed input:checked{border:5px solid var(--accent,#c8ff2e)}
.pc-speed label:has(input:checked){border-color:color-mix(in srgb,var(--accent,#c8ff2e) 55%,transparent);background:color-mix(in srgb,var(--accent,#c8ff2e) 7%,transparent)}
.pc-note{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:12px 14px;border-radius:14px;font-size:12.5px;color:var(--muted,#8b91a0);background:rgba(255,255,255,.03);border:1px dashed rgba(255,255,255,.14)}
.pc-note svg{flex:none;color:var(--accent,#c8ff2e);margin-top:1px}
.pc .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:520px){
  .pc-panel{top:auto;left:0;right:0;bottom:0;width:100%;height:min(92dvh,760px);border-radius:26px 26px 0 0;transform:translateY(calc(100% + 20px))}
  .pc-panel::before{content:'';position:absolute;top:8px;left:50%;width:40px;height:4px;margin-left:-20px;border-radius:4px;background:rgba(255,255,255,.2)}
  .pc-head{padding:22px 18px 12px}.pc-ship{margin:0 18px 6px}.pc-body{padding:6px 18px 14px}.pc-foot{padding:14px 18px calc(16px + env(safe-area-inset-bottom))}
  .pc-line{grid-template-columns:74px 1fr auto;gap:12px}.pc-thumb{height:100px}
  .pc-sum .total dd{font-size:24px}
}
@media (prefers-reduced-motion:reduce){
  .primo-toast{transition:opacity .2s}[data-cart-count].bump,.nav-cart.catch{animation:none}
  .pc-panel,.pc-scrim{transition:opacity .2s}.pc-panel{transform:none;opacity:0}.pc.open .pc-panel{opacity:1}
  .pc-empty-stage img.ready{animation:none}.pc-done-ring circle,.pc-done-ring path{animation:none;stroke-dashoffset:0}
}
`;

  window.primoCart = api;
  function boot() {
    injectStyles();
    renderCounts();
    if (location.hash === '#cart') { setTimeout(function () { open('cart'); }, 350); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
