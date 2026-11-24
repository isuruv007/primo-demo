/* PRIMO: soft one-gesture-per-stop snapping for the home page.
   Each "stop" is a page of the story: every [data-pose] anchor (the bottle pose is exact at the
   element's centre when it sits at the viewport centre, the same rule main.js uses), every
   [data-snap] element, and the very bottom of the page.
   One intentional wheel flick, trackpad swipe, touch swipe or key press moves exactly one stop.
   Trackpad momentum tails are ignored, so a single swipe never skips stops. */

const lenis = window.primo && window.primo.lenis;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (lenis && !reduced) init();

function init() {
  const root = document.documentElement;
  let stops = [];          // [{ y, el, label }]
  let target = null;       // index we are gliding to (null when idle)
  let animating = false;

  /* ---------- stops ---------- */
  const labelFor = (el) => {
    const host = el.closest('section, article, footer') || el;
    const h = host.querySelector('h1, h2, h3');
    const t = (h && h.textContent.trim()) || host.getAttribute('aria-label') || '';
    const k = el.classList.contains('sip') ? ' (sip)' : '';
    return (t.replace(/\s+/g, ' ').slice(0, 48) || 'Section') + k;
  };
  function compute() {
    const vh = innerHeight;
    const max = Math.max(0, root.scrollHeight - vh);
    const els = [...document.querySelectorAll('[data-pose], [data-snap]')];
    const raw = els.map((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top + scrollY;
      // [data-snap="top"] aligns the element's top; everything else centres it (pose rule).
      const y = el.dataset.snap === 'top' ? top : top + r.height / 2 - vh / 2;
      return { y: Math.round(Math.min(max, Math.max(0, y))), el, label: labelFor(el) };
    });
    raw.push({ y: max, el: document.querySelector('footer'), label: 'Footer' });
    raw.sort((a, b) => a.y - b.y);
    stops = [];
    for (const s of raw) {
      const last = stops[stops.length - 1];
      if (last && s.y - last.y < 24) continue;
      stops.push(s);
    }
    buildRail();
    markActive();
  }

  const current = () => {
    const y = lenis.animatedScroll ?? scrollY;
    let best = 0, d = Infinity;
    stops.forEach((s, i) => { const dd = Math.abs(s.y - y); if (dd < d) { d = dd; best = i; } });
    return best;
  };
  // Next stop strictly beyond the current position in direction dir.
  function nextFrom(dir) {
    if (target !== null) return Math.min(stops.length - 1, Math.max(0, target + dir));
    const y = lenis.animatedScroll ?? scrollY;
    if (dir > 0) { const i = stops.findIndex((s) => s.y > y + 2); return i === -1 ? stops.length - 1 : i; }
    for (let i = stops.length - 1; i >= 0; i--) if (stops[i].y < y - 2) return i;
    return 0;
  }

  /* ---------- glide ---------- */
  const ease = (t) => 1 - Math.pow(1 - t, 4); // quartic out: quick to respond, long soft landing
  function go(i, { duration } = {}) {
    if (!stops.length) return;
    i = Math.min(stops.length - 1, Math.max(0, i));
    const from = lenis.animatedScroll ?? scrollY;
    const dist = Math.abs(stops[i].y - from);
    if (dist < 1) { target = null; return; }
    target = i;
    animating = true;
    const dur = duration ?? Math.min(1.25, 0.9 + dist / 6000);
    lenis.scrollTo(stops[i].y, {
      duration: dur, easing: ease, force: true,
      onComplete: () => { if (target === i) { target = null; animating = false; } markActive(); },
    });
    markActive(i);
  }
  const step = (dir) => go(nextFrom(dir));

  /* ---------- wheel / trackpad ---------- */
  const THRESH = 26;          // accumulated px before a gesture counts as intentional
  const GAP = 170;            // ms of silence that ends a gesture
  let gActive = false, gFired = false, acc = 0, lastT = 0, lastAbs = 0, firedAt = 0;
  const editable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  function scrollableParent(el, dy) {
    for (let n = el; n && n !== document.body && n !== root; n = n.parentElement) {
      if (n.nodeType !== 1) continue;
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) {
        if ((dy > 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1) || (dy < 0 && n.scrollTop > 0)) return n;
      }
    }
    return null;
  }
  // Overlays (cart drawer, dialogs) pause snapping; cart.js stops Lenis while they're open.
  const blocked = () => !!(window.primo && primo.lenis && primo.lenis.isStopped) || !!document.querySelector('dialog[open], [aria-modal="true"].open');
  addEventListener('wheel', (e) => {
    if (blocked()) return;
    if (e.ctrlKey) return;                                   // pinch-zoom on trackpads
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;     // horizontal swipes are not ours
    if (scrollableParent(e.target, e.deltaY)) return;        // let inner scrollers scroll
    e.preventDefault();
    e.stopImmediatePropagation();                            // keep Lenis' own wheel smoothing out of it
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    const a = Math.abs(d);
    const now = performance.now();
    const gap = now - lastT;
    // A new gesture starts after silence, a direction flip, or a fresh ramp-up on top of a decaying tail.
    const flip = gActive && Math.sign(d) !== Math.sign(acc) && a > 4;
    const ramp = gActive && gFired && now - firedAt > 260 && a > Math.max(lastAbs * 1.8, 12) && a > 20;
    if (!gActive || gap > GAP || flip || ramp) { gActive = true; gFired = false; acc = 0; }
    acc += d; lastT = now; lastAbs = a;
    if (!gFired && Math.abs(acc) >= THRESH) { gFired = true; firedAt = now; step(Math.sign(acc)); }
  }, { passive: false, capture: true });

  /* ---------- keys ---------- */
  addEventListener('keydown', (e) => {
    if (blocked()) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const a = document.activeElement;
    if (editable(a)) return;
    let dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
    else if (e.key === ' ') {
      if (a && /^(BUTTON|A|SUMMARY)$/.test(a.tagName)) return;
      dir = e.shiftKey ? -1 : 1;
    } else if (e.key === 'Home') { e.preventDefault(); go(0); return; }
    else if (e.key === 'End') { e.preventDefault(); go(stops.length - 1); return; }
    if (!dir) return;
    e.preventDefault();
    step(dir);
  }, true);

  /* ---------- touch ---------- */
  // We drive the drag ourselves (1:1 with the finger) so native momentum can't fight the glide.
  let tY0 = 0, tY = 0, tS0 = 0, tT = 0, vel = 0, touching = false, startIdx = 0, dragged = false;
  addEventListener('touchstart', (e) => {
    if (blocked()) { touching = false; return; }
    if (e.touches.length !== 1 || editable(e.target) || scrollableParent(e.target, 1) || scrollableParent(e.target, -1)) { touching = false; return; }
    touching = true; dragged = false;
    tY0 = tY = e.touches[0].clientY; tT = performance.now(); vel = 0;
    tS0 = lenis.animatedScroll ?? scrollY;
    startIdx = target ?? current();
    if (animating) { lenis.scrollTo(tS0, { immediate: true, force: true }); target = null; animating = false; }
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!touching || e.touches.length !== 1) return;
    const y = e.touches[0].clientY, now = performance.now();
    const dt = Math.max(1, now - tT);
    vel = 0.8 * ((tY - y) / dt) + 0.2 * vel;   // px/ms, positive = scrolling down
    tY = y; tT = now;
    if (Math.abs(tY0 - y) > 6) dragged = true;
    if (!dragged) return;
    e.preventDefault();
    const max = root.scrollHeight - innerHeight;
    lenis.scrollTo(Math.min(max, Math.max(0, tS0 + (tY0 - y))), { immediate: true, force: true });
  }, { passive: false });
  const touchEnd = () => {
    if (!touching) return;
    touching = false;
    if (!dragged) return;
    const dy = tY0 - tY;
    const fresh = performance.now() - tT < 120;           // finger was still moving at release
    const flick = fresh && Math.abs(vel) > 0.35;
    if (flick) {
      // One swipe = one stop from where the swipe began (further only if the drag itself passed stops).
      const dir = Math.sign(vel);
      const y = lenis.animatedScroll ?? scrollY;
      let k = startIdx + dir;
      while (stops[k + dir] && (dir > 0 ? stops[k].y < y - 2 : stops[k].y > y + 2)) k += dir;
      go(k);
      return;
    }
    // Slow drag: free movement, then settle. Commit to the neighbouring stop once a quarter of the way there.
    let k = current();
    const n = stops[startIdx + Math.sign(dy)];
    if (k === startIdx && n && Math.abs(dy) > Math.abs(n.y - stops[startIdx].y) * 0.25) k = startIdx + Math.sign(dy);
    go(k);
  };
  addEventListener('touchend', touchEnd, { passive: true });
  addEventListener('touchcancel', touchEnd, { passive: true });

  /* ---------- anchors: land on the section's stop, not its raw top ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"], a[href^="index.html"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute('href');
    const id = href.startsWith('#') ? href : '#' + (href.split('#')[1] || '');
    let el; try { el = id.length > 1 ? document.querySelector(id) : document.body; } catch { return; }
    if (!el) return;
    let i = id.length > 1 ? stops.findIndex((s) => s.el && (s.el === el || el.contains(s.el))) : 0;
    if (i === -1) {
      const top = el.getBoundingClientRect().top + scrollY;
      i = stops.findIndex((s) => s.y >= top - innerHeight / 2);
      if (i === -1) i = stops.length - 1;
    }
    e.preventDefault();
    e.stopPropagation();                                     // replaces the raw-top anchor scrolls in main.js / scenes.js
    go(i, { duration: Math.min(2, 1 + Math.abs(stops[i].y - scrollY) / 8000) });
    history.replaceState(null, '', id.length > 1 ? id : location.pathname);
  }, true);

  /* ---------- free scroll (scrollbar drag etc.) settles nowhere; just keep the rail honest ---------- */
  lenis.on('scroll', () => { if (target === null) markActive(); });

  /* ---------- rail ---------- */
  const rail = document.querySelector('.snap-rail');
  let railBtns = [];
  function buildRail() {
    if (!rail) return;
    rail.innerHTML = '';
    railBtns = stops.map((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'snap-tick';
      b.setAttribute('aria-label', `Go to ${s.label}`);
      b.title = s.label;
      b.addEventListener('click', () => go(i));
      rail.appendChild(b);
      return b;
    });
  }
  let lastActive = -1;
  function markActive(i = current()) {
    if (i === lastActive || !railBtns.length) return;
    lastActive = i;
    railBtns.forEach((b, j) => b.classList.toggle('on', j === i));
    railBtns.forEach((b, j) => b.toggleAttribute('aria-current', j === i));
  }

  /* ---------- keep stops fresh ---------- */
  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
  addEventListener('resize', schedule);
  addEventListener('load', schedule);
  if (document.fonts) document.fonts.ready.then(schedule);
  new ResizeObserver(schedule).observe(document.body);
  compute();
  root.classList.add('has-snap');

  window.primo.snap = { stops: () => stops.map((s) => ({ y: s.y, label: s.label })), go, step, current, refresh: compute };
}
