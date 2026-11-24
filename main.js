import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* =========================================================
   Config
   ========================================================= */
const TAU = Math.PI * 2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const root = document.documentElement;

// Scroll-driven story: always start at the top.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) scrollTo(0, 0);

const FLAVOURS = {
  volt:    { name: 'Volt Lime',      liquid: '#4f6a12', label: '#0f120a', label2: '#2b3a0e', ink: '#c8ff2e', glow: 'rgba(200,255,46,0.14)',
             desc: 'Sharp lime with a flash of yuzu. The original, and still the loudest thing in the fridge.' },
  berry:   { name: 'Midnight Berry', liquid: '#2f2458', label: '#100d20', label2: '#2b2257', ink: '#b3a3ff', glow: 'rgba(120,100,225,0.20)',
             desc: 'Blackcurrant and wild blueberry, cooled down. Made for late sessions.' },
  glacier: { name: 'Glacier Mint',   liquid: '#174a52', label: '#0a181c', label2: '#123c44', ink: '#8fe3dc', glow: 'rgba(70,170,180,0.18)',
             desc: 'Cold mint and white grape. Clean, crisp and quiet.' },
  ember:   { name: 'Ember Citrus',   liquid: '#6e2e14', label: '#1a0e09', label2: '#4d2010', ink: '#ffae78', glow: 'rgba(220,110,60,0.18)',
             desc: 'Blood orange with a little ginger heat. Bright, warm and fast.' },
};

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
   Bottle geometry (units: bottle is ~4.2 tall, ~1.5 wide)
   ========================================================= */
const BOTTLE = { bottom: -1.80, top: 2.42, radius: 0.72, base: 0.765, labelBottom: -1.30, labelTop: 0.90, fill: 1.46, neck: 0.42, capR: 0.49 };
BOTTLE.length = BOTTLE.top - BOTTLE.bottom;
BOTTLE.width = BOTTLE.base * 2;

function bezier(P0, P1, P2, P3, n, out) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
      u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1],
    ]);
  }
}

function bottleProfile() {
  const R = BOTTLE.radius, B = BOTTLE.base, pts = [];
  // slightly domed (push-up) base
  pts.push([0, -1.735], [0.22, -1.75], [0.42, -1.785]);
  // rounded, flared foot
  const rc = 0.13, cx = B - rc, cy = BOTTLE.bottom + rc;
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * (Math.PI / 2);
    pts.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]);
  }
  // foot eases back into the body
  bezier([B, cy], [B, -1.48], [R, -1.46], [R, -1.34], 8, pts);
  // straight label panel
  pts.push([R, -0.4], [R, 0.5], [R, 0.90]);
  // twin decorative rings above the label
  pts.push([R, 0.93], [R + 0.008, 0.955], [R, 0.98], [R, 1.01], [R + 0.008, 1.035], [R, 1.06]);
  // long, gentle shoulder up to a wide neck
  bezier([R, 1.06], [R, 1.40], [BOTTLE.neck + 0.05, 1.56], [BOTTLE.neck, 1.80], 22, pts);
  // neck finish + tamper ring
  pts.push([BOTTLE.neck, 1.84], [0.47, 1.855], [0.47, 1.895], [BOTTLE.neck, 1.905], [BOTTLE.neck - 0.01, 2.0]);
  return pts;
}

function liquidProfile(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const [r, y] = body[i];
    if (y >= BOTTLE.fill) {
      const [r0, y0] = body[i - 1];
      const rf = r0 + (r - r0) * ((BOTTLE.fill - y0) / (y - y0));
      out.push([rf * 0.965, BOTTLE.fill], [0, BOTTLE.fill]);
      break;
    }
    out.push([Math.min(r, BOTTLE.radius) * 0.965, Math.max(y, -1.72)]);
  }
  out[0] = [0, -1.70];
  return out;
}
const LIQ_BOTTOM = -1.72;

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
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rimA = new THREE.PointLight(0xc8ff2e, 26);
  rimA.position.set(-3.2, 1.4, -1.8);
  scene.add(rimA);
  const rimB = new THREE.PointLight(0xc8ff2e, 18);
  rimB.position.set(3.2, -1.2, -1.6);
  scene.add(rimB);

  /* ---- Bottle ---- */
  const v2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
  const body = bottleProfile();

  const bottle = new THREE.Group();
  bottle.rotation.order = 'XZY'; // spin about the bottle's own axis, then tilt
  const inner = new THREE.Group();
  const CENTER = -(BOTTLE.bottom + BOTTLE.top) / 2;
  inner.position.y = CENTER;
  bottle.add(inner);
  scene.add(bottle);

  // PET shell: clear, thick-walled, glossy
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.45, ior: 1.46,
    clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 1.2,
    attenuationColor: new THREE.Color('#e9f2ff'), attenuationDistance: 3,
  });
  inner.add(new THREE.Mesh(new THREE.LatheGeometry(v2(body), 180), shellMat));

  const liquidMat = new THREE.MeshPhysicalMaterial({
    color: FLAVOURS.volt.liquid, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
    emissive: FLAVOURS.volt.liquid, emissiveIntensity: 0.12, envMapIntensity: 0.7, side: THREE.DoubleSide,
  });
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(v2(liquidProfile(body)), 128), liquidMat);
  inner.add(liquid);
  function setFill(f) {
    const k = Math.max(0.0001, Math.min(1, f));
    liquid.visible = f > 0.01;
    liquid.scale.y = k;
    liquid.position.y = LIQ_BOTTOM * (1 - k);
  }

  /* Label: three canvases drawn from one layout
     - colour  (map)
     - ORM     (G = roughness, B = metalness → foil wordmark + bands, satin paper)
     - bump    (embossed wordmark + paper grain)
     A clear window at the back seam lets you see the fill level. */
  const LW = 2048, LH = 986;
  const mk = () => { const c = document.createElement('canvas'); c.width = LW; c.height = LH; return c; };
  const cvColor = mk(), cvOrm = mk(), cvBump = mk();
  const texColor = new THREE.CanvasTexture(cvColor); texColor.colorSpace = THREE.SRGBColorSpace;
  const texOrm = new THREE.CanvasTexture(cvOrm);
  const texBump = new THREE.CanvasTexture(cvBump);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  [texColor, texOrm, texBump].forEach((t) => { t.anisotropy = aniso; });

  const labelMat = new THREE.MeshPhysicalMaterial({
    map: texColor, roughnessMap: texOrm, metalnessMap: texOrm, roughness: 1, metalness: 1,
    bumpMap: texBump, bumpScale: 1.2,
    clearcoat: 0.7, clearcoatRoughness: 0.14,
    iridescence: 0.22, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
    alphaTest: 0.5, side: THREE.FrontSide,
  });
  const labelH = BOTTLE.labelTop - BOTTLE.labelBottom;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.727, 0.727, labelH, 180, 1, true, Math.PI, TAU), labelMat);
  label.position.y = (BOTTLE.labelTop + BOTTLE.labelBottom) / 2;
  inner.add(label);
  // plain paper backing, seen through the clear window from inside the bottle
  const labelBack = new THREE.Mesh(label.geometry, new THREE.MeshStandardMaterial({
    map: texBump, color: 0xd8dbd4, roughness: 0.85, alphaTest: 0.5, side: THREE.BackSide,
  }));
  labelBack.position.copy(label.position);
  inner.add(labelBack);

  const WINDOW = 92; // px each side of the back seam left clear
  const setLS = (c, v) => { if ('letterSpacing' in c) c.letterSpacing = v; };
  function column(c, x, fn) {
    c.save(); c.translate(x, LH / 2); c.rotate(-Math.PI / 2);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    fn(); c.restore();
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // deterministic pseudo-random so all three passes line up
  const rand = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function paint(c, f, pass) {
    const W = LW, H = LH, cx = W / 2;
    const COLOR = pass === 'color', ORM = pass === 'orm', BUMP = pass === 'bump';
    // per-pass "paints": colour / ORM(rough,metal) / bump height
    const P = {
      paper:  COLOR ? null : ORM ? 'rgb(255,120,0)' : '#7a7a7a',
      foil:   COLOR ? null : ORM ? 'rgb(255,46,235)' : '#9a9a9a',
      emboss: COLOR ? null : ORM ? 'rgb(255,40,240)' : '#e0e0e0',
      matte:  COLOR ? null : ORM ? 'rgb(255,175,0)' : '#7a7a7a',
      gloss:  COLOR ? null : ORM ? 'rgb(255,60,0)' : '#8a8a8a',
    };
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    c.globalAlpha = 1;

    // 1. background
    if (COLOR) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, f.label2); g.addColorStop(0.55, f.label); g.addColorStop(1, f.label);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // flowing ribbons
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        for (let x = 0; x <= W; x += 16) {
          const y = H * (0.18 + k * 0.2) + Math.sin((x / W) * TAU * 2 + k * 1.7) * 70 + Math.sin((x / W) * TAU * 5 + k) * 18;
          x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.lineWidth = 46 + k * 22; c.strokeStyle = f.ink; c.globalAlpha = 0.05 + k * 0.025; c.stroke();
      }
      c.globalAlpha = 1;
      // fine halftone dots fading toward the bottom
      c.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = 40; y < H * 0.6; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < W; x += 18) {
        const r = 2.6 * (1 - y / (H * 0.6)); if (r > 0.3) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      }
      // wrap shading toward the back
      const sh = c.createLinearGradient(0, 0, W, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.3)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.03)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
      c.fillStyle = sh; c.fillRect(0, 0, W, H);
    } else {
      c.fillStyle = P.paper; c.fillRect(0, 0, W, H);
      if (BUMP) { // paper grain
        for (let i = 0; i < 9000; i++) {
          c.fillStyle = rand(i) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
          c.fillRect(rand(i + 1) * W, rand(i + 2) * H, 2, 2);
        }
      }
    }

    // 2. foil bands top & bottom
    const band = (y, h) => {
      if (COLOR) {
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, f.ink); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, f.ink);
        c.fillStyle = g;
      } else c.fillStyle = P.foil;
      c.fillRect(0, y, W, h);
    };
    band(0, 16); band(H - 16, 16);
    if (COLOR) { c.fillStyle = f.ink; c.globalAlpha = 0.5; } else c.fillStyle = P.foil;
    c.fillRect(0, 30, W, 3); c.fillRect(0, H - 33, W, 3); c.globalAlpha = 1;

    // 3. wordmark (bottom → top), foil + embossed, with offset shadow
    column(c, cx - 30, () => {
      c.font = '700 330px "Space Grotesk", sans-serif'; setLS(c, '-10px');
      let w = c.measureText('PRIMO').width;
      const max = H * 0.8;
      if (w > max) { const k = max / w; c.scale(k, k); w = max / k; }
      if (COLOR) {
        c.fillStyle = f.ink; c.globalAlpha = 0.9; c.fillText('PRIMO', 10, 12); c.globalAlpha = 1;
        const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#e4e8ee'); g.addColorStop(1, '#ffffff');
        c.fillStyle = g;
      } else c.fillStyle = P.emboss;
      c.fillText('PRIMO', 0, 0);
      c.fillStyle = COLOR ? f.ink : P.emboss;
      c.beginPath(); c.arc(w / 2 + 36, 92, 24, 0, TAU); c.fill();
    });
    // accent spine
    c.fillStyle = COLOR ? f.ink : P.foil;
    c.fillRect(cx + 128, 70, 6, H - 140);
    // flavour pill
    column(c, cx + 200, () => {
      c.font = '700 54px Inter, sans-serif'; setLS(c, '12px');
      const t = f.name.toUpperCase(), w = c.measureText(t).width + 70;
      roundRect(c, -w / 2, -42, w, 84, 42);
      c.fillStyle = COLOR ? f.ink : P.gloss; c.fill();
      c.fillStyle = COLOR ? f.label : P.paper; c.fillText(t, 0, 3);
    });
    column(c, cx + 276, () => {
      c.font = '600 24px Inter, sans-serif'; setLS(c, '16px');
      c.fillStyle = COLOR ? 'rgba(255,255,255,0.7)' : P.paper; c.fillText('ELECTROLYTE  HYDRATION  DRINK', 0, 0);
    });
    column(c, cx - 236, () => {
      c.font = '600 24px Inter, sans-serif'; setLS(c, '18px');
      c.fillStyle = COLOR ? 'rgba(255,255,255,0.5)' : P.paper; c.fillText('DROP 01  ·  ZERO ADDED SUGAR  ·  500 mL', 0, 0);
    });

    // 4. back-left: nutrition panel (matte paper)
    const nx = WINDOW + 80, ny = 150, nw = 400, nh = 640;
    roundRect(c, nx, ny, nw, nh, 14);
    c.fillStyle = COLOR ? '#f1f2ee' : P.matte; c.fill();
    if (COLOR) {
      c.fillStyle = '#111'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; setLS(c, '0px');
      c.font = '800 44px Inter, sans-serif'; c.fillText('Nutrition Facts', nx + 22, ny + 62);
      c.fillRect(nx + 22, ny + 80, nw - 44, 10);
      const rows = [['Serving size', '500 mL'], ['Calories', '25'], ['Total sugars', '1g'], ['  Added sugars', '0g'], ['Sodium', '420mg'], ['Potassium', '370mg'], ['Magnesium', '40mg'], ['Vitamin B6', '100%'], ['Vitamin B12', '100%']];
      c.font = '500 26px Inter, sans-serif';
      rows.forEach(([a, b], i) => {
        const y = ny + 130 + i * 52;
        c.fillText(a, nx + 22, y); c.textAlign = 'right'; c.fillText(b, nx + nw - 22, y); c.textAlign = 'left';
        c.fillRect(nx + 22, y + 16, nw - 44, 2);
      });
      c.font = '500 18px Inter, sans-serif'; c.fillStyle = '#555';
      c.fillText('Ingredients: filtered water, coconut water,', nx + 22, ny + nh - 52);
      c.fillText('citric acid, natural flavours, electrolytes.', nx + 22, ny + nh - 26);
    }
    // 5. back-right: barcode, recycling mark, volume
    const bx = W - WINDOW - 460, by = 560;
    roundRect(c, bx, by, 360, 210, 10);
    c.fillStyle = COLOR ? '#f1f2ee' : P.matte; c.fill();
    if (COLOR) {
      c.fillStyle = '#111';
      let x = bx + 26;
      for (let i = 0; x < bx + 334; i++) { const w = 2 + Math.floor(rand(i + 50) * 4) * 2; if (i % 2 === 0) c.fillRect(x, by + 22, w, 140); x += w; }
      c.font = '500 22px Inter, sans-serif'; c.textAlign = 'center'; setLS(c, '6px');
      c.fillText('0 12345 67890 5', bx + 180, by + 192);
      c.fillStyle = 'rgba(255,255,255,0.78)'; c.textAlign = 'right'; setLS(c, '4px');
      c.font = '700 64px "Space Grotesk", sans-serif'; c.fillText('500 mL', W - WINDOW - 100, 260);
      c.font = '600 24px Inter, sans-serif'; c.fillText('16.9 FL OZ', W - WINDOW - 100, 304);
      c.font = '600 26px Inter, sans-serif';
      ['SHAKE.', 'CHILL.', 'GO.'].forEach((t, i) => c.fillText(t, W - WINDOW - 100, 380 + i * 44));
      // recycling triangle
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 5;
      const rx = W - WINDOW - 160, ry = 470;
      c.beginPath(); c.moveTo(rx, ry - 34); c.lineTo(rx + 34, ry + 26); c.lineTo(rx - 34, ry + 26); c.closePath(); c.stroke();
      c.font = '700 22px Inter, sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillText('1', rx, ry + 16);
    }
    // 6. clear window at the back seam (+ printed edge)
    c.clearRect(0, 0, WINDOW, H); c.clearRect(W - WINDOW, 0, WINDOW, H);
    if (COLOR) { c.fillStyle = f.ink; c.globalAlpha = 0.7; c.fillRect(WINDOW, 0, 4, H); c.fillRect(W - WINDOW - 4, 0, 4, H); c.globalAlpha = 1; }
  }

  function drawLabel(f) {
    paint(cvColor.getContext('2d'), f, 'color');
    paint(cvOrm.getContext('2d'), f, 'orm');
    paint(cvBump.getContext('2d'), f, 'bump');
    texColor.needsUpdate = texOrm.needsUpdate = texBump.needsUpdate = true;
  }

  // Wide sports cap: bevelled lathe + fine knurling, printed top
  const CAP_H = 0.5, CAP_Y = BOTTLE.top - CAP_H / 2;
  const cr = BOTTLE.capR;
  const capProfile = [[0, CAP_H / 2], [cr - 0.06, CAP_H / 2], [cr - 0.02, CAP_H / 2 - 0.012], [cr, CAP_H / 2 - 0.04],
    [cr, -CAP_H / 2 + 0.05], [cr + 0.006, -CAP_H / 2 + 0.03], [cr + 0.006, -CAP_H / 2 + 0.005], [cr - 0.03, -CAP_H / 2], [cr - 0.05, -CAP_H / 2 + 0.06]];
  const dense = [];
  for (let i = 0; i < capProfile.length; i++) {
    dense.push(capProfile[i]);
    const nxt = capProfile[i + 1];
    if (nxt && Math.abs(nxt[1] - capProfile[i][1]) > 0.1) for (let k = 1; k < 8; k++) dense.push([capProfile[i][0], capProfile[i][1] + (nxt[1] - capProfile[i][1]) * k / 8]);
  }
  const capGeo = new THREE.LatheGeometry(v2(dense), 400);
  const cpos = capGeo.attributes.position;
  for (let i = 0; i < cpos.count; i++) {
    const x = cpos.getX(i), z = cpos.getZ(i), y = cpos.getY(i);
    const r = Math.hypot(x, z);
    if (r < cr - 0.001 || y > CAP_H / 2 - 0.05 || y < -CAP_H / 2 + 0.055) continue;
    const a = Math.atan2(x, z);
    const nr = cr - 0.012 + 0.014 * Math.pow(0.5 + 0.5 * Math.cos(a * 100), 1.5);
    cpos.setX(i, (x / r) * nr); cpos.setZ(i, (z / r) * nr);
  }
  capGeo.computeVertexNormals();
  const capMat = new THREE.MeshPhysicalMaterial({ color: 0x14161b, roughness: 0.5, metalness: 0.05, clearcoat: 0.4, clearcoatRoughness: 0.4, sheen: 0.4, sheenColor: new THREE.Color('#5a6070') });
  const cap = new THREE.Group();
  cap.add(new THREE.Mesh(capGeo, capMat));
  const topCanvas = document.createElement('canvas'); topCanvas.width = topCanvas.height = 512;
  const topTex = new THREE.CanvasTexture(topCanvas); topTex.colorSpace = THREE.SRGBColorSpace;
  function drawCapTop(f) {
    const c = topCanvas.getContext('2d');
    c.fillStyle = '#14161b'; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 3;
    for (let r = 60; r < 250; r += 26) { c.beginPath(); c.arc(256, 256, r, 0, TAU); c.stroke(); }
    c.fillStyle = f.ink; c.font = '700 150px "Space Grotesk", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('P', 246, 262); c.beginPath(); c.arc(318, 300, 14, 0, TAU); c.fill();
    topTex.needsUpdate = true;
  }
  const capTop = new THREE.Mesh(new THREE.CircleGeometry(cr - 0.07, 96),
    new THREE.MeshPhysicalMaterial({ map: topTex, roughness: 0.45, clearcoat: 0.5 }));
  capTop.rotation.x = -Math.PI / 2; capTop.position.y = CAP_H / 2 + 0.001;
  cap.add(capTop);
  cap.position.y = CAP_Y;
  inner.add(cap);

  // accent tamper band
  const bandMat = new THREE.MeshStandardMaterial({ color: FLAVOURS.volt.ink, emissive: FLAVOURS.volt.ink, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.2 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.474, 0.474, 0.04, 128), bandMat);
  band.position.y = 1.875;
  inner.add(band);

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

  /* ---- Scroll-driven poses ----
     Each [data-pose] section declares where the bottle sits when that section is centred
     in the viewport (data-pose-m overrides on phones). Between sections we interpolate.
     fh / fw = fraction of viewport height / width the bottle should fill. */
  const poseEls = [...document.querySelectorAll('[data-pose]')];
  const KEYS = ['x', 'y', 's', 'tilt', 'cap', 'face', 'turn', 'dive', 'focus', 'drain', 'fill'];
  const DEF = { x: 0, y: 0, s: 1, tilt: 0, cap: 0, face: 0, turn: TAU, dive: 0, focus: 0, drain: 0, fill: 1 };
  let poses = [];
  let halfH = 1, halfW = 1;

  function fitScale(p) {
    const t = Math.abs(p.tilt);
    const ex = BOTTLE.length * Math.sin(t) + BOTTLE.width * Math.cos(t);
    const ey = BOTTLE.length * Math.cos(t) + BOTTLE.width * Math.sin(t);
    let s = (p.fw ?? 0.9) * 2 * halfW / ex;
    if (p.fh) s = Math.min(s, p.fh * 2 * halfH / ey);
    return s;
  }
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
    readPoses();
  }
  resize();
  addEventListener('resize', resize);
  new ResizeObserver(() => readPoses()).observe(document.body);

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

    cap.position.y = CAP_Y + cur.cap * 0.8;
    cap.rotation.y = -cur.cap * 3.2;
    setFill(cur.fill);

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

  /* ---- Public API ---- */
  let current = 'volt';
  function setFlavour(id) {
    const f = FLAVOURS[id];
    if (!f || id === current) return;
    current = id;
    const liquidTo = new THREE.Color(f.liquid);
    const inkTo = new THREE.Color(f.ink);
    const midTo = hexVec(f.liquid), lightTo = hexVec(f.ink);
    const dur = reduced ? 0.01 : 1.1;
    if (hasGsap) {
      gsap.to(extra, { spin: extra.spin + TAU, duration: dur, ease: 'power3.inOut' });
      gsap.to(liquidMat.color, { r: liquidTo.r, g: liquidTo.g, b: liquidTo.b, duration: dur, ease: 'power2.inOut' });
      gsap.to(liquidMat.emissive, { r: liquidTo.r, g: liquidTo.g, b: liquidTo.b, duration: dur });
      gsap.to(rimB.color, { r: inkTo.r, g: inkTo.g, b: inkTo.b, duration: dur });
      gsap.to(liquidUniforms.uMid.value, { x: midTo.x, y: midTo.y, z: midTo.z, duration: dur });
      gsap.to(liquidUniforms.uLight.value, { x: lightTo.x, y: lightTo.y, z: lightTo.z, duration: dur });
      gsap.delayedCall(dur * 0.42, () => {
        drawLabel(f); drawCapTop(f);
        bandMat.color.copy(inkTo); bandMat.emissive.copy(inkTo);
      });
    } else {
      drawLabel(f); drawCapTop(f); liquidMat.color.copy(liquidTo); liquidMat.emissive.copy(liquidTo); rimB.color.copy(inkTo);
      bandMat.color.copy(inkTo); bandMat.emissive.copy(inkTo);
      liquidUniforms.uMid.value.copy(midTo); liquidUniforms.uLight.value.copy(lightTo);
    }
  }

  return { drawLabel: () => { drawLabel(FLAVOURS[current]); drawCapTop(FLAVOURS[current]); }, setFlavour, extra };
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
  nav.classList.toggle('scrolled', y > 40);
  nav.classList.toggle('hide', y > lastY && y > innerHeight * 0.8);
  lastY = y;
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Flavour configurator
const btns = document.querySelectorAll('.flavour-btn');
const fName = document.getElementById('flavourName');
const fDesc = document.getElementById('flavourDesc');
btns.forEach((b) => b.addEventListener('click', () => {
  const id = b.dataset.flavour;
  const f = FLAVOURS[id];
  btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  root.style.setProperty('--ink', f.ink);
  root.style.setProperty('--glow', f.glow);
  if (hasGsap && !reduced) {
    gsap.timeline()
      .to([fName, fDesc], { y: -12, opacity: 0, duration: 0.25, ease: 'power2.in', stagger: 0.04 })
      .add(() => { fName.textContent = f.name; fDesc.textContent = f.desc; })
      .fromTo([fName, fDesc], { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.05 });
  } else { fName.textContent = f.name; fDesc.textContent = f.desc; }
  if (api) api.setFlavour(id);
}));

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
form.addEventListener('submit', (e) => {
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
form.email.addEventListener('input', () => form.classList.remove('error'));

// Boot
const timeout = new Promise((r) => setTimeout(r, 4000));
Promise.race([fontsReady, timeout]).then(() => {
  if (!location.hash) { lenis ? lenis.scrollTo(0, { immediate: true, force: true }) : scrollTo(0, 0); }
  if (api) api.drawLabel();
  revealOnScroll();
  intro();
  if (hasGsap) ScrollTrigger.refresh();
});
