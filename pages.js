/* PRIMO secondary pages (shop, about, feedback): theme, bottle renders, reveals and page logic.
   Classic script, loaded with defer after cart.js. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Palette mirrors FLAVOURS in main.js (ink = accent). */
  var FLAVOURS = {
    volt: { name: 'Volt Lime', short: 'Volt', liquid: '#4f6a12', label: '#0f120a', label2: '#2b3a0e', ink: '#c8ff2e',
      glow: 'rgba(200,255,46,0.14)', tint: '#0b0d08', notes: 'Lime · Yuzu',
      desc: 'Sharp lime with a flash of yuzu. The original, and still the loudest thing in the fridge.' },
    berry: { name: 'Midnight Berry', short: 'Berry', liquid: '#2f2458', label: '#100d20', label2: '#2b2257', ink: '#b3a3ff',
      glow: 'rgba(120,100,225,0.20)', tint: '#0c0b14', notes: 'Blackcurrant · Blueberry',
      desc: 'Blackcurrant and wild blueberry, cooled down. Made for late sessions.' },
    glacier: { name: 'Glacier Mint', short: 'Glacier', liquid: '#174a52', label: '#0a181c', label2: '#123c44', ink: '#8fe3dc',
      glow: 'rgba(70,170,180,0.18)', tint: '#080d0f', notes: 'Mint · White grape',
      desc: 'Cold mint and white grape. Clean, crisp and quiet.' },
    ember: { name: 'Ember Citrus', short: 'Ember', liquid: '#6e2e14', label: '#1a0e09', label2: '#4d2010', ink: '#ffae78',
      glow: 'rgba(220,110,60,0.18)', tint: '#100b09', notes: 'Blood orange · Ginger',
      desc: 'Blood orange with a little ginger heat. Bright, warm and fast.' }
  };
  var IDS = Object.keys(FLAVOURS);

  function stored() {
    try { var v = localStorage.getItem('primo:flavour'); return FLAVOURS[v] ? v : null; } catch (e) { return null; }
  }
  var current = stored() || 'volt';

  function themeVars(id) {
    var f = FLAVOURS[id];
    return { '--accent': f.ink, '--ink': f.ink, '--accent-ink': '#0b0c0a', '--glow': f.glow, '--tint': f.tint,
      '--liq': f.liquid, '--lab': f.label, '--lab2': f.label2 };
  }
  function applyTheme(id, opts) {
    if (!FLAVOURS[id]) return;
    opts = opts || {};
    current = id;
    var v = themeVars(id);
    for (var k in v) root.style.setProperty(k, v[k]);
    root.setAttribute('data-flavour', id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', FLAVOURS[id].tint);
    if (opts.persist) { try { localStorage.setItem('primo:flavour', id); } catch (e) {} }
    if (opts.broadcast) {
      try { window.dispatchEvent(new CustomEvent('primo:flavour', { detail: { id: id } })); } catch (e) {}
    }
  }
  applyTheme(current);

  /* ---------- Bottle render (layered SVG, flavour colours via CSS vars) ---------- */
  var uid = 0;
  function bottleSVG(id, opts) {
    opts = opts || {};
    var n = ++uid, p = 'b' + n + '-';
    var f = id ? FLAVOURS[id] : null;
    var style = f ? ' style="--liq:' + f.liquid + ';--lab:' + f.label + ';--lab2:' + f.label2 + ';--ink:' + f.ink + '"' : '';
    var name = f ? f.name : FLAVOURS[current].name;
    var body = 'M66,104 L66,112 C66,152 24,164 24,212 L24,478 C24,498 17,510 17,526 C17,543 32,551 100,551 C168,551 183,543 183,526 C183,510 176,498 176,478 L176,212 C176,164 134,152 134,112 L134,104 Z';
    var ridges = '';
    for (var i = 0; i < 23; i++) { var x = 58 + i * 3.8; ridges += '<rect x="' + x.toFixed(1) + '" y="22" width="1.6" height="58" rx=".8"/>'; }
    var dots = '';
    for (var r = 0; r < 9; r++) for (var c = 0; c < 6; c++) {
      var rad = Math.max(0.4, 2.4 - r * 0.24);
      dots += '<circle cx="' + (128 + c * 8 + (r % 2) * 4) + '" cy="' + (372 + r * 8) + '" r="' + rad.toFixed(2) + '"/>';
    }
    return '' +
'<svg class="pbottle' + (f ? '' : ' pbottle-themed') + (opts.cls ? ' ' + opts.cls : '') + '" viewBox="0 0 200 600" role="img" aria-label="PRIMO ' + name + ' bottle"' + style + '>' +
'<defs>' +
  '<clipPath id="' + p + 'body"><path d="' + body + '"/></clipPath>' +
  '<linearGradient id="' + p + 'liq" x1="0" x2="1"><stop offset="0" style="stop-color:var(--liq);stop-opacity:1" stop-color="#4f6a12"/><stop offset=".22" style="stop-color:var(--liq)" stop-color="#4f6a12" stop-opacity=".78"/><stop offset=".6" style="stop-color:var(--liq)" stop-color="#4f6a12" stop-opacity=".62"/><stop offset="1" style="stop-color:var(--liq)" stop-color="#4f6a12" stop-opacity="1"/></linearGradient>' +
  '<linearGradient id="' + p + 'liqv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".08" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>' +
  '<linearGradient id="' + p + 'lab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lab)" stop-color="#0f120a"/><stop offset=".55" style="stop-color:var(--lab2)" stop-color="#2b3a0e"/><stop offset="1" style="stop-color:var(--lab)" stop-color="#0f120a"/></linearGradient>' +
  '<linearGradient id="' + p + 'cyl" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".62"/><stop offset=".14" stop-color="#000" stop-opacity=".08"/><stop offset=".26" stop-color="#fff" stop-opacity=".14"/><stop offset=".36" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity=".1"/><stop offset=".9" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient>' +
  '<linearGradient id="' + p + 'foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f7f2"/><stop offset=".3" stop-color="#9ea39a"/><stop offset=".48" stop-color="#ffffff"/><stop offset=".62" style="stop-color:var(--ink)" stop-color="#c8ff2e"/><stop offset=".8" stop-color="#8d9188"/><stop offset="1" stop-color="#e9ebe4"/></linearGradient>' +
  '<linearGradient id="' + p + 'cap" x1="0" x2="1"><stop offset="0" stop-color="#050506"/><stop offset=".2" stop-color="#2a2c31"/><stop offset=".32" stop-color="#5b5e66"/><stop offset=".46" stop-color="#1c1d21"/><stop offset=".8" stop-color="#0d0e10"/><stop offset="1" stop-color="#030304"/></linearGradient>' +
  '<linearGradient id="' + p + 'pet" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".08" stop-color="#fff" stop-opacity=".04"/><stop offset=".85" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient>' +
  '<radialGradient id="' + p + 'shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
  '<radialGradient id="' + p + 'caust" cx=".5" cy=".5" r=".5"><stop offset="0" style="stop-color:var(--ink)" stop-color="#c8ff2e" stop-opacity=".55"/><stop offset="1" style="stop-color:var(--ink)" stop-color="#c8ff2e" stop-opacity="0"/></radialGradient>' +
'</defs>' +
/* floor shadow + caustic light the liquid throws */
'<ellipse cx="100" cy="556" rx="96" ry="14" fill="url(#' + p + 'shadow)"/>' +
'<ellipse class="pb-caustic" cx="112" cy="560" rx="70" ry="9" fill="url(#' + p + 'caust)" opacity=".55"/>' +
/* clear PET body + liquid */
'<g clip-path="url(#' + p + 'body)">' +
  '<rect x="0" y="100" width="200" height="460" fill="rgba(200,210,220,.05)"/>' +
  '<g class="pb-liquid"><rect x="0" y="150" width="200" height="410" fill="url(#' + p + 'liq)"/>' +
  '<rect x="0" y="150" width="200" height="410" fill="url(#' + p + 'liqv)"/>' +
  '<path d="M0,150 Q50,146 100,150 T200,150 L200,153 Q150,156 100,153 T0,153 Z" fill="#fff" opacity=".35"/>' +
  '<g fill="#fff" opacity=".5"><circle cx="70" cy="190" r="1.4"/><circle cx="128" cy="176" r="1"/><circle cx="110" cy="200" r="1.8"/><circle cx="58" cy="172" r=".9"/><circle cx="142" cy="196" r="1.2"/></g></g>' +
  '<rect x="0" y="100" width="200" height="460" fill="url(#' + p + 'pet)"/>' +
'</g>' +
/* rings above the label */
'<g opacity=".9"><rect x="23" y="210" width="154" height="4" rx="2" fill="rgba(255,255,255,.16)"/><rect x="23" y="217" width="154" height="4" rx="2" fill="rgba(255,255,255,.1)"/></g>' +
/* label */
'<g clip-path="url(#' + p + 'body)">' +
  '<rect x="0" y="226" width="200" height="250" fill="url(#' + p + 'lab)"/>' +
  '<g fill="none" style="stroke:var(--ink)" stroke="#c8ff2e" stroke-width="14" opacity=".16"><path d="M-20,330 C40,280 90,420 220,300"/><path d="M-20,420 C60,360 120,470 220,380" stroke-width="7" opacity=".7"/></g>' +
  '<g style="fill:var(--ink)" fill="#c8ff2e" opacity=".22">' + dots + '</g>' +
  '<rect x="0" y="226" width="200" height="9" fill="url(#' + p + 'foil)"/>' +
  '<rect x="0" y="467" width="200" height="9" fill="url(#' + p + 'foil)"/>' +
  '<rect x="44" y="240" width="3" height="214" rx="1.5" style="fill:var(--ink)" fill="#c8ff2e" opacity=".9"/>' +
  '<text x="0" y="0" transform="translate(112,452) rotate(-90)" font-family="Space Grotesk, system-ui, sans-serif" font-weight="700" font-size="74" letter-spacing="1" fill="#000" opacity=".45">PRIMO</text>' +
  '<text x="0" y="0" transform="translate(109,449) rotate(-90)" font-family="Space Grotesk, system-ui, sans-serif" font-weight="700" font-size="74" letter-spacing="1" fill="url(#' + p + 'foil)">PRIMO</text>' +
  '<g transform="translate(138,250)"><rect width="30" height="70" rx="15" style="fill:var(--ink)" fill="#c8ff2e"/>' +
    '<text transform="translate(19.5,62) rotate(-90)" font-family="Inter, system-ui, sans-serif" font-weight="600" font-size="9" letter-spacing="1.2" fill="#0b0c0a">' + (f ? f.short.toUpperCase() : FLAVOURS[current].short.toUpperCase()) + '</text></g>' +
  '<text transform="translate(160,460) rotate(-90)" font-family="Inter, system-ui, sans-serif" font-weight="500" font-size="6.5" letter-spacing="1.4" fill="rgba(255,255,255,.55)">HYDRATION · 500 ML</text>' +
  '<rect x="0" y="226" width="200" height="250" fill="url(#' + p + 'cyl)"/>' +
'</g>' +
/* body specular + rim */
'<path d="' + body + '" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.2"/>' +
'<g clip-path="url(#' + p + 'body)"><rect x="40" y="110" width="7" height="440" rx="3.5" fill="#fff" opacity=".22"/><rect x="50" y="120" width="2" height="420" fill="#fff" opacity=".18"/><rect x="164" y="140" width="4" height="400" rx="2" fill="#fff" opacity=".08"/></g>' +
/* neck finish + tamper ring */
'<rect x="64" y="84" width="72" height="22" rx="3" fill="rgba(210,220,230,.18)" stroke="rgba(255,255,255,.2)" stroke-width=".8"/>' +
'<rect x="60" y="94" width="80" height="5" rx="2.5" style="fill:var(--ink)" fill="#c8ff2e" opacity=".9"/>' +
/* cap: slimmer, ribbed, bevelled */
'<rect x="56" y="18" width="88" height="68" rx="9" fill="url(#' + p + 'cap)"/>' +
'<g fill="rgba(255,255,255,.07)">' + ridges + '</g>' +
'<rect x="56" y="18" width="88" height="68" rx="9" fill="url(#' + p + 'cyl)" opacity=".7"/>' +
'<rect x="58" y="16" width="84" height="8" rx="4" fill="#3a3d44"/>' +
'<rect x="62" y="17" width="40" height="2" rx="1" fill="#fff" opacity=".35"/>' +
'<rect x="56" y="80" width="88" height="6" rx="3" fill="#000" opacity=".5"/>' +
'</svg>';
  }
  window.primoPages = { FLAVOURS: FLAVOURS, applyTheme: applyTheme, bottleSVG: bottleSVG, current: function () { return current; } };

  /* ---------- shared: nav, reveals, parallax ---------- */
  var nav = document.getElementById('nav');
  var lastY = scrollY;
  function onScroll() {
    var y = scrollY;
    if (nav) {
      nav.classList.toggle('scrolled', y > 12);
      nav.classList.toggle('hide', y > 240 && y > lastY + 2 && !document.body.classList.contains('dialog-open'));
      if (y < lastY - 2) nav.classList.remove('hide');
    }
    lastY = y;
    if (!reduced) {
      var px = document.querySelectorAll('[data-parallax]');
      for (var i = 0; i < px.length; i++) {
        var el = px[i], r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) continue;
        var k = +el.getAttribute('data-parallax') || 0.2;
        el.style.transform = 'translate3d(0,' + (-(r.top) * k).toFixed(1) + 'px,0) scale(1.12)';
      }
    }
  }
  addEventListener('scroll', function () { requestAnimationFrame(onScroll); }, { passive: true });
  onScroll();

  root.classList.add('pg-js');
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }) : null;
  function observeReveals(scope) {
    var els = (scope || document).querySelectorAll('[data-reveal]:not(.in)');
    for (var i = 0; i < els.length; i++) { if (io && !reduced) io.observe(els[i]); else els[i].classList.add('in'); }
  }
  observeReveals();

  /* count-ups */
  var countIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      var el = e.target, to = +el.getAttribute('data-count-to'), dec = +(el.getAttribute('data-dec') || 0);
      if (reduced) { el.textContent = to.toFixed(dec); return; }
      var t0 = performance.now(), dur = 1400;
      (function tick(t) {
        var k = Math.min(1, (t - t0) / dur), ease = 1 - Math.pow(1 - k, 4);
        el.textContent = (to * ease).toFixed(dec);
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }, { threshold: 0.5 }) : null;
  document.querySelectorAll('[data-count-to]').forEach(function (el) { if (countIO) countIO.observe(el); else el.textContent = el.getAttribute('data-count-to'); });

  /* ---------- real 3D bottle from bottle3d.js (same bottle as the home page), SVG fallback ---------- */
  var b3dPromise = null;
  function loadB3d() {
    if (!b3dPromise) { b3dPromise = import('./bottle3d.js'); b3dPromise.catch(function () {}); }
    return b3dPromise;
  }
  var mounts = [];
  function svgFallback(rec) { rec.el.classList.add('is-svg'); rec.el.innerHTML = bottleSVG(rec.id); }
  document.querySelectorAll('[data-bottle], [data-bottle3d]').forEach(function (el) {
    var attr = el.getAttribute('data-bottle3d') || el.getAttribute('data-bottle') || 'theme';
    var theme = !FLAVOURS[attr];
    var rec = { el: el, theme: theme, id: theme ? current : attr, handle: null, pending: null };
    mounts.push(rec);
    loadB3d().then(function (m) {
      if (!m || !m.mountBottle) throw new Error('mountBottle missing');
      rec.handle = m.mountBottle(el, {
        flavour: rec.pending || rec.id,
        interactive: el.hasAttribute('data-interactive'),
        autoRotate: el.hasAttribute('data-autorotate') && !reduced,
        tilt: +(el.getAttribute('data-tilt3d') || 0),
        turn: +(el.getAttribute('data-turn3d') || 0),
        fit: +(el.getAttribute('data-fit') || 0.9),
        backdrop: el.getAttribute('data-backdrop') || undefined
      });
      if (!rec.handle) throw new Error('WebGL unavailable');
      rec.pending = null;
      el.classList.add('is-3d');
    }).catch(function (err) {
      if (window.console) console.warn('[primo] 3D bottle unavailable, using the SVG fallback.', err);
      svgFallback(rec);
    });
  });
  function refreshThemedBottles(id, skip) {
    id = FLAVOURS[id] ? id : current;
    mounts.forEach(function (r) {
      if (!r.theme || r === skip) return;
      r.id = id;
      if (r.handle) r.handle.setFlavour(id);
      else if (r.el.classList.contains('is-svg')) r.el.innerHTML = bottleSVG(id);
      else r.pending = id;
    });
  }
  window.primoPages.bottles = mounts;

  /* snapshot images ([data-snap]) and smooth scrolling, matching the home page */
  if (window.primoCart) window.primoCart.fillSnaps(document);
  if (window.Lenis && !reduced) {
    try {
      var lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      window.primoLenis = lenis;
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
    } catch (e) {}
  }
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.magnetic').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.16).toFixed(1) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.24).toFixed(1) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }

  /* pointer tilt on bottle stages */
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('[data-tilt]').forEach(function (stage) {
      var inner = stage.querySelector('.stage-inner');
      if (!inner) return;
      stage.addEventListener('pointermove', function (e) {
        var r = stage.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        inner.style.transform = 'rotateY(' + (x * 14).toFixed(2) + 'deg) rotateX(' + (-y * 8).toFixed(2) + 'deg)';
        stage.style.setProperty('--lx', (50 + x * 60).toFixed(1) + '%');
      });
      stage.addEventListener('pointerleave', function () { inner.style.transform = ''; stage.style.removeProperty('--lx'); });
    });
  }

  var page = document.body.getAttribute('data-page');
  var externalFlavour = function (id) {
    applyTheme(id); refreshThemedBottles();
    document.querySelectorAll('input[name="fbFlavour"]').forEach(function (r) { r.checked = r.value === id; });
  };
  var cart = window.primoCart;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }

  /* ======================= SHOP ======================= */
  if (page === 'shop' && cart) {
    var SCENES = { ember: ['06:30', 'The run'], glacier: ['09:00', 'The office'], volt: ['18:00', 'The gym'], berry: ['22:00', 'The desk'] };
    var ORDER = ['ember', 'glacier', 'volt', 'berry'];
    var state = { id: current, pack: 12, sub: false, qty: 1 };
    try {
      var qs = new URLSearchParams(location.search);
      if (FLAVOURS[qs.get('flavour')]) state.id = qs.get('flavour');
      if (cart.PACKS[qs.get('pack')]) state.pack = +qs.get('pack');
    } catch (e) {}
    var heroRec = mounts.filter(function (r) { return r.el.closest('#shopStage'); })[0];
    var addBtn = $('#addBtn');

    function swapText(el, txt) {
      if (!el || el.textContent === txt) return;
      el.textContent = txt;
      if (reduced) return;
      el.classList.remove('swap-in'); void el.offsetWidth; el.classList.add('swap-in');
    }
    function tween(from, to, ms, fn, done) {
      if (reduced) { fn(to); if (done) done(); return; }
      var t0 = performance.now();
      (function step(t) {
        var k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        fn(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step); else if (done) done();
      })(t0);
    }
    var pourToken = 0;
    function pour(id) {
      if (!heroRec) return;
      heroRec.id = id;
      var h = heroRec.handle;
      if (!h) { heroRec.pending = id; return; }
      var tok = ++pourToken;
      if (reduced || !h.setFill) { h.setFlavour(id); return; }
      tween(1, 0.12, 520, function (v) { if (tok === pourToken) h.setFill(v); }, function () {
        if (tok !== pourToken) return;
        h.setFlavour(id);
        tween(0.12, 1, 1100, function (v) { if (tok === pourToken) h.setFill(v); });
      });
    }
    function setSnap(img, id) {
      img.setAttribute('data-snap', id);
      img.setAttribute('data-snapped', '');
      cart.snapshot(id).then(function (url) { if (img.getAttribute('data-snap') === id) { img.src = url; img.classList.add('ready'); } });
    }

    /* pack cases: real bottle renders arranged like a case, back rows smaller and darker */
    var CRATE = { 6: [3, 2, 74, 24], 12: [4, 3, 62, 18], 24: [6, 4, 50, 12.5] };
    function buildCrates() {
      $$('[data-crate]').forEach(function (box) {
        var n = +box.getAttribute('data-crate'), c = CRATE[n];
        if (!box.children.length) {
          var cols = c[0], rows = c[1];
          for (var r = 0; r < rows; r++) {
            for (var k = 0; k < cols; k++) {
              var d = rows > 1 ? (rows - 1 - r) / (rows - 1) : 0, s = 1 - 0.3 * d;
              var img = new Image();
              img.alt = '';
              img.style.cssText = 'left:' + (50 + (k - (cols - 1) / 2) * c[3] * s + d * 3).toFixed(2) + '%;bottom:' + (6 + d * 30).toFixed(2) +
                '%;height:' + (c[2] * s).toFixed(2) + '%;z-index:' + (r + 1) + ';--b:' + (1 - 0.5 * d).toFixed(2) + ';--i:' + (r * cols + k);
              box.appendChild(img);
            }
          }
        }
        $$('img', box).forEach(function (img) { setSnap(img, state.id); });
      });
    }

    function price() {
      var unit = cart.packPrice(state.pack, state.sub), list = cart.PACKS[state.pack].price;
      $('[data-price]').textContent = cart.format(unit);
      var was = $('[data-was]'); was.hidden = !state.sub; was.textContent = cart.format(list);
      $('[data-per]').textContent = cart.format(cart.perBottle(state.pack, state.sub)) + ' / bottle';
      $('[data-add-total]').textContent = cart.format(unit * state.qty);
      $('#qty').textContent = state.qty;
      $$('[data-pp]').forEach(function (el) { el.textContent = cart.format(cart.packPrice(+el.getAttribute('data-pp'), state.sub)); });
      $$('[data-case-price]').forEach(function (el) { el.textContent = cart.format(cart.packPrice(+el.getAttribute('data-case-price'), state.sub)); });
      $$('[data-case-per]').forEach(function (el) { el.textContent = cart.format(cart.perBottle(+el.getAttribute('data-case-per'), state.sub)); });
      $('[data-bar-meta]').textContent = cart.PACKS[state.pack].label + ' · ' + cart.format(unit * state.qty);
      $$('input[name="pack"]').forEach(function (r) { r.checked = +r.value === state.pack; });
      $('#subToggle').checked = state.sub;
    }

    function setFlavour(id, external) {
      if (!FLAVOURS[id]) return;
      var first = !setFlavour.done;
      setFlavour.done = true;
      var changed = id !== state.id;
      state.id = id;
      applyTheme(id, external || first ? {} : { persist: true, broadcast: true });
      var f = FLAVOURS[id], sc = SCENES[id];
      swapText($('[data-name]'), f.name);
      swapText($('[data-word]'), f.short.toUpperCase());
      $('[data-notes]').textContent = f.notes;
      $('[data-desc]').textContent = f.desc;
      $('[data-fl-label]').textContent = f.name;
      $('[data-time]').textContent = sc[0];
      $('[data-scene-name]').textContent = sc[1];
      $('[data-idx]').textContent = '0' + (ORDER.indexOf(id) + 1);
      $('[data-bar-name]').textContent = f.name;
      $$('[data-case-name]').forEach(function (e) { e.textContent = f.short; });
      $$('input[name="flavour"]').forEach(function (r) { r.checked = r.value === id; });
      $$('.sx-scene').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-scene') === id); });
      $$('.sx-hour').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-pick') === id ? 'true' : 'false'); });
      if (first || !changed) { if (heroRec) { heroRec.id = id; if (heroRec.handle) heroRec.handle.setFlavour(id); else heroRec.pending = id; } }
      else pour(id);
      refreshThemedBottles(id, heroRec);
      setSnap($('[data-bar-snap]'), id);
      buildCrates();
      price();
    }

    function addCurrent(from, pack) {
      pack = pack || state.pack;
      var qty = pack === state.pack ? state.qty : 1;
      var line = cart.add(state.id, pack, qty, { sub: state.sub });
      if (!line) return;
      cart.fly(from, state.id);
      cart.toast('Added ' + FLAVOURS[state.id].short + ' · ' + cart.PACKS[pack].label + (qty > 1 ? ' × ' + qty : '') + (state.sub ? ' · subscribed' : ''));
      from.classList.remove('added'); void from.offsetWidth; from.classList.add('added');
    }

    $('#buyForm').addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'flavour') setFlavour(t.value);
      else if (t.name === 'pack') { state.pack = +t.value; state.qty = 1; price(); }
      else if (t.name === 'sub') { state.sub = t.checked; price(); }
    });
    $('#buyForm').addEventListener('submit', function (e) { e.preventDefault(); addCurrent(addBtn); });
    $$('[data-q]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.qty = Math.max(1, Math.min(20, state.qty + +b.getAttribute('data-q')));
        price();
        var o = $('#qty'); o.classList.remove('tick'); void o.offsetWidth; o.classList.add('tick');
      });
    });
    $$('[data-case-add]').forEach(function (b) {
      b.addEventListener('click', function () { addCurrent(b, +b.getAttribute('data-case-add')); });
    });
    $$('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        setFlavour(b.getAttribute('data-pick'));
        var lenis = window.primoLenis;
        if (lenis) lenis.scrollTo(0, { duration: 1.4 }); else scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      });
    });
    var barAdd = $('[data-bar-add]');
    if (barAdd) barAdd.addEventListener('click', function () { addCurrent(barAdd); });

    /* mobile buy bar: shows once the main add button scrolls away */
    var bar = $('#buyBar');
    if (bar && 'IntersectionObserver' in window) {
      var addVisible = true, footVisible = false;
      var sync = function () { bar.classList.toggle('show', !addVisible && !footVisible); };
      new IntersectionObserver(function (es) { addVisible = es[0].isIntersecting; sync(); }).observe(addBtn);
      new IntersectionObserver(function (es) { footVisible = es[0].isIntersecting; sync(); }).observe($('.footer'));
    }

    /* drag hint fades after the first interaction */
    var stage = $('#shopStage');
    if (stage) stage.addEventListener('pointerdown', function () { stage.classList.add('touched'); }, { once: true });

    /* giant word drifts with scroll */
    var word = $('.sx-word');
    var onShopScroll = function () {
      var y = scrollY;
      document.body.style.setProperty('--sx-dim', Math.min(0.78, Math.max(0, (y / innerHeight - 0.35) * 0.9)).toFixed(3));
      if (word && !reduced) word.style.transform = 'translate3d(0,' + (y * 0.25).toFixed(1) + 'px,0)';
    };
    addEventListener('scroll', function () { requestAnimationFrame(onShopScroll); }, { passive: true });
    onShopScroll();

    externalFlavour = function (id) { if (id !== state.id) setFlavour(id, true); };
    setFlavour(state.id, true);
  }

  /* ======================= FEEDBACK ======================= */
  if (page === 'feedback') {
    var form = $('#fbForm');
    var RATING_WORDS = ['', 'Not for me', 'It’s okay', 'Pretty good', 'Really good', 'Obsessed'];
    $$('input[name="fbFlavour"]').forEach(function (r) {
      r.checked = r.value === current;
      r.addEventListener('change', function () { if (r.checked) { applyTheme(r.value, { persist: true, broadcast: true }); refreshThemedBottles(); } });
    });
    var ratingOut = $('#ratingWord');
    function showRating(v) { ratingOut.textContent = v ? RATING_WORDS[v] : 'Tap a drop to rate'; }
    $$('input[name="rating"]').forEach(function (r) {
      r.addEventListener('change', function () { showRating(+r.value); clearErr('rating'); });
    });
    $$('.rating label').forEach(function (l) {
      l.addEventListener('mouseenter', function () { showRating(+l.getAttribute('data-v')); });
    });
    $('.rating').addEventListener('mouseleave', function () { var c = $('input[name="rating"]:checked'); showRating(c ? +c.value : 0); });

    var sweet = $('#sweet'), sweetOut = $('#sweetOut');
    function renderSweet() {
      var v = +sweet.value;
      sweet.style.setProperty('--p', v + '%');
      sweetOut.textContent = v < 20 ? 'Too subtle' : v < 40 ? 'A touch light' : v <= 60 ? 'Just right' : v <= 80 ? 'A touch sweet' : 'Too sweet';
      sweet.setAttribute('aria-valuetext', sweetOut.textContent);
    }
    sweet.addEventListener('input', renderSweet); renderSweet();

    $$('input[name="nps"]').forEach(function (r) { r.addEventListener('change', function () { clearErr('nps'); }); });

    var msgEl = $('#fbMsg'), countEl = $('#fbCount');
    function renderCount() {
      var n = msgEl.value.length;
      countEl.textContent = n + ' / 500';
      countEl.classList.toggle('near', n > 440);
    }
    msgEl.addEventListener('input', renderCount); renderCount();

    function setErr(name, text) {
      var e = $('#err-' + name); if (e) { e.textContent = text; e.hidden = false; }
      var field = $('[data-field="' + name + '"]'); if (field) field.classList.add('has-error');
      $$('[name="' + name + '"]').forEach(function (i) { i.setAttribute('aria-invalid', 'true'); });
    }
    function clearErr(name) {
      var e = $('#err-' + name); if (e) { e.textContent = ''; e.hidden = true; }
      var field = $('[data-field="' + name + '"]'); if (field) field.classList.remove('has-error');
      $$('[name="' + name + '"]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    }
    $('#fbEmail').addEventListener('input', function () { clearErr('email'); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ['rating', 'nps', 'email'].forEach(clearErr);
      var errors = [];
      var rating = $('input[name="rating"]:checked');
      var nps = $('input[name="nps"]:checked');
      var email = $('#fbEmail').value.trim();
      if (!rating) { setErr('rating', 'Pick a rating from 1 to 5.'); errors.push(['rating', 'Rating']); }
      if (!nps) { setErr('nps', 'Choose a number from 0 to 10.'); errors.push(['nps', 'How likely you are to recommend us']); }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErr('email', 'That email doesn’t look right. Leave it blank if you’d rather not share it.'); errors.push(['email', 'Email']); }
      var summary = $('#fbErrors');
      if (errors.length) {
        summary.hidden = false;
        summary.innerHTML = '<p><strong>' + errors.length + (errors.length === 1 ? ' thing needs' : ' things need') + ' a look:</strong></p><ul>' +
          errors.map(function (x) { return '<li><a href="#field-' + x[0] + '">' + x[1] + '</a></li>'; }).join('') + '</ul>';
        summary.focus();
        return;
      }
      summary.hidden = true;
      var tags = $$('input[name="tags"]:checked').map(function (t) { return t.value; });
      var fid = ($('input[name="fbFlavour"]:checked') || {}).value || current;
      $('#okFlavour').textContent = FLAVOURS[fid].name;
      $('#okRating').textContent = rating.value + ' / 5 · ' + RATING_WORDS[+rating.value];
      $('#okSweet').textContent = sweetOut.textContent;
      $('#okNps').textContent = nps.value + ' / 10';
      $('#okTags').textContent = tags.length ? tags.join(', ') : 'None';
      form.hidden = true;
      var ok = $('#fbSuccess'); ok.hidden = false;
      ok.classList.remove('in'); void ok.offsetWidth; ok.classList.add('in');
      $('#okTitle').focus();
      scrollTo({ top: ok.getBoundingClientRect().top + scrollY - 120, behavior: reduced ? 'auto' : 'smooth' });
    });
    $('#fbAgain').addEventListener('click', function () {
      form.reset(); renderSweet(); renderCount(); showRating(0);
      $$('input[name="fbFlavour"]').forEach(function (r) { r.checked = r.value === current; });
      $('#fbSuccess').hidden = true; form.hidden = false;
      var first = $('input[name="fbFlavour"]:checked'); if (first) first.focus();
    });
  }

  /* ======================= ABOUT ======================= */
  if (page === 'about') {
    var tl = $('.timeline');
    if (tl) {
      var fill = $('.timeline-fill', tl);
      var upd = function () {
        var r = tl.getBoundingClientRect();
        var k = Math.min(1, Math.max(0, (innerHeight * 0.65 - r.top) / r.height));
        fill.style.transform = 'scaleY(' + k.toFixed(3) + ')';
      };
      addEventListener('scroll', function () { requestAnimationFrame(upd); }, { passive: true });
      upd();
    }
  }

  /* keep theme in sync when another tab changes the flavour */
  addEventListener('storage', function (e) {
    if (e.key === 'primo:flavour' && FLAVOURS[e.newValue] && e.newValue !== current) externalFlavour(e.newValue);
  });
})();
