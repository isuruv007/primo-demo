/* PRIMO bottle: the one source of truth for the 3D bottle.
   Used by the home page (main.js) and by the shop/about/feedback pages.

   Exports
     FLAVOURS, BOTTLE
     studioEnvironment(renderer)        PMREM studio env (cached per renderer)
     addStudioLights(scene)             key + rim lights matching the home page
     createBackdrop({ color })          WebGL replica of what sits behind the canvas, so the
                                        clear PET and the liquid can refract it (see below)
     createBottle(renderer, opts)       the bottle meshes + label painting + flavour switching
     mountBottle(el, opts)              live, transparent-background bottle inside an element
     bottleSnapshot(flavour, opts)      cached object URL of a transparent PNG render

   Why a backdrop: three.js transmission can only refract what is inside the WebGL scene.
   The page photos / light rig are DOM layers behind a transparent canvas, so we draw a
   replica of them into the transmission pass only (it is invisible on the canvas itself)
   and the liquid shader samples the same replica through a lens. */
import * as THREE from 'three';

export const TAU = Math.PI * 2;

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
export { FLAVOURS };

/* =========================================================
   Bottle geometry (units: bottle is ~4.2 tall, ~1.5 wide)
   ========================================================= */
const BOTTLE = { bottom: -1.80, top: 2.30, radius: 0.72, base: 0.765, labelBottom: -1.30, labelTop: 0.90, fill: 1.46, neck: 0.42, capR: 0.462 };
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

// Neck finish (PCO-style): support ring, tamper band seat, threads, lip.
const NECK = { ring: 1.835, threadsFrom: 1.995, threadsTo: 2.245, lip: 2.275, finishR: 0.402 };

function bottleProfile() {
  const R = BOTTLE.radius, B = BOTTLE.base, pts = [];
  // pushed-up base (visible through the clear plastic)
  pts.push([0, -1.60], [0.12, -1.612], [0.24, -1.65], [0.36, -1.72], [0.46, -1.778]);
  // rounded, flared foot
  const rc = 0.12, cx = B - rc, cy = BOTTLE.bottom + rc;
  for (let i = 0; i <= 14; i++) {
    const a = -Math.PI / 2 + (i / 14) * (Math.PI / 2);
    pts.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]);
  }
  // foot eases back into the body, with a crisp moulded step under the label
  bezier([B, cy], [B, -1.50], [R + 0.012, -1.47], [R + 0.012, -1.405], 10, pts);
  pts.push([R + 0.012, -1.385], [R, -1.372], [R, -1.34]);
  // straight label panel
  pts.push([R, -0.4], [R, 0.5], [R, 0.90]);
  // twin crisp moulded rings above the label
  pts.push([R, 0.925], [R + 0.014, 0.935], [R + 0.014, 0.965], [R, 0.975], [R, 1.005],
    [R + 0.014, 1.015], [R + 0.014, 1.045], [R, 1.055], [R, 1.07]);
  // long, gentle shoulder up to a wide neck (fluted later)
  bezier([R, 1.07], [R, 1.40], [BOTTLE.neck + 0.05, 1.56], [BOTTLE.neck, 1.80], 34, pts);
  // neck support ring
  pts.push([BOTTLE.neck, 1.815], [0.505, NECK.ring - 0.008], [0.512, NECK.ring + 0.004], [0.505, NECK.ring + 0.03],
    [BOTTLE.neck, NECK.ring + 0.04]);
  // tamper-band seat
  pts.push([0.415, 1.90], [0.428, 1.92], [0.428, 1.955], [NECK.finishR, 1.975]);
  // thread zone (dense so the helix displacement reads)
  for (let y = NECK.threadsFrom; y <= NECK.threadsTo + 1e-6; y += 0.0045) pts.push([NECK.finishR, y]);
  // rounded lip + inner bore
  pts.push([0.40, NECK.lip - 0.015], [0.392, NECK.lip], [0.372, NECK.lip + 0.004], [0.356, NECK.lip - 0.01], [0.35, 2.17]);
  return pts;
}

/* Surface details applied as displacement on the lathe:
   - 9 soft flutes running up the shoulder (grip + light catchers)
   - a 5-petal pushed-up base
   - a helical thread on the finish */
const smoothR = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function flute(a, y) {
  const env = smoothR(1.12, 1.26, y) * (1 - smoothR(1.60, 1.76, y));
  return 1 - 0.05 * Math.pow(0.5 + 0.5 * Math.cos(a * 9), 2.2) * env;
}
function petal(a, y) {
  const w = 1 - smoothR(-1.785, -1.60, y);
  return Math.pow(0.5 + 0.5 * Math.cos(a * 5), 3) * w;
}
function sculpt(geo, { threads = false, base = true, inset = 1 } = {}) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const a = Math.atan2(x, z);
    let k = flute(a, y);
    let ny = y;
    if (base && y < -1.55 && r > 0.2) {
      const v = petal(a, y);
      k *= 1 - 0.085 * v;
      ny = y + 0.06 * v * smoothR(0.2, 0.5, r) * inset;
    }
    let nr = r * k;
    if (threads && y > NECK.threadsFrom && y < NECK.threadsTo && r > 0.39) {
      const env = smoothR(NECK.threadsFrom, NECK.threadsFrom + 0.03, y) * (1 - smoothR(NECK.threadsTo - 0.03, NECK.threadsTo, y));
      const ph = a + TAU * (y - NECK.threadsFrom) / 0.085;
      nr += 0.022 * Math.pow(Math.max(0, Math.cos(ph)), 3) * env;
    }
    p.setXYZ(i, (x / r) * nr, ny, (z / r) * nr);
  }
  geo.computeVertexNormals();
  // weld the lathe seam normals (first and last ring share positions)
  const n = geo.attributes.normal;
  const per = geo.userData.points, segs = geo.userData.segments;
  if (per && segs) {
    for (let j = 0; j < per; j++) {
      const i0 = j, i1 = segs * per + j;
      const nx = n.getX(i0) + n.getX(i1), nyy = n.getY(i0) + n.getY(i1), nz = n.getZ(i0) + n.getZ(i1);
      const l = Math.hypot(nx, nyy, nz) || 1;
      n.setXYZ(i0, nx / l, nyy / l, nz / l); n.setXYZ(i1, nx / l, nyy / l, nz / l);
    }
  }
  return geo;
}
function lathe(pts, segs) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.userData.points = pts.length; g.userData.segments = segs;
  return g;
}

function liquidProfile(body) {
  // inner surface of the wall: pulled in and lifted off the base
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const [r, y] = body[i];
    if (y >= BOTTLE.fill) {
      const [r0, y0] = body[i - 1];
      const rf = r0 + (r - r0) * ((BOTTLE.fill - y0) / (y - y0));
      // meniscus: the surface climbs the wall slightly
      out.push([rf * 0.962, BOTTLE.fill + 0.012], [rf * 0.93, BOTTLE.fill], [rf * 0.8, BOTTLE.fill - 0.004], [0, BOTTLE.fill - 0.004]);
      break;
    }
    const lift = y < -1.3 ? 0.028 : 0;
    out.push([Math.min(r, BOTTLE.radius + 0.012) * 0.962, y + lift]);
  }
  out[0] = [0, body[0][1] + 0.03];
  return out;
}
const LIQ_BOTTOM = -1.76;
export { BOTTLE };

/* ---------- Studio environment ---------- */
const envCache = new WeakMap();
export function studioEnvironment(renderer) {
  if (envCache.has(renderer)) return envCache.get(renderer);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30),
    new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.BackSide }));
  env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x0b0b0d }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -6;
  env.add(floor);
  const box = (w, h, x, y, z, ry, rx, I, tint = 0xffffff) => {
    const m = new THREE.MeshBasicMaterial({ color: tint });
    m.color.multiplyScalar(I);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(x, y, z); p.rotation.set(rx, ry, 0);
    env.add(p);
  };
  box(1.4, 11, -6.5, 0.5, 2.5, Math.PI / 2 - 0.35, 0, 9);          // key strip, left-front
  box(1.0, 11, 6.5, 0.2, -1.0, -Math.PI / 2 + 0.2, 0, 6);          // rim strip, right-back
  box(0.6, 9, -3.0, 0, -8.0, 0.25, 0, 3.2, 0xfff2e0);              // warm back kicker
  box(9, 9, 0, 9.5, 0, 0, Math.PI / 2, 2.2);                        // overhead
  box(10, 4, 0, -2.5, 10, Math.PI, 0, 0.35);                       // dim front fill
  const tex = pmrem.fromScene(env, 0.015).texture;
  pmrem.dispose();
  envCache.set(renderer, tex);
  return tex;
}

export function addStudioLights(scene, ink = FLAVOURS.volt.ink) {
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x0a0a0c, 0.25));
  const key = new THREE.DirectionalLight(0xfff6ea, 1.5);
  key.position.set(-3.5, 4, 5);
  scene.add(key);
  const rimA = new THREE.PointLight(0xffffff, 16);
  rimA.position.set(-3.2, 1.6, -2.2);
  scene.add(rimA);
  const rimB = new THREE.PointLight(ink, 10);
  rimB.position.set(3.2, -1.0, -1.8);
  scene.add(rimB);
  return { key, rimA, rimB };
}

/* ---------- Backdrop replica ----------
   Screen-space: suv is (0,0) top-left → (1,1) bottom-right, like CSS.
   All compositing happens in sRGB (like CSS), converted to linear at the end.
   Layers: base colour → hero light rig (beams, sweep, floor glow) → up to 4 photos
   (object-fit: cover rects measured from the DOM, already including Ken Burns transforms)
   → the scene grade (dark gradients, vignette, accent soft-light, glow haze). */
export const BACKDROP_GLSL = /* glsl */`
  uniform vec3 uBdBase, uBdAccent, uBdGlow;
  uniform float uBdRig, uBdScenes, uBdMobile, uBdTime, uBdGain, uBdAspect;
  uniform sampler2D uBdTex0, uBdTex1, uBdTex2, uBdTex3;
  uniform vec4 uBdRect0, uBdRect1, uBdRect2, uBdRect3;
  uniform vec4 uBdAlpha;
  vec3 bdScreen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }
  vec3 bdPhoto(sampler2D t, vec4 r, vec2 suv) {
    vec2 q = (suv - r.xy) / max(r.zw, vec2(1e-4));
    q = clamp(q, 0.0, 1.0);
    vec3 c = texture2D(t, vec2(q.x, 1.0 - q.y)).rgb;
    // CSS: filter: brightness(.6) contrast(1.1) saturate(.82)
    c *= 0.6;
    c = (c - 0.5) * 1.1 + 0.5;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 0.82);
    return clamp(c, 0.0, 1.0);
  }
  float bdBeam(vec2 p, vec2 o, float ang, float w) {
    // a soft light shaft hanging from o, rotated by ang, fading downwards
    vec2 d = p - o;
    float c = cos(ang), s = sin(ang);
    vec2 r = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
    float across = exp(-pow(r.x / w, 2.0));
    float along = smoothstep(1.3, 0.0, r.y) * step(-0.2, r.y);
    return across * along;
  }
  vec3 backdrop(vec2 suv) {
    vec3 col = uBdBase;
    vec2 p = vec2(suv.x * uBdAspect, suv.y);
    // hero rig
    if (uBdRig > 0.001) {
      float t = uBdTime;
      float b1 = bdBeam(p, vec2((0.35) * uBdAspect, -0.25), radians(20.0 - 4.0 * (0.5 + 0.5 * sin(t * 0.285))), 0.16 * uBdAspect);
      float b2 = bdBeam(p, vec2((0.73) * uBdAspect, -0.25), radians(-24.0 + 4.0 * (0.5 + 0.5 * sin(t * 0.24))), 0.16 * uBdAspect);
      vec3 rig = uBdAccent * 0.2 * b1 * 0.6 + vec3(0.725, 0.78, 1.0) * 0.13 * b2;
      float fl = exp(-pow(length((suv - vec2(0.5, 1.02)) * vec2(1.0, 2.2)) / 0.42, 2.0));
      rig += uBdAccent * 0.16 * fl;
      float sw = fract(t / 8.0); sw = sw < 0.7 ? smoothstep(0.0, 1.0, sw / 0.7) : 1.0;
      float sx = (suv.x - 0.5) * cos(radians(15.0)) + (suv.y - 0.5) * sin(radians(15.0));
      float band = exp(-pow((sx - mix(-0.65, 0.65, sw)) / 0.03, 2.0));
      rig += mix(vec3(0.05), uBdAccent * 0.12, 0.5) * band;
      col = bdScreen(col, rig * uBdRig);
    }
    // photos
    if (uBdScenes > 0.001) {
      col = mix(col, bdPhoto(uBdTex0, uBdRect0, suv), uBdAlpha.x);
      col = mix(col, bdPhoto(uBdTex1, uBdRect1, suv), uBdAlpha.y);
      col = mix(col, bdPhoto(uBdTex2, uBdRect2, suv), uBdAlpha.z);
      col = mix(col, bdPhoto(uBdTex3, uBdRect3, suv), uBdAlpha.w);
      // grade (desktop: from the left; phones: from the bottom)
      vec3 dark = vec3(6.0, 7.0, 9.0) / 255.0;
      float x = suv.x, y = 1.0 - suv.y;
      float gd = x < 0.3 ? mix(0.9, 0.62, x / 0.3) : x < 0.6 ? mix(0.62, 0.12, (x - 0.3) / 0.3) : mix(0.12, 0.35, (x - 0.6) / 0.4);
      float gb = mix(0.75, 0.0, clamp(y / 0.32, 0.0, 1.0));
      float vg = smoothstep(0.42, 1.0, length((suv - vec2(0.62, 0.45)) / vec2(1.3, 0.95))) * 0.72;
      float gm = y < 0.34 ? mix(0.94, 0.7, y / 0.34) : y < 0.62 ? mix(0.7, 0.12, (y - 0.34) / 0.28) : mix(0.12, 0.45, (y - 0.62) / 0.38);
      float vgm = smoothstep(0.4, 1.0, length((suv - vec2(0.5, 0.35)) / vec2(1.2, 0.8))) * 0.7;
      vec3 g = col;
      if (uBdMobile > 0.5) { g = mix(g, dark, gm); g = mix(g, vec3(0.0), vgm); }
      else { g = mix(g, dark, gd); g = mix(g, dark, gb); g = mix(g, vec3(0.0), vg); }
      // accent soft-light wash (opacity .2)
      vec3 sl = mix(2.0 * g * uBdAccent + g * g * (1.0 - 2.0 * uBdAccent), sqrt(g) * (2.0 * uBdAccent - 1.0) + 2.0 * g * (1.0 - uBdAccent), step(0.5, uBdAccent));
      g = mix(g, sl, 0.2);
      // glow haze where the bottle stands (screen)
      float hz = smoothstep(1.0, 0.0, length((p - vec2((uBdMobile > 0.5 ? 0.5 : 0.68) * uBdAspect, 0.5)) / vec2(0.62, 0.56)) / 0.7);
      g = bdScreen(g, uBdGlow * hz);
      col = mix(col, g, uBdScenes);
    }
    col = pow(max(col, vec3(0.0)), vec3(2.2)) * uBdGain;
    return col;
  }
`;

export function createBackdrop({ color = '#090a0d', accent = FLAVOURS.volt.ink, glow = '#000000' } = {}) {
  const rawColor = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return new THREE.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  const uniforms = {
    uBdBase: { value: rawColor(color) }, uBdAccent: { value: rawColor(accent) }, uBdGlow: { value: rawColor(glow) },
    uBdRig: { value: 0 }, uBdScenes: { value: 0 }, uBdMobile: { value: 0 }, uBdTime: { value: 0 }, uBdGain: { value: 1.15 },
    uBdAspect: { value: 1 },
    uBdTex0: { value: null }, uBdTex1: { value: null }, uBdTex2: { value: null }, uBdTex3: { value: null },
    uBdRect0: { value: new THREE.Vector4(0, 0, 1, 1) }, uBdRect1: { value: new THREE.Vector4(0, 0, 1, 1) },
    uBdRect2: { value: new THREE.Vector4(0, 0, 1, 1) }, uBdRect3: { value: new THREE.Vector4(0, 0, 1, 1) },
    uBdAlpha: { value: new THREE.Vector4(0, 0, 0, 0) },
    uBdHide: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: /* glsl */`
      ${BACKDROP_GLSL}
      uniform float uBdHide;
      varying vec2 vUv;
      void main() {
        if (uBdHide > 0.5) { gl_FragColor = vec4(0.0); return; }
        gl_FragColor = vec4(backdrop(vec2(vUv.x, 1.0 - vUv.y)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1e6;
  // Visible only inside offscreen passes (the transmission pass); invisible on the canvas,
  // where the real DOM layers already show through.
  mesh.onBeforeRender = (r) => {
    const hide = r.getRenderTarget() === null ? 1 : 0;
    if (uniforms.uBdHide.value !== hide) { uniforms.uBdHide.value = hide; }
    material.uniformsNeedUpdate = true;
  };
  const setColors = ({ base, accent: a, glow: g } = {}) => {
    if (base) uniforms.uBdBase.value.copy(rawColor(base));
    if (a) uniforms.uBdAccent.value.copy(rawColor(a));
    if (g) uniforms.uBdGlow.value.copy(rawColor(g));
  };
  return { mesh, uniforms, material, setColors, rawColor };
}

/* ---------- The bottle ---------- */
export function createBottle(renderer, { flavour = 'volt', backdrop = null } = {}) {
  const bd = backdrop || createBackdrop();
  /* ---- Condensation: procedural droplet normal map ---- */
  function condensationMap() {
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const img = c.createImageData(S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 128; d[i + 1] = 128; d[i + 2] = 255; d[i + 3] = 255; }
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const drop = (cx, cy, rx, ry) => {
      const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1), y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const u = (x - cx) / rx, v = (y - cy) / ry, q = u * u + v * v;
        if (q >= 1) continue;
        const nz = Math.sqrt(1 - q);
        const px = ((x % S) + S) % S, py = ((y % S) + S) % S, o = (py * S + px) * 4;
        d[o] = 128 + u * 120; d[o + 1] = 128 - v * 120; d[o + 2] = 128 + nz * 127;
      }
    };
    for (let i = 0; i < 5200; i++) { const r = 1.2 + Math.pow(rnd(), 3) * 5; drop(rnd() * S, rnd() * S, r, r * (0.9 + rnd() * 0.25)); }
    for (let i = 0; i < 260; i++) { const r = 6 + Math.pow(rnd(), 2) * 12; drop(rnd() * S, rnd() * S, r, r * (1.05 + rnd() * 0.3)); }
    // a few run trails
    for (let i = 0; i < 26; i++) {
      const x = rnd() * S, y = rnd() * S, len = 40 + rnd() * 160, w = 2.5 + rnd() * 3;
      for (let k = 0; k < len; k += 2) drop(x + Math.sin(k * 0.05 + i) * 1.5, y + k, w * (1 - k / len * 0.5), w * 1.4);
      drop(x, y + len, w * 1.8, w * 2.2);
    }
    c.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  const dew = condensationMap();
  const dewShell = dew.clone(); dewShell.repeat.set(4, 4); dewShell.needsUpdate = true;
  const dewLabel = dew.clone(); dewLabel.repeat.set(3, 1.6); dewLabel.needsUpdate = true;

  /* ---- Bottle ---- */
  const v2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
  const body = bottleProfile();

  const bottle = new THREE.Group();
  bottle.rotation.order = 'XZY'; // spin about the bottle's own axis, then tilt
  const inner = new THREE.Group();
  const CENTER = -(BOTTLE.bottom + BOTTLE.top) / 2;
  inner.position.y = CENTER;
  bottle.add(inner);

  // PET shell: genuinely clear (transmission), both walls rendered so the back wall refracts too
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.03, metalness: 0, transmission: 1, thickness: 0.26, ior: 1.57,
    specularIntensity: 1, specularColor: new THREE.Color('#ffffff'), envMapIntensity: 1.35,
    clearcoat: 1, clearcoatRoughness: 0.03, clearcoatNormalMap: dewShell, clearcoatNormalScale: new THREE.Vector2(0.55, 0.55),
    normalMap: dewShell, normalScale: new THREE.Vector2(0.18, 0.18),
    attenuationColor: new THREE.Color('#eef5ff'), attenuationDistance: 2.5,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(sculpt(lathe(body, 220), { threads: true }), shellMat);
  shell.renderOrder = 2;
  inner.add(shell);

  /* Liquid: a custom physically-inspired shader. For every pixel we trace the view ray
     through the liquid volume (analytic cylinder of the local radius, clipped by the
     surface and the base) and apply Beer–Lambert absorption to a soft studio backlight,
     plus in-scatter, Fresnel reflection of the softboxes, a meniscus line and rising
     micro-bubbles. It is opaque, so the PET shell's transmission pass refracts it. */
  const liquidUni = {
    uColor: { value: new THREE.Color(FLAVOURS.volt.liquid) },
    uInk: { value: new THREE.Color(FLAVOURS.volt.ink) },
    uAxisO: { value: new THREE.Vector3() }, uAxisD: { value: new THREE.Vector3(0, 1, 0) },
    uScale: { value: 1 }, uTop: { value: 1 }, uBot: { value: -1 }, uTime: { value: 0 },
    uLightDir: { value: new THREE.Vector3(-0.45, 0.5, 0.75).normalize() },
    uStudio: { value: 0.5 }, uBgMix: { value: 1.5 }, uAbsorb: { value: 0.62 },
    ...bd.uniforms,
  };
  const liquidMat = new THREE.ShaderMaterial({
    uniforms: liquidUni,
    vertexShader: /* glsl */`
      uniform vec3 uAxisO, uAxisD;
      uniform float uScale;
      varying vec3 vWorld; varying vec3 vN;
      varying vec4 vClip, vAx0, vAx1;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
        vClip = gl_Position;
        // the bottle axis at this height, and a point further up it (for the lens frame)
        vec3 ap = uAxisO + uAxisD * dot(w.xyz - uAxisO, uAxisD);
        vAx0 = projectionMatrix * viewMatrix * vec4(ap, 1.0);
        vAx1 = projectionMatrix * viewMatrix * vec4(ap + uAxisD * uScale, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uInk, uAxisO, uAxisD, uLightDir;
      uniform float uScale, uTop, uBot, uTime, uStudio, uBgMix, uAbsorb;
      varying vec3 vWorld; varying vec3 vN;
      varying vec4 vClip, vAx0, vAx1;
      ${BACKDROP_GLSL}
      // What you see through a cylinder of liquid: the background behind the bottle,
      // flipped and squeezed across the axis (a water-filled bottle is a cylindrical lens).
      vec3 liquidBg(vec3 N) {
        vec2 asp = vec2(uBdAspect, 1.0);
        vec2 s = vClip.xy / vClip.w * 0.5 + 0.5; s.y = 1.0 - s.y;
        vec2 a0 = vAx0.xy / vAx0.w * 0.5 + 0.5; a0.y = 1.0 - a0.y;
        vec2 a1 = vAx1.xy / vAx1.w * 0.5 + 0.5; a1.y = 1.0 - a1.y;
        vec2 dir = (a1 - a0) * asp;
        dir = length(dir) > 1e-5 ? normalize(dir) : vec2(0.0, -1.0);
        vec2 rel = (s - a0) * asp;
        float along = dot(rel, dir);
        vec2 perp = rel - dir * along;
        vec2 q = a0 * asp + dir * along - perp * 0.62 + N.xy * vec2(0.012, -0.012);
        return backdrop(q / asp);
      }
      float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float soft(vec3 r) {
        // analytic softboxes matching the studio env (left key strip, right rim strip, overhead)
        float a = smoothstep(0.16, 0.0, abs(r.x + 0.88)) * smoothstep(0.9, 0.3, abs(r.y)) * step(0.0, -r.x);
        float b = smoothstep(0.12, 0.0, abs(r.x - 0.92)) * smoothstep(0.9, 0.3, abs(r.y)) * step(0.0, r.x) * 0.7;
        float c = smoothstep(0.75, 0.95, r.y) * 0.35;
        return a + b + c;
      }
      void main() {
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        vec3 rel = vWorld - uAxisO;
        float h = dot(rel, uAxisD);
        vec3 radial = rel - uAxisD * h;
        // path length through the liquid: exit of a cylinder of this pixel's local radius
        vec3 d = V - uAxisD * dot(V, uAxisD);
        float a = dot(d, d);
        float t = a > 1e-5 ? max(0.0, -2.0 * dot(radial, d) / a) : 10.0;
        float dv = dot(V, uAxisD);
        if (dv > 1e-4) t = min(t, (uTop - h) / dv);
        if (dv < -1e-4) t = min(t, (uBot - h) / dv);
        float dist = clamp(t / uScale, 0.0, 3.0);

        vec3 col0 = max(uColor, vec3(0.004));
        vec3 sigma = -log(clamp(col0 * 1.25, 0.002, 0.97)) * 1.15 * uAbsorb;
        vec3 T = exp(-sigma * dist);
        // studio backlight seen through the volume (a lit sweep: brighter low and to the left)
        float hn = (h - uBot) / max(1e-4, uTop - uBot);
        vec3 back = vec3(1.0, 0.985, 0.96) * (0.42 + 0.3 * smoothstep(1.0, 0.0, hn)) * uStudio + liquidBg(N) * uBgMix;
        vec3 col = back * T;
        // in-scatter: the drink glows a little in its own colour
        col += col0 * (1.0 - T) * 0.38;
        // micro-bubbles marched along the ray
        float bub = 0.0;
        for (int i = 0; i < 7; i++) {
          float s = (float(i) + 0.5) / 7.0 * min(dist, 1.6);
          vec3 q = (vWorld + V * s * uScale - uAxisO) / uScale;
          q -= uAxisD * uTime * (0.05 + 0.03 * float(i & 1));
          vec3 g = q * 22.0;
          vec3 cell = floor(g), f = fract(g) - 0.5;
          float k = h31(cell);
          if (k > 0.965) {
            vec3 off = (vec3(h31(cell + 1.3), h31(cell + 2.7), h31(cell + 4.1)) - 0.5) * 0.55;
            float r = length(f - off);
            bub += smoothstep(0.09, 0.0, r) * exp(-dot(sigma, vec3(0.333)) * s * 1.4);
          }
        }
        col += vec3(1.0, 0.99, 0.95) * bub * 0.9;
        // diffuse lift on the lit side
        col += col0 * max(0.0, dot(N, uLightDir)) * 0.12;
        // meniscus: a thin bright line where the surface meets the wall
        float toTop = (uTop - h) / uScale;
        col += mix(uInk, vec3(1.0), 0.6) * exp(-pow(toTop * 70.0, 2.0)) * 0.9;
        col += vec3(1.0) * exp(-toTop * 28.0) * 0.06;
        // Fresnel reflection of the softboxes
        float fr = 0.02 + 0.98 * pow(1.0 - max(0.0, dot(N, -V)), 5.0);
        col += soft(reflect(V, N)) * fr * 1.6;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const liquid = new THREE.Mesh(sculpt(lathe(liquidProfile(body), 160)), liquidMat);
  inner.add(liquid);
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
  function updateLiquidUniforms(fill, time) {
    inner.updateWorldMatrix(true, false);
    inner.matrixWorld.decompose(_o, _q, _s);
    _d.set(0, 1, 0).applyQuaternion(_q);
    const sc = _s.y;
    liquidUni.uAxisO.value.copy(_o);
    liquidUni.uAxisD.value.copy(_d);
    liquidUni.uScale.value = sc;
    liquidUni.uBot.value = (LIQ_BOTTOM + 0.02) * sc;
    liquidUni.uTop.value = (LIQ_BOTTOM + (BOTTLE.fill - LIQ_BOTTOM) * Math.max(0.0001, Math.min(1, fill))) * sc;
    liquidUni.uTime.value = time;
  }
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
    clearcoat: 0.75, clearcoatRoughness: 0.08,
    clearcoatNormalMap: dewLabel, clearcoatNormalScale: new THREE.Vector2(0.45, 0.45),
    iridescence: 0.22, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
    alphaTest: 0.5, side: THREE.FrontSide,
  });
  const labelH = BOTTLE.labelTop - BOTTLE.labelBottom;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.727, 0.727, labelH, 180, 1, true, Math.PI, TAU), labelMat);
  label.position.y = (BOTTLE.labelTop + BOTTLE.labelBottom) / 2;
  inner.add(label);
  // plain paper backing, seen through the clear window from inside the bottle
  const labelBack = new THREE.Mesh(label.geometry, new THREE.MeshStandardMaterial({
    map: texBump, color: 0x8e918b, roughness: 0.9, alphaTest: 0.5, side: THREE.BackSide, // dim: print only faintly shows through
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

  // Low-profile sports cap: crisp bevel, fine knurling, satin moulded plastic, printed top
  const CAP_H = 0.30, CAP_Y = BOTTLE.top - CAP_H / 2;
  const cr = BOTTLE.capR;
  const hc = CAP_H / 2;
  const capProfile = [[0, hc - 0.006], [cr - 0.075, hc - 0.004], [cr - 0.05, hc], [cr - 0.022, hc - 0.006], [cr - 0.006, hc - 0.024], [cr, hc - 0.045],
    [cr, -hc + 0.035], [cr - 0.004, -hc + 0.012], [cr - 0.014, -hc], [cr - 0.032, -hc], [cr - 0.034, -hc + 0.05]];
  const dense = [];
  for (let i = 0; i < capProfile.length; i++) {
    dense.push(capProfile[i]);
    const nxt = capProfile[i + 1];
    if (nxt && Math.abs(nxt[1] - capProfile[i][1]) > 0.05) for (let k = 1; k < 10; k++) dense.push([capProfile[i][0], capProfile[i][1] + (nxt[1] - capProfile[i][1]) * k / 10]);
  }
  const capGeo = new THREE.LatheGeometry(v2(dense), 480);
  const cpos = capGeo.attributes.position;
  for (let i = 0; i < cpos.count; i++) {
    const x = cpos.getX(i), z = cpos.getZ(i), y = cpos.getY(i);
    const r = Math.hypot(x, z);
    if (r < cr - 0.001 || y > hc - 0.05 || y < -hc + 0.04) continue;
    const a = Math.atan2(x, z);
    const fade = smoothR(hc - 0.05, hc - 0.075, y) * smoothR(-hc + 0.04, -hc + 0.06, y);
    const nr = cr - 0.009 * fade + 0.009 * fade * Math.pow(Math.abs(Math.cos(a * 60)), 0.6);
    cpos.setX(i, (x / r) * nr); cpos.setZ(i, (z / r) * nr);
  }
  capGeo.computeVertexNormals();
  const capMat = new THREE.MeshPhysicalMaterial({
    color: 0x16181d, roughness: 0.42, metalness: 0, specularIntensity: 0.6,
    clearcoat: 0.25, clearcoatRoughness: 0.35, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#6a7080'),
  });
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
  const capTop = new THREE.Mesh(new THREE.CircleGeometry(cr - 0.075, 96),
    new THREE.MeshPhysicalMaterial({ map: topTex, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3 }));
  capTop.rotation.x = -Math.PI / 2; capTop.position.y = hc - 0.004 + 0.001;
  cap.add(capTop);
  cap.position.y = CAP_Y;
  inner.add(cap);

  // tamper band: a separate ring with a thin gap and bridges, in satin accent plastic
  const bandMat = new THREE.MeshPhysicalMaterial({ color: FLAVOURS.volt.ink, roughness: 0.38, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color('#ffffff') });
  const bTop = BOTTLE.top - CAP_H - 0.016, bBot = bTop - 0.07, br = cr - 0.004;
  const bandPts = [[br - 0.03, bBot + 0.004], [br - 0.006, bBot], [br, bBot + 0.008], [br, bTop - 0.008], [br - 0.006, bTop], [br - 0.03, bTop]];
  const band = new THREE.Mesh(new THREE.LatheGeometry(v2(bandPts), 200), bandMat);
  inner.add(band);
  // bridges across the gap (they snap when the cap is first opened)
  const bridgeGeo = new THREE.BoxGeometry(0.012, 0.018, 0.02);
  const bridges = new THREE.InstancedMesh(bridgeGeo, bandMat, 16);
  const _m = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    _m.makeRotationY(a).setPosition(Math.sin(a) * (br - 0.012), bTop + 0.008, Math.cos(a) * (br - 0.012));
    bridges.setMatrixAt(i, _m);
  }
  inner.add(bridges);

  let current = FLAVOURS[flavour] ? flavour : 'volt';
  const applyColours = (f) => {
    liquidUni.uColor.value.set(f.liquid);
    liquidUni.uInk.value.set(f.ink);
    bandMat.color.set(f.ink);
  };
  function repaint() { const f = FLAVOURS[current]; drawLabel(f); drawCapTop(f); }
  applyColours(FLAVOURS[current]);
  repaint();
  // the label uses Space Grotesk / Inter: repaint once the fonts are in
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(repaint);

  /* Switch flavour. With GSAP the colours tween and the label/cap art swaps at 42%
     (main.js spins the bottle around that moment so the swap is hidden). */
  function setFlavour(id, { duration = 0 } = {}) {
    const f = FLAVOURS[id];
    if (!f || id === current) return false;
    current = id;
    const g = window.gsap;
    if (g && duration > 0.02) {
      const liq = new THREE.Color(f.liquid), ink = new THREE.Color(f.ink);
      g.to(liquidUni.uColor.value, { r: liq.r, g: liq.g, b: liq.b, duration, ease: 'power2.inOut' });
      g.to(liquidUni.uInk.value, { r: ink.r, g: ink.g, b: ink.b, duration });
      g.delayedCall(duration * 0.42, () => { if (current === id) { repaint(); bandMat.color.copy(ink); } });
    } else {
      applyColours(f); repaint();
    }
    return true;
  }

  function setCap(open) {
    cap.position.y = CAP_Y + open * 0.8;
    cap.rotation.y = -open * 3.2;
  }

  return {
    group: bottle, inner, cap, CAP_Y, CENTER, shell, liquid, label, labelBack, band, bridges,
    shellMat, liquidMat, labelMat, bandMat, liquidUni, backdrop: bd,
    setFill, updateLiquid: updateLiquidUniforms, setCap, setFlavour, repaint,
    get flavour() { return current; },
  };
}

/* ---------- Fit helper: scale so the bottle fills a fraction of a view ---------- */
export function fitBottleScale(halfW, halfH, { tilt = 0, fw = 0.9, fh = null } = {}) {
  const t = Math.abs(tilt);
  const ex = BOTTLE.length * Math.sin(t) + BOTTLE.width * Math.cos(t);
  const ey = BOTTLE.length * Math.cos(t) + BOTTLE.width * Math.sin(t);
  let s = fw * 2 * halfW / ex;
  if (fh) s = Math.min(s, fh * 2 * halfH / ey);
  return s;
}

const pageBg = () => {
  const cs = getComputedStyle(document.documentElement);
  return (cs.getPropertyValue('--bg') || '').trim() || '#090a0d';
};
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

/* ---------- mountBottle: a live bottle inside any element ---------- */
export function mountBottle(el, opts = {}) {
  const o = { flavour: 'volt', fill: 1, tilt: 0, turn: 0, cap: 0, interactive: false, autoRotate: false, dpr: 2, fit: 0.9, backdrop: null, ...opts };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'bottle3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: o.interactive ? 'pan-y' : 'auto', cursor: o.interactive ? 'grab' : '' });
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    canvas.remove();
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, o.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const lights = addStudioLights(scene, FLAVOURS[o.flavour]?.ink);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const backdrop = createBackdrop({ color: o.backdrop || pageBg(), accent: FLAVOURS[o.flavour]?.ink });
  scene.add(backdrop.mesh);
  const b = createBottle(renderer, { flavour: o.flavour, backdrop });
  scene.add(b.group);

  let halfW = 1, halfH = 1, baseScale = 1;
  const pose = { tilt: o.tilt, turn: o.turn, fill: o.fill, cap: o.cap };
  const cur = { ...pose };
  let drag = 0, dragV = 0, spinAuto = 0, hoverX = 0, hoverY = 0, hx = 0, hy = 0;

  function resize() {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    halfH = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    halfW = halfH * camera.aspect;
    baseScale = fitBottleScale(halfW, halfH, { tilt: pose.tilt, fw: o.fit, fh: o.fit });
    backdrop.uniforms.uBdAspect.value = camera.aspect;
    needs = true;
  }

  // interaction
  let dragging = false, lastX = 0;
  if (o.interactive) {
    canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      hoverX = ((e.clientX - r.left) / r.width) * 2 - 1; hoverY = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX;
      drag += dx * 0.012; dragV = dx * 0.012;
    });
    const end = () => { dragging = false; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { hoverX = 0; hoverY = 0; });
  }

  let visible = true, needs = true, raf = 0, last = performance.now(), t0 = last;
  function frame(now) {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    if (!dragging) { drag += dragV; dragV *= Math.pow(0.04, dt); }
    if (o.autoRotate && !reduced && !dragging) spinAuto += dt * 0.35;
    hx = damp(hx, hoverX, 4, dt); hy = damp(hy, hoverY, 4, dt);
    for (const k of ['tilt', 'turn', 'fill', 'cap']) cur[k] = damp(cur[k], pose[k], 6, dt);
    b.group.scale.setScalar(baseScale);
    b.group.position.set(0, reduced ? 0 : Math.sin(t * 1.3) * 0.04, 0);
    b.group.rotation.set(hy * 0.12, cur.turn + drag + spinAuto + hx * 0.3, cur.tilt - hx * 0.04);
    b.setCap(cur.cap);
    b.setFill(cur.fill);
    b.updateLiquid(cur.fill, t);
    backdrop.uniforms.uBdTime.value = t;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  const ro = new ResizeObserver(() => { resize(); kick(); });
  ro.observe(el);
  const io = new IntersectionObserver((ents) => { visible = ents[0].isIntersecting; if (visible) kick(); }, { rootMargin: '100px' });
  io.observe(el);
  resize(); kick();

  return {
    canvas, renderer, bottle: b,
    setFlavour(id) {
      const f = FLAVOURS[id];
      if (!f) return;
      if (b.setFlavour(id, { duration: reduced ? 0 : 0.9 })) {
        if (window.gsap && !reduced) window.gsap.to(pose, { turn: pose.turn + TAU, duration: 0.9, ease: 'power3.inOut' });
        lights.rimB.color.set(f.ink);
        backdrop.setColors({ accent: f.ink });
      }
      kick();
    },
    setFill(f) { pose.fill = f; kick(); },
    setPose(p = {}) {
      for (const k of ['tilt', 'turn', 'fill', 'cap']) if (typeof p[k] === 'number') pose[k] = p[k];
      if (typeof p.tilt === 'number') resize();
      kick();
    },
    dispose() {
      cancelAnimationFrame(raf); raf = 0; visible = false;
      ro.disconnect(); io.disconnect();
      renderer.dispose(); renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}

/* ---------- bottleSnapshot: cached transparent PNG renders ---------- */
let snap = null;
const snapCache = new Map();
let snapQueue = Promise.resolve();
function snapRig() {
  if (snap) return snap;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const lights = addStudioLights(scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 9);
  const backdrop = createBackdrop({ color: pageBg() });
  scene.add(backdrop.mesh);
  const b = createBottle(renderer, { backdrop });
  scene.add(b.group);
  snap = { canvas, renderer, scene, camera, b, lights, backdrop };
  return snap;
}
export function bottleSnapshot(flavour = 'volt', { width = 320, height = 480, tilt = 0, turn = 0, fill = 1, cap = 0, fit = 0.92 } = {}) {
  const key = [flavour, width, height, tilt, turn, fill, cap, fit].join('|');
  if (snapCache.has(key)) return snapCache.get(key);
  const job = snapQueue.then(async () => {
    if (document.fonts) { try { await document.fonts.ready; } catch { /* ignore */ } }
    const s = snapRig();
    const f = FLAVOURS[flavour] || FLAVOURS.volt;
    s.renderer.setSize(width, height, false);
    s.camera.aspect = width / height; s.camera.updateProjectionMatrix();
    const halfH = s.camera.position.z * Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2));
    const halfW = halfH * s.camera.aspect;
    s.b.setFlavour(flavour in FLAVOURS ? flavour : 'volt', { duration: 0 });
    s.b.repaint();
    s.lights.rimB.color.set(f.ink);
    s.backdrop.uniforms.uBdAspect.value = s.camera.aspect;
    s.backdrop.setColors({ accent: f.ink });
    s.b.group.scale.setScalar(fitBottleScale(halfW, halfH, { tilt, fw: fit, fh: fit }));
    s.b.group.rotation.set(0, turn, tilt);
    s.b.setCap(cap); s.b.setFill(fill); s.b.updateLiquid(fill, 0.7);
    s.renderer.render(s.scene, s.camera);
    const blob = await new Promise((res) => s.canvas.toBlob(res, 'image/png'));
    return blob ? URL.createObjectURL(blob) : '';
  });
  snapQueue = job.catch(() => {});
  snapCache.set(key, job);
  return job;
}
