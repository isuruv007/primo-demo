import * as THREE from 'three';
import { FLAVOURS, BOTTLE, TAU, studioEnvironment, addStudioLights, createBackdrop, createBottle, fitBottleScale } from './bottle3d.js';

/* =========================================================
   Config
   ========================================================= */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const root = document.documentElement;

// Scroll-driven story: always start at the top.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) scrollTo(0, 0);


const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));
const hexVec = (hex) => { const n = parseInt(hex.slice(1), 16); return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

/* =========================================================
   Smooth scroll + GSAP
   ========================================================= */
const hasGsap = !!window.gsap;
if (hasGsap) gsap.registerPlugin(ScrollTrigger);

let lenis = null;
if (hasGsap && !reduced && window.Lenis) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
window.primo = { lenis }; // handy for debugging scroll positions


document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const el = id.length > 1 ? document.querySelector(id) : document.body;
    if (!el) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(el, { duration: 2 });
    else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });
});

/* =========================================================
   3D scene
   ========================================================= */
function createScene() {
  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('WebGL unavailable, using fallback.', err);
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0); // transparent: the #scenes photo layer shows through
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  /* ---- Studio environment + lights (shared with the shop pages via bottle3d.js) ---- */
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1.0;
  const { rimB } = addStudioLights(scene);

  /* ---- Backdrop replica: lets the clear PET and the liquid refract the photos/rig ---- */
  const backdrop = createBackdrop();
  scene.add(backdrop.mesh);

  /* ---- Bottle (bottle3d.js) ---- */
  const b = createBottle(renderer, { flavour: 'volt', backdrop });
  const bottle = b.group;
  scene.add(bottle);
  const { cap, CENTER } = b;

  /* ---- Ambient particles ---- */
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotCanvas.height = 64;
  const dc = dotCanvas.getContext('2d');
  const dg = dc.createRadialGradient(32, 32, 0, 32, 32, 32);
  dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(1, 'rgba(255,255,255,0)');
  dc.fillStyle = dg; dc.fillRect(0, 0, 64, 64);
  const N = coarse ? 120 : 240;
  const pPos = new Float32Array(N * 3);
  const pSpeed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 14;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 9;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
    pSpeed[i] = 0.05 + Math.random() * 0.2;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.05, map: new THREE.CanvasTexture(dotCanvas), color: 0xc8ff2e, transparent: true, opacity: 0.4,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  /* ---- "Inside the liquid" full-screen shader ---- */
  const liquidUniforms = {
    uTime: { value: 0 }, uOpacity: { value: 0 }, uScroll: { value: 0 }, uAspect: { value: 1 },
    uLevel: { value: 1.3 }, uSlosh: { value: 0 },
    uMid: { value: hexVec(FLAVOURS.volt.liquid) },
    uLight: { value: hexVec(FLAVOURS.volt.ink) },
  };
  const ovScene = new THREE.Scene();
  const ovCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const ovMat = new THREE.ShaderMaterial({
    uniforms: liquidUniforms, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uOpacity, uScroll, uAspect, uLevel, uSlosh;
      uniform vec3 uMid, uLight;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      float caustic(vec2 uv, float t) {
        vec2 p = uv * 6.28318 - 250.0;
        vec2 i = p; float c = 1.0; float inten = 0.005;
        for (int n = 0; n < 4; n++) {
          float tt = t * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
        }
        c /= 4.0;
        c = 1.17 - pow(c, 1.4);
        return pow(abs(c), 8.0);
      }

      float rays(vec2 uv, float t) {
        float x = (uv.x - 0.5) * uAspect;
        float a = x / (1.35 - uv.y);
        float r = (sin(a * 7.0 + t * 0.35) * 0.5 + 0.5) * (sin(a * 13.0 - t * 0.27 + 1.3) * 0.5 + 0.5);
        return pow(r, 3.0) * smoothstep(0.05, 1.0, uv.y);
      }

      float bubbles(vec2 uv, float t) {
        float b = 0.0;
        for (int l = 0; l < 3; l++) {
          float fl = float(l);
          float sc = 5.0 + fl * 4.0;
          vec2 p = vec2(uv.x * uAspect, uv.y) * sc;
          p.y -= t * (0.25 + fl * 0.18) + uScroll * (0.8 + fl * 0.9);
          vec2 id = floor(p);
          vec2 f = fract(p) - 0.5;
          float h = hash(id + fl * 17.0);
          if (h > 0.42) continue;
          vec2 o = vec2(hash(id + 3.1) - 0.5, hash(id + 7.7) - 0.5) * 0.5;
          o.x += sin(t * 1.5 + h * 40.0) * 0.06;
          float r = 0.05 + 0.11 * hash(id + 11.3);
          float d = length(f - o);
          float ring = smoothstep(r, r * 0.82, d) * smoothstep(r * 0.45, r * 0.8, d);
          float spec = smoothstep(r * 0.28, 0.0, length(f - o - vec2(-r * 0.38, r * 0.38)));
          b += (ring * 0.55 + spec) / (1.0 + fl * 0.6);
        }
        return b;
      }

      float droplets(vec2 uv, float t) {
        float d = 0.0;
        for (int l = 0; l < 2; l++) {
          float fl = float(l);
          vec2 p = vec2(uv.x * uAspect, uv.y) * (12.0 + fl * 10.0);
          p.y += t * 0.02 * (1.0 + fl);
          vec2 id = floor(p); vec2 f = fract(p) - 0.5;
          float h = hash(id + fl * 9.0);
          if (h > 0.38) continue;
          vec2 o = vec2(hash(id + 1.7) - 0.5, hash(id + 2.3) - 0.5) * 0.6;
          float r = 0.08 + 0.14 * hash(id + 4.1);
          float dd = length((f - o) * vec2(1.0, 0.85));
          d += smoothstep(r, r * 0.55, dd) * 0.25 + smoothstep(r * 0.32, 0.0, length(f - o - vec2(-r * 0.3, r * 0.3))) * 0.9;
        }
        return d;
      }

      void main() {
        vec2 uv = vUv;
        // liquid surface (drops as the bottle is "drunk")
        float ax = uv.x * uAspect;
        float surf = uLevel + (0.01 + uSlosh * 0.035) * sin(ax * 6.0 + uTime * 2.1) + (0.004 + uSlosh * 0.015) * sin(ax * 15.0 - uTime * 3.3);
        float below = smoothstep(surf + 0.003, surf - 0.003, uv.y);

        // under the surface
        vec3 deep = uMid * 0.16;
        vec3 col = mix(deep, uMid * 1.05, smoothstep(-0.15, 1.2, min(uv.y, surf) + (1.0 - min(1.0, surf))));
        col += uLight * rays(uv, uTime) * 0.16;
        col += uLight * caustic(vec2(ax, uv.y) * 0.8 + vec2(0.0, uScroll * 0.12), uTime * 0.3) * 0.16 * smoothstep(0.3, 1.0, uv.y);
        col += mix(uLight, vec3(1.0), 0.6) * bubbles(uv, uTime) * 0.5;
        col += uLight * 0.14 * exp(-abs(uv.y - surf) * 22.0);

        // above the surface: the empty inside of the bottle
        vec3 air = mix(vec3(0.03, 0.033, 0.04), uMid * 0.4, 0.3);
        float sx = abs(uv.x - 0.5) * 2.0;
        air += vec3(0.11) * smoothstep(0.6, 0.92, sx) * (1.0 - smoothstep(0.93, 1.0, sx));
        air += vec3(0.06) * exp(-pow((uv.x - 0.3) * uAspect * 5.0, 2.0));
        air += mix(uLight, vec3(1.0), 0.75) * droplets(uv, uTime) * 0.3;
        air += uMid * 0.35 * exp(-max(0.0, uv.y - surf) * 16.0);

        col = mix(air, col, below);
        // meniscus highlight
        col += mix(uLight, vec3(1.0), 0.5) * exp(-pow((uv.y - surf) * 260.0, 2.0)) * 0.7;

        float v = length((uv - 0.5) * vec2(uAspect * 0.75, 1.0));
        col *= 1.0 - 0.55 * smoothstep(0.25, 1.0, v);
        col += (hash(uv * 900.0 + fract(uTime)) - 0.5) / 255.0;
        gl_FragColor = vec4(col, uOpacity);
      }`,
  });
  ovScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ovMat));
  // the full-quality underwater path costs ~6ms at ~1.8MP: drop to the cheap path on phones / huge canvases
  function setOverlayQuality() {
    if (!liquidUniforms.uQuality) return;
    liquidUniforms.uQuality.value = (coarse || renderer.domElement.width > 2500) ? 0 : 1;
  }
  // The realistic underwater shader lives in inside-liquid.js; the inline one above is the fallback.
  import('./inside-liquid.js').then((m) => {
    if (!m || typeof m.INSIDE_FRAGMENT !== 'string') return;
    if (m.INSIDE_EXTRA_UNIFORMS) {
      for (const [k, v] of Object.entries(m.INSIDE_EXTRA_UNIFORMS)) if (!(k in liquidUniforms)) liquidUniforms[k] = { value: v };
    }
    ovMat.fragmentShader = m.INSIDE_FRAGMENT;
    ovMat.needsUpdate = true;
    setOverlayQuality();
  }).catch((err) => console.info('inside-liquid.js not available, using built-in shader.', err && err.message));

  /* ---- Backdrop sync ----
     Mirrors the DOM layers behind the canvas (#scenes photos with their Ken Burns transforms
     and crossfades, the grade, and the hero light rig) into the backdrop replica, so the
     transmission pass and the liquid lens see what the visitor sees. */
  const sceneEls = [...document.querySelectorAll('#scenes .scene')].slice(0, 4);
  const texCache = new Map(); // img → { src, tex, pos }
  const bdU = backdrop.uniforms;
  const bdTex = [bdU.uBdTex0, bdU.uBdTex1, bdU.uBdTex2, bdU.uBdTex3];
  const bdRect = [bdU.uBdRect0, bdU.uBdRect1, bdU.uBdRect2, bdU.uBdRect3];
  const parseHex = (v) => { const m = /#([0-9a-f]{6})/i.exec(v || ''); if (!m) return null; const n = parseInt(m[1], 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const parseRgba = (v) => { const m = /rgba?\(([^)]+)\)/.exec(v || ''); if (!m) return null; const a = m[1].split(',').map(parseFloat); const al = a[3] ?? 1; return [a[0] / 255 * al, a[1] / 255 * al, a[2] / 255 * al]; };
  const accTarget = [0.784, 1, 0.18], glowTarget = [0, 0, 0];
  function texFor(img) {
    if (!img || !img.complete || !img.naturalWidth) return null;
    const src = img.currentSrc || img.src;
    let e = texCache.get(img);
    if (!e || e.src !== src) {
      if (e) e.tex.dispose();
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.NoColorSpace; // raw sRGB values: the replica composites like CSS does
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      tex.needsUpdate = true;
      const pos = (getComputedStyle(img).objectPosition || '50% 50%').split(' ').map((v) => (parseFloat(v) || 50) / 100);
      e = { src, tex, pos };
      texCache.set(img, e);
    }
    return e;
  }
  function syncBackdrop(t) {
    const vw = innerWidth, vh = innerHeight;
    bdU.uBdTime.value = t;
    bdU.uBdAspect.value = vw / vh;
    bdU.uBdMobile.value = vw < 820 ? 1 : 0;
    const rs = root.style;
    bdU.uBdRig.value = parseFloat(rs.getPropertyValue('--rig')) || 0;
    const scenesAmt = parseFloat(rs.getPropertyValue('--scenes')) || 0;
    bdU.uBdScenes.value = scenesAmt;
    const acc = parseHex(rs.getPropertyValue('--accent')); if (acc) accTarget.splice(0, 3, ...acc);
    const glw = parseRgba(rs.getPropertyValue('--glow')); if (glw) glowTarget.splice(0, 3, ...glw);
    const A = bdU.uBdAccent.value, G = bdU.uBdGlow.value, k = 0.06;
    A.r += (accTarget[0] - A.r) * k; A.g += (accTarget[1] - A.g) * k; A.b += (accTarget[2] - A.b) * k;
    G.r += (glowTarget[0] - G.r) * k; G.g += (glowTarget[1] - G.g) * k; G.b += (glowTarget[2] - G.b) * k;
    const alpha = bdU.uBdAlpha.value;
    alpha.set(0, 0, 0, 0);
    if (scenesAmt <= 0.001) return;
    for (let i = 0; i < sceneEls.length; i++) {
      const el = sceneEls[i];
      const op = parseFloat(getComputedStyle(el).opacity) || 0;
      if (op <= 0.002) continue;
      const img = el.querySelector('img');
      const e = texFor(img);
      if (!e) continue;
      const r = img.getBoundingClientRect();
      const sc = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
      const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
      const x0 = r.left + (r.width - dw) * e.pos[0], y0 = r.top + (r.height - dh) * e.pos[1];
      bdTex[i].value = e.tex;
      bdRect[i].value.set(x0 / vw, y0 / vh, dw / vw, dh / vh);
      alpha.setComponent(i, Math.min(1, op)); // DOM opacity = --on × --scenes
    }
  }

  /* ---- Scroll-driven poses ----
     Each [data-pose] section declares where the bottle sits when that section is centred
     in the viewport (data-pose-m overrides on phones). Between sections we interpolate.
     fh / fw = fraction of viewport height / width the bottle should fill. */
  const poseEls = [...document.querySelectorAll('[data-pose]')];
  const KEYS = ['x', 'y', 's', 'tilt', 'cap', 'face', 'turn', 'dive', 'focus', 'drain', 'fill'];
  const DEF = { x: 0, y: 0, s: 1, tilt: 0, cap: 0, face: 0, turn: TAU, dive: 0, focus: 0, drain: 0, fill: 1 };
  let poses = [];
  let halfH = 1, halfW = 1;

  const fitScale = (p) => fitBottleScale(halfW, halfH, { tilt: p.tilt, fw: p.fw ?? 0.9, fh: p.fh });
  function readPoses() {
    const mobile = innerWidth < 820;
    poses = poseEls.map((el) => {
      const raw = JSON.parse(el.dataset.pose);
      const p = mobile
        ? { ...DEF, ...raw, x: 0, ...(el.dataset.poseM ? JSON.parse(el.dataset.poseM) : {}) }
        : { ...DEF, ...raw };
      p.s = fitScale(p);
      const r = el.getBoundingClientRect();
      p.at = r.top + scrollY + r.height / 2;
      return p;
    });
  }
  function poseAt(c) {
    if (!poses.length) return DEF;
    if (c <= poses[0].at) return poses[0];
    for (let i = 0; i < poses.length - 1; i++) {
      const a = poses[i], b = poses[i + 1];
      if (c < b.at) {
        const t = smooth((c - a.at) / (b.at - a.at));
        const o = {};
        for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
        return o;
      }
    }
    return poses[poses.length - 1];
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfH = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    halfW = halfH * camera.aspect;
    liquidUniforms.uAspect.value = camera.aspect;
    setOverlayQuality();
    readPoses();
  }
  resize();
  addEventListener('resize', resize);
  new ResizeObserver(() => readPoses()).observe(document.body);
  addEventListener('load', resize);
  if (document.fonts) document.fonts.ready.then(resize);
  setTimeout(resize, 1200);

  /* ---- Pointer ---- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!coarse) {
    addEventListener('pointermove', (e) => {
      mouse.tx = (e.clientX / innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  /* ---- Loop ---- */
  const DIVE_ZOOM = Math.log(10);          // bottle grows ~10x as we dive
  const DIVE_Y = 1.2 + CENTER;            // aim at the liquid just above the label
  const LABEL_Y = (BOTTLE.labelTop + BOTTLE.labelBottom) / 2 + CENTER;
  const cur = { ...DEF, ...poseAt(scrollY + innerHeight / 2) };
  const extra = { spin: 0, intro: 0 };
  let spin = 0;
  let slosh = 0;
  let lastScroll = scrollY;
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    const target = poseAt(scrollY + innerHeight / 2);
    for (const k of KEYS) cur[k] = damp(cur[k], target[k], 5, dt);

    const ds = scrollY - lastScroll;
    lastScroll = scrollY;
    spin += (dt * (reduced ? 0.08 : 0.3) + ds * 0.0025) * (1 - cur.face);
    if (cur.face > 0.01) spin = damp(spin, Math.round(spin / TAU) * TAU, cur.face * 5, dt);

    mouse.x = damp(mouse.x, mouse.tx, 3, dt);
    mouse.y = damp(mouse.y, mouse.ty, 3, dt);

    const dive = cur.dive;
    const calm = 1 - sstep(0, 0.4, dive);
    const zoom = Math.exp(dive * DIVE_ZOOM);
    const s = cur.s * zoom * extra.intro;
    const float = reduced ? 0 : Math.sin(t * 1.3) * 0.05 * calm;
    // focus: frame the label (wordmark) rather than the whole bottle
    const ly = LABEL_Y * s * cur.focus;
    const baseX = cur.x * halfW + ly * Math.sin(cur.tilt);
    const baseY = cur.y * halfH + float - ly * Math.cos(cur.tilt);
    const centre = sstep(0, 0.45, dive);
    bottle.position.set(baseX * (1 - centre), baseY * (1 - centre) - s * DIVE_Y * centre, 0);
    bottle.scale.setScalar(Math.max(0.0001, s));
    bottle.rotation.set(mouse.y * 0.12 * calm, spin + cur.turn + extra.spin + mouse.x * 0.3 * calm, cur.tilt - mouse.x * 0.05 * calm);

    b.setCap(cur.cap);
    b.setFill(cur.fill);
    b.updateLiquid(cur.fill, t);
    syncBackdrop(t);

    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] += pSpeed[i] * dt * (reduced ? 0.2 : 1) - ds * 0.0012 * pSpeed[i];
      if (arr[i * 3 + 1] > 4.5) arr[i * 3 + 1] = -4.5;
      if (arr[i * 3 + 1] < -4.5) arr[i * 3 + 1] = 4.5;
    }
    pGeo.attributes.position.needsUpdate = true;

    const inside = sstep(0.55, 0.9, dive);
    liquidUniforms.uOpacity.value = inside;
    liquidUniforms.uTime.value = t;
    liquidUniforms.uScroll.value = scrollY / innerHeight;
    liquidUniforms.uLevel.value = 1.3 - cur.drain * 1.5;
    slosh = damp(slosh, Math.min(1, Math.abs(ds) * 0.03), 3, dt);
    liquidUniforms.uSlosh.value = slosh;
    root.classList.toggle('is-inside', inside > 0.5);

    renderer.clear();
    if (inside < 0.995) renderer.render(scene, camera);
    if (inside > 0.002) renderer.render(ovScene, ovCam);
  });

  // snap.js uses these: page-Y of each pose anchor (section centre), sorted
  if (window.primo) window.primo.poseAnchors = () => poses.map((p) => p.at).sort((x, y) => x - y);
  if (window.primo) window.primo.three = { renderer, scene, bottle: b, backdrop, shell: b.shell, liquid: b.liquid, label: b.label, cap, shellMat: b.shellMat, liquidMat: b.liquidMat, labelMat: b.labelMat };

  /* ---- Public API ---- */
  function setFlavour(id) {
    const f = FLAVOURS[id];
    if (!f) return;
    const dur = reduced ? 0.01 : 1.1;
    if (!b.setFlavour(id, { duration: hasGsap ? dur : 0 })) return;
    const inkTo = new THREE.Color(f.ink);
    const midTo = hexVec(f.liquid), lightTo = hexVec(f.ink);
    if (hasGsap) {
      gsap.to(extra, { spin: extra.spin + TAU, duration: dur, ease: 'power3.inOut' });
      gsap.to(rimB.color, { r: inkTo.r, g: inkTo.g, b: inkTo.b, duration: dur });
      gsap.to(pMat.color, { r: inkTo.r, g: inkTo.g, b: inkTo.b, duration: dur });
      gsap.to(liquidUniforms.uMid.value, { x: midTo.x, y: midTo.y, z: midTo.z, duration: dur });
      gsap.to(liquidUniforms.uLight.value, { x: lightTo.x, y: lightTo.y, z: lightTo.z, duration: dur });
    } else {
      rimB.color.copy(inkTo); pMat.color.copy(inkTo);
      liquidUniforms.uMid.value.copy(midTo); liquidUniforms.uLight.value.copy(lightTo);
    }
  }

  return { drawLabel: () => b.repaint(), setFlavour, extra };
}

/* =========================================================
   Page interactions
   ========================================================= */
let api = null;
try { api = createScene(); } catch (err) { console.error(err); api = null; }
if (!api) root.classList.add('no-webgl');

const fontsReady = Promise.all([
  document.fonts.load('700 340px "Space Grotesk"'),
  document.fonts.load('600 60px Inter'),
  document.fonts.load('500 26px Inter'),
]).catch(() => {});

// Split headings into masked words
document.querySelectorAll('[data-split]').forEach((el) => {
  el.innerHTML = el.textContent.trim().split(/\s+/)
    .map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
});

function revealOnScroll() {
  if (!hasGsap || reduced) return;
  gsap.utils.toArray('[data-split]').forEach((el) => {
    gsap.from(el.querySelectorAll('.w > span'), {
      yPercent: 115, duration: 1.1, ease: 'expo.out', stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });
  gsap.utils.toArray('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      y: 36, opacity: 0, duration: 1.1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });
  document.querySelectorAll('[data-count]').forEach((el) => {
    const to = +el.dataset.count;
    const o = { v: 0 };
    el.textContent = '0';
    ScrollTrigger.create({
      trigger: el, start: 'top 85%', once: true,
      onEnter: () => gsap.to(o, { v: to, duration: 1.8, ease: 'power3.out', onUpdate: () => (el.textContent = Math.round(o.v)) }),
    });
  });
}

function intro() {
  const loader = document.getElementById('loader');
  if (!loader) { if (api) api.extra.intro = 1; return; }
  if (!hasGsap) { loader.remove(); if (api) api.extra.intro = 1; return; }
  const tl = gsap.timeline();
  tl.to(loader, { opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => loader.remove() });
  if (api) {
    if (reduced) api.extra.intro = 1;
    else {
      tl.fromTo(api.extra, { intro: 0.55 }, { intro: 1, duration: 2.2, ease: 'expo.out' }, 0.1);
      tl.fromTo(api.extra, { spin: -Math.PI }, { spin: 0, duration: 2.4, ease: 'expo.out' }, 0.1);
    }
  }
  if (!reduced) {
    tl.from('[data-intro]', { y: 30, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.08 }, 0.7);
    tl.from('.nav', { y: -20, opacity: 0, duration: 0.9, ease: 'power3.out' }, 0.6);
  }
}

// Nav state + progress bar
const nav = document.getElementById('nav');
const bar = document.querySelector('.progress');
let lastY = scrollY;
function onScroll() {
  const y = scrollY;
  if (nav) {
    nav.classList.toggle('scrolled', y > 40);
    nav.classList.toggle('hide', y > lastY && y > innerHeight * 0.8);
  }
  lastY = y;
  const max = document.documentElement.scrollHeight - innerHeight;
  if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Flavour: driven by scroll (scenes.js fires 'primo:flavour'). If it fires before the
// labels are drawn, remember it and apply once the bottle is ready.
let pendingFlavour = null, bottleReady = false;
addEventListener('primo:flavour', (e) => {
  const id = e.detail && e.detail.id;
  if (!FLAVOURS[id]) return;
  if (api && bottleReady) api.setFlavour(id); else pendingFlavour = id;
});

// Magnetic buttons
if (!coarse && !reduced && hasGsap) {
  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4, ease: 'power3.out' });
    });
    el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' }));
  });
}

// Waitlist form (demo only, nothing is sent)
const form = document.getElementById('joinForm');
const msg = document.getElementById('formMsg');
if (form) form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = form.email.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    form.classList.add('error');
    msg.className = 'form-msg bad';
    msg.textContent = 'That email doesn’t look right. Check it and try again.';
    form.email.focus();
    return;
  }
  form.classList.remove('error');
  form.classList.add('done');
  msg.className = 'form-msg ok';
  msg.textContent = 'You’re on the list. (Demo: nothing was actually sent.)';
});
if (form) form.email.addEventListener('input', () => form.classList.remove('error'));

// Boot
const timeout = new Promise((r) => setTimeout(r, 4000));
Promise.race([fontsReady, timeout]).then(() => {
  if (!location.hash) { lenis ? lenis.scrollTo(0, { immediate: true, force: true }) : scrollTo(0, 0); }
  if (api) api.drawLabel();
  bottleReady = true;
  if (api && pendingFlavour) api.setFlavour(pendingFlavour);
  revealOnScroll();
  intro();
  if (hasGsap) ScrollTrigger.refresh();
});
