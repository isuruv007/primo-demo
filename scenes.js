// PRIMO — life-scene chapters, scroll-driven flavour theming, hero light rig.
// Owns: the #scenes photo layer, the day rail, theme tokens on :root, and the `primo:flavour` event.

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Theme palette per flavour. accent = FLAVOURS[id].ink in main.js.
const THEMES = {
  volt:    { name: 'Volt Lime',      accent: '#c8ff2e', ink: '#0b0d06', glow: 'rgba(200, 255, 46, 0.14)', tint: '#0d0f09' },
  berry:   { name: 'Midnight Berry', accent: '#b3a3ff', ink: '#120d2a', glow: 'rgba(120, 100, 225, 0.20)', tint: '#0d0b18' },
  glacier: { name: 'Glacier Mint',   accent: '#8fe3dc', ink: '#06201e', glow: 'rgba(70, 170, 180, 0.18)',  tint: '#081114' },
  ember:   { name: 'Ember Citrus',   accent: '#ffae78', ink: '#2a1206', glow: 'rgba(220, 110, 60, 0.18)',  tint: '#130c09' },
};
const BASE = 'volt';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const store = {
  get() { try { return localStorage.getItem('primo:flavour'); } catch { return null; } },
  set(id) { try { localStorage.setItem('primo:flavour', id); } catch { /* storage unavailable */ } },
};

let current = null;
function applyTheme(id, { announce = true } = {}) {
  const t = THEMES[id];
  if (!t || id === current) return;
  current = id;
  const s = root.style;
  s.setProperty('--accent', t.accent);
  s.setProperty('--ink', t.accent);
  s.setProperty('--accent-ink', t.ink);
  s.setProperty('--glow', t.glow);
  s.setProperty('--tint', t.tint);
  root.dataset.flavour = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t.tint;
  if (announce) {
    store.set(id);
    window.dispatchEvent(new CustomEvent('primo:flavour', { detail: { id } }));
  }
}

const day = document.querySelector('.day');
const chapters = [...document.querySelectorAll('.chapter')];
const scenes = new Map([...document.querySelectorAll('.scene')].map((el) => [el.dataset.scene, el]));
const layer = document.getElementById('scenes');
const rail = document.querySelector('.day-rail');
const railNum = rail?.querySelector('.rail-num');
const railName = rail?.querySelector('.rail-name');
const railBar = rail?.querySelector('.rail-bar b');
const railDots = rail ? [...rail.querySelectorAll('.rail-dots i')] : [];

let activeIdx = -1;
function setChapter(i) {
  if (i === activeIdx) return;
  activeIdx = i;
  chapters.forEach((c, k) => c.classList.toggle('is-active', k === i));
  const sceneId = i >= 0 ? chapters[i].dataset.scene : null;
  scenes.forEach((el, key) => el.classList.toggle('is-active', key === sceneId));
  if (i >= 0) {
    const id = chapters[i].dataset.flavour;
    if (railNum) railNum.textContent = String(i + 1).padStart(2, '0');
    if (railName) railName.textContent = THEMES[id].name;
    railDots.forEach((d, k) => d.classList.toggle('on', k <= i));
  }
}

let ticking = false;
function update() {
  ticking = false;
  const vh = innerHeight;
  const mid = vh * 0.5;

  // Hero lighting rig: full at the top, gone by the time we dive.
  const rig = 1 - clamp01(scrollY / (vh * 1.4));
  root.style.setProperty('--rig', rig.toFixed(3));

  if (!day || !chapters.length) return;
  const d = day.getBoundingClientRect();
  // Photo layer fades in as the day block arrives and out as it leaves.
  const fadeIn = clamp01((vh - d.top) / (vh * 0.8));
  const fadeOut = clamp01(d.bottom / (vh * 0.7));
  const show = Math.min(fadeIn, fadeOut);
  root.style.setProperty('--scenes', show.toFixed(3));
  root.classList.toggle('in-day', show > 0.5);

  // Active chapter = the one under the viewport centre.
  let idx = -1;
  chapters.forEach((c, k) => {
    const r = c.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) idx = k;
    const p = clamp01((mid - r.top) / r.height);
    c.style.setProperty('--p', p.toFixed(3));
    const sc = scenes.get(c.dataset.scene);
    if (sc) sc.style.setProperty('--p', p.toFixed(3));
    if (k === idx && railBar) railBar.style.transform = `scaleX(${p.toFixed(3)})`;
  });

  // Before the day: base flavour. After it: the last flavour of the day sticks.
  const firstTop = chapters[0].getBoundingClientRect().top;
  const lastBottom = chapters[chapters.length - 1].getBoundingClientRect().bottom;
  if (idx === -1) {
    if (firstTop > mid) applyTheme(BASE);
    else if (lastBottom <= mid) applyTheme(chapters[chapters.length - 1].dataset.flavour);
  } else {
    applyTheme(chapters[idx].dataset.flavour);
  }
  // Keep a scene behind the copy while the layer is fading in/out.
  setChapter(idx !== -1 ? idx : (firstTop > mid ? 0 : chapters.length - 1));
}
function onScroll() {
  if (!ticking) { ticking = true; requestAnimationFrame(update); }
}

// Start on the base flavour so the intro/drinking sequence always matches the hero bottle.
applyTheme(BASE, { announce: false });
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
// Lenis drives native scroll, so 'scroll' fires; poll once more after fonts/layout settle.
addEventListener('load', () => { update(); window.dispatchEvent(new CustomEvent('primo:flavour', { detail: { id: current } })); });
update();

// Cross-page nav links (index.html#flavours) should scroll smoothly on this page.
document.querySelectorAll('a[href^="index.html"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const hash = a.getAttribute('href').split('#')[1] || '';
    const el = hash ? document.getElementById(hash) : document.body;
    if (!el) return;
    e.preventDefault();
    const lenis = window.primo?.lenis;
    if (lenis) lenis.scrollTo(hash ? el : 0, { duration: reduced ? 0 : 1.6 });
    else (hash ? el : document.body).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname);
  });
});

// Decode the scene photos once the page is idle so the crossfades never pop.
const warm = () => document.querySelectorAll('.scene img').forEach((img) => img.decode?.().catch(() => {}));
if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 }); else setTimeout(warm, 1500);
if (layer) layer.classList.add('ready');
