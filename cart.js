/* PRIMO demo cart — classic script, safe on every page.
   window.primoCart API:
     items()                      → array of lines {key, id, pack, qty, sub}
     add(id, pack=1, qty=1, {sub}) → line
     remove(key) / setQty(key, qty) / clear()
     count()                      → total packs in cart
     bottles()                    → total bottles in cart
     subtotal()                   → AUD number (after subscribe discount)
     unitPrice(line) / lineTotal(line) / packPrice(pack, sub)
     format(n)                    → "$12.00"
     on(fn)                       → subscribe to changes, returns unsubscribe
     FLAVOURS, PACKS, SUB_DISCOUNT
   Auto-binds [data-add-to-cart] (+ data-pack, data-qty, data-sub) and [data-cart-count].
   Storage: localStorage 'primo:cart'; falls back to memory. Demo only: nothing is ever sent. */
(function () {
  'use strict';
  var KEY = 'primo:cart';
  var FLAVOURS = {
    volt: { name: 'Volt Lime' },
    berry: { name: 'Midnight Berry' },
    glacier: { name: 'Glacier Mint' },
    ember: { name: 'Ember Citrus' }
  };
  var PACKS = {
    1: { label: 'Single', price: 4.5 },
    6: { label: '6-pack', price: 24 },
    12: { label: '12-pack', price: 45 },
    24: { label: '24-pack', price: 84 }
  };
  var SUB_DISCOUNT = 0.15;
  var memory = [];
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

  function packPrice(pack, sub) {
    var p = PACKS[pack] ? PACKS[pack].price : 0;
    return Math.round(p * (sub ? 1 - SUB_DISCOUNT : 1) * 100) / 100;
  }
  var api = {
    FLAVOURS: FLAVOURS, PACKS: PACKS, SUB_DISCOUNT: SUB_DISCOUNT,
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
      var lines = read();
      if (!qty) return api.remove(key);
      lines.forEach(function (l) { if (l.key === key) l.qty = qty; });
      write(lines);
    },
    clear: function () { write([]); },
    count: function () { return read().reduce(function (n, l) { return n + l.qty; }, 0); },
    bottles: function () { return read().reduce(function (n, l) { return n + l.qty * l.pack; }, 0); },
    packPrice: packPrice,
    unitPrice: function (l) { return packPrice(l.pack, l.sub); },
    lineTotal: function (l) { return Math.round(packPrice(l.pack, l.sub) * l.qty * 100) / 100; },
    subtotal: function () {
      return Math.round(read().reduce(function (s, l) { return s + api.lineTotal(l); }, 0) * 100) / 100;
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
  }

  var lastCount = null;
  function renderCounts() {
    var n = api.count();
    var els = document.querySelectorAll('[data-cart-count]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.textContent = n;
      el.setAttribute('data-count', n);
      if (lastCount !== null && n > lastCount) {
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      }
    }
    var cartLinks = document.querySelectorAll('.nav-cart');
    for (var j = 0; j < cartLinks.length; j++) cartLinks[j].setAttribute('aria-label', 'Cart, ' + n + (n === 1 ? ' item' : ' items'));
    lastCount = n;
  }

  /* toast */
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
      '<a href="shop.html#cart">View cart</a>';
    toastEl.children[1].textContent = msg;
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }
  api.toast = toast;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    e.preventDefault();
    var id = btn.getAttribute('data-add-to-cart');
    var pack = +btn.getAttribute('data-pack') || 1;
    var qty = +btn.getAttribute('data-qty') || 1;
    var sub = btn.getAttribute('data-sub') === 'true';
    var line = api.add(id, pack, qty, { sub: sub });
    if (!line) return;
    toast('Added ' + FLAVOURS[id].name.split(' ')[0] + ' · ' + PACKS[pack].label + (qty > 1 ? ' × ' + qty : ''));
    btn.classList.remove('added'); void btn.offsetWidth; btn.classList.add('added');
  });

  window.addEventListener('storage', function (e) { if (e.key === KEY) emit(); });

  /* Minimal self-contained toast + badge styles so the cart works on any page */
  function injectStyles() {
    if (document.getElementById('primo-cart-css')) return;
    var s = document.createElement('style');
    s.id = 'primo-cart-css';
    s.textContent =
      '.primo-toast{position:fixed;left:50%;bottom:24px;z-index:200;display:flex;align-items:center;gap:12px;' +
      'padding:12px 14px 12px 16px;border-radius:999px;background:rgba(16,18,24,.82);color:#eceef2;' +
      'border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);' +
      'box-shadow:0 20px 60px rgba(0,0,0,.5);font:500 14px/1.2 Inter,system-ui,sans-serif;' +
      'transform:translate(-50%,140%);opacity:0;transition:transform .5s cubic-bezier(.2,.7,.1,1),opacity .4s;pointer-events:none}' +
      '.primo-toast.show{transform:translate(-50%,0);opacity:1;pointer-events:auto}' +
      '.primo-toast-dot{width:8px;height:8px;border-radius:50%;background:var(--accent,#c8ff2e);box-shadow:0 0 12px var(--accent,#c8ff2e)}' +
      '.primo-toast a{color:var(--accent,#c8ff2e);font-weight:600;padding:4px 6px;border-radius:999px}' +
      '[data-cart-count].bump{animation:primoBump .5s cubic-bezier(.2,.7,.1,1)}' +
      '@keyframes primoBump{0%{transform:scale(1)}40%{transform:scale(1.45)}100%{transform:scale(1)}}' +
      '@media (prefers-reduced-motion:reduce){.primo-toast{transition:opacity .2s}[data-cart-count].bump{animation:none}}';
    document.head.appendChild(s);
  }

  window.primoCart = api;
  function boot() { injectStyles(); renderCounts(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
