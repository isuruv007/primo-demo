/* PRIMO: "inside the liquid" full-screen fragment shader.
   A macro underwater shot inside a carbonated drink, rendered in one pass.
   Uniforms (provided by main.js):
     uTime     seconds
     uOpacity  overlay alpha
     uScroll   scroll progress, used to push bubbles and particles along
     uAspect   viewport width / height
     uLevel    liquid surface height in uv.y (1.3 = fully submerged, about -0.2 = empty)
     uSlosh    signed scroll velocity, used to wobble the surface
     uMid      liquid colour (display space)
     uLight    flavour accent (display space)
   Extra:
     uQuality  1 = full (chromatic caustics, 3 particle layers), 0 = cheaper path for phones
*/

export const INSIDE_EXTRA_UNIFORMS = { uQuality: 1 };

export const INSIDE_FRAGMENT = /* glsl */`
precision highp float;
uniform float uTime, uOpacity, uScroll, uAspect, uLevel, uSlosh;
uniform vec3 uMid, uLight;
uniform float uQuality;
varying vec2 vUv;

/* ---------- noise ---------- */
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65)); a += dot(a, a + 34.45); return fract(vec2(a.x * a.y, a.y * a.z)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}

/* ---------- caustics: animated Worley cell borders, domain warped ---------- */
float worleyEdge(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = h22(i + g);
    o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    float d = length(g + o - f);
    float lo = min(f1, d);
    f2 = min(f2, max(f1, d));
    f1 = lo;
  }
  return f2 - f1;
}
float caustic(vec2 p, float t, float blur) {
  vec2 w = vec2(vnoise(p * 0.6 + t * 0.11), vnoise(p * 0.6 - t * 0.09 + 5.3));
  p += (w - 0.5) * 1.6;
  float a = 1.0 - smoothstep(0.0, 0.13 + blur, worleyEdge(p, t));
  float b = 1.0 - smoothstep(0.0, 0.11 + blur, worleyEdge(p * 1.7 + 3.7, t * 1.35));
  float c = a * 0.7 + b * 0.5 + a * b * 0.8;
  float patchy = smoothstep(0.25, 0.8, vnoise(p * 0.35 + t * 0.05));
  return c * c * (0.15 + 1.1 * patchy);
}

/* ---------- light shafts fanning from a sun above the frame ---------- */
float shafts(vec2 p, vec2 src, float t) {
  vec2 d = p - src;
  float a = atan(d.x, -d.y);
  float n = vnoise(vec2(a * 16.0, t * 0.12)) * 0.6 + vnoise(vec2(a * 43.0 + 3.0, -t * 0.21)) * 0.4;
  return smoothstep(0.42, 0.95, n);
}

/* ---------- a refractive gas bubble ----------
   q: offset from centre (aspect space), r: radius. Edits col in place. */
void bubble(inout vec3 col, vec2 q, float r, float stretch, vec3 lit, float px, float k) {
  q.y /= stretch;
  vec2 n = q / r;
  float d = length(n);
  float aa = px * 1.6 / r;
  float inside = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, d)) * k;
  // a lens: the interior shows the brighter scene from above, flipped, so the bottom glows
  vec3 refr = lit * (0.35 + 1.1 * smoothstep(0.3, -0.95, n.y)) + col * 0.4;
  col = mix(col, refr, inside * 0.45);
  // the edge reflects the dark depths (Fresnel), then a thin bright outer line
  float rim = smoothstep(0.55, 0.98, d) * inside;
  col *= 1.0 - 0.78 * rim * rim;
  col += lit * 0.22 * exp(-pow((d - 1.0) / (aa + 0.03), 2.0)) * k * smoothstep(-0.2, 0.9, n.y);
  // specular pinpoint and the focused caustic underneath
  col += vec3(1.0, 0.99, 0.96) * (1.0 - smoothstep(0.0, 0.17 + aa, length(n - vec2(-0.34, 0.44)))) * 1.3 * k;
  col += lit * 0.9 * (1.0 - smoothstep(0.0, 0.4, length((n - vec2(0.06, -0.58)) * vec2(0.65, 1.5)))) * inside;
}

/* ---------- a water droplet on the PET wall, seen from inside ---------- */
void droplet(inout vec3 col, vec2 q, float r, vec3 env, vec3 lit, vec3 tint, float px, float k) {
  q.y *= (q.y > 0.0) ? 1.0 : 0.82;        // heavier at the bottom
  vec2 n = q / r;
  float d = length(n);
  float aa = px * 1.6 / r;
  float inside = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, d)) * k;
  // contact shadow ring around the drop
  col *= 1.0 - 0.35 * k * exp(-pow((d - 1.05) * 5.0, 2.0));
  vec3 refr = env * 0.6 + lit * 0.55 * smoothstep(0.2, -1.0, n.y);
  refr *= tint;
  col = mix(col, refr, inside * 0.9);
  col *= 1.0 - 0.6 * smoothstep(0.5, 1.0, d) * smoothstep(-0.2, 0.9, n.y) * inside;
  col += vec3(1.0) * (1.0 - smoothstep(0.0, 0.16 + aa, length(n - vec2(-0.3, 0.42)))) * clamp(length(lit) * 2.2 - 0.35, 0.0, 1.0) * k;
}

void main() {
  vec2 uv = vUv;
  float px = fwidth(uv.y);
  float t = uTime;
  vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y);
  float hq = step(0.5, uQuality);

  /* ---- surface: slosh waves, capillary ripples, tilt and the meniscus climbing at the walls ---- */
  float sl = clamp(uSlosh, -1.5, 1.5);
  float wave = (0.008 + abs(sl) * 0.03) * sin(p.x * 5.0 + t * 1.9)
             + (0.004 + abs(sl) * 0.012) * sin(p.x * 13.0 - t * 3.1 + 1.3)
             + 0.0022 * (vnoise(vec2(p.x * 38.0, t * 2.4)) - 0.5)
             + sl * 0.035 * p.x;
  float wall = abs(uv.x - 0.5) * 2.0;
  float surf = uLevel + wave + 0.018 * smoothstep(0.86, 1.0, wall);
  float edge = px * 1.2;
  float below = 1.0 - smoothstep(surf - edge, surf + edge, uv.y);
  float depth = max(surf - uv.y, 0.0);

  /* ---- light and absorption (Beer-Lambert) ---- */
  vec3 sun = mix(vec3(1.0, 0.97, 0.9), uLight, 0.3) * 2.4;
  vec3 sigma = -log(clamp(uMid * 1.25, 0.02, 0.98)) * 2.1;
  vec2 sunP = vec2(-0.32 * min(uAspect, 1.6), 1.45);

  /* =================== under the surface =================== */
  vec3 tr = exp(-sigma * (depth + 0.12));
  float haze = exp(-length(p - sunP) * 1.15);
  float murk = fbm(p * 1.4 + vec2(t * 0.02, -t * 0.03));
  vec3 water = sun * tr * (0.07 + 0.42 * haze * haze + 0.06 * murk);
  water = max(water, uMid * 0.03);

  // volumetric shafts, broken up by noise and fading with depth
  float sh = shafts(p, sunP + vec2(0.0, 0.4), t);
  water += sun * exp(-sigma * depth * 0.8) * sh * 0.26 * exp(-depth * 0.9) * (0.6 + 0.4 * murk);

  // chromatic caustic network, softer and dimmer the deeper it is
  vec2 cp = p * 4.8 + vec2(0.0, uScroll * 0.4);
  float ct = t * 0.55;
  float blur = depth * 0.12;
  vec3 caus;
  if (hq > 0.5) {
    vec2 ca = vec2(0.009, 0.005) * (1.0 + depth);
    caus = vec3(caustic(cp + ca, ct, blur), caustic(cp, ct, blur), caustic(cp - ca, ct, blur));
  } else {
    caus = vec3(caustic(cp, ct, blur));
  }
  water += sun * exp(-sigma * (depth + 0.05)) * caus * 0.24 * exp(-depth * 1.6) * (0.5 + 0.5 * sh);

  // suspended micro-particles with depth of field: near = big soft bokeh discs, far = sharp specks
  vec3 litHere = sun * exp(-sigma * (depth * 0.6 + 0.1));
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float on = (fl < 2.0 || hq > 0.5) ? 1.0 : 0.0;
    float sc = 2.6 + fl * 6.0;
    vec2 q = p * sc + vec2(t * 0.025 * (fl + 1.0), -t * 0.04 - uScroll * (0.4 + fl * 0.5));
    vec2 id = floor(q), f = fract(q) - 0.5;
    vec2 r2 = h22(id + fl * 31.0);
    vec2 o = (r2 - 0.5) * 0.6 + 0.07 * vec2(sin(t * 0.7 + r2.x * 30.0), cos(t * 0.6 + r2.y * 20.0));
    float exist = step(0.62, h21(id + fl * 7.3)) * on;
    float dd = length(f - o);
    float rad = mix(0.17, 0.02, fl * 0.5);
    float soft = mix(0.07, 0.006 * sc / 3.0, fl * 0.5) + px * sc;
    float disc = 1.0 - smoothstep(rad - soft, rad + soft, dd);
    float ring = (fl < 0.5) ? smoothstep(rad * 0.55, rad, dd) * disc * 0.6 : 0.0;   // onion-ring bokeh
    float inten = mix(0.08, 0.5, fl * 0.5) * (0.35 + 0.65 * r2.x);
    water += litHere * (disc * 0.5 + ring) * inten * exist * below;
  }

  // carbonation: hero bubbles on three layers, sized and spaced like a real glass
  vec3 bubLit = sun * exp(-sigma * (depth * 0.45 + 0.04)) * 0.5;
  float stretch = 1.0 + abs(sl) * 0.6;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float sc = 3.0 + fl * 4.5;
    float spd = 0.16 + fl * 0.09;
    vec2 q = p * sc;
    float cx = floor(q.x);
    float hc = h11(cx + fl * 13.0);
    q.y -= t * spd * sc * (0.7 + 0.6 * hc) + uScroll * sc * (0.6 + fl * 0.4) + hc * 17.0;
    vec2 id = floor(q), f = fract(q) - 0.5;
    float hb = h21(id + fl * 19.0);
    float exist = step(hb, 0.13 + fl * 0.03);
    float rr = h21(id + 4.7);
    float r = 0.04 + 0.16 * rr * rr * rr;
    vec2 o = vec2((h21(id + 2.1) - 0.5) * 0.45, (h21(id + 8.3) - 0.5) * 0.4);
    o.x += sin(t * (2.0 + hb * 3.0) + hb * 40.0) * 0.07;
    // bubbles near the top vanish into the surface
    float k = exist * smoothstep(0.0, 0.03, depth) * below;
    bubble(water, (f - o) / sc, r / sc, stretch, bubLit, px, k);
  }

  // nucleation streams: strings of tiny bubbles that grow as they rise
  for (int s = 0; s < 4; s++) {
    float fs = float(s);
    float sx = (h11(fs * 3.1 + 1.0) - 0.5) * uAspect * 0.9;
    float v = 0.35 + h11(fs * 7.7) * 0.25;
    float spacing = 0.05 + h11(fs * 5.3) * 0.04;
    float y = uv.y + h11(fs) * 3.0;
    float cell = (y - t * v - uScroll * 0.5) / spacing;
    float fy = (fract(cell) - 0.5) * spacing;
    float wig = sin(uv.y * 24.0 + t * 3.0 + fs) * 0.004;
    float r = 0.0022 + 0.004 * clamp(uv.y, 0.0, 1.0);
    float k = smoothstep(0.0, 0.02, depth) * below * step(0.12, uv.y - (0.1 + h11(fs * 9.1) * 0.3));
    bubble(water, vec2(p.x - sx - wig, fy), r, 1.0 + abs(sl) * 1.2, bubLit, px, k);
  }

  /* ---- the surface seen from below ---- */
  float nearSurf = 1.0 - smoothstep(0.0, 0.11, depth);
  // total internal reflection: a silvery mirror band with moving ripple glints
  float rip = vnoise(vec2(p.x * 26.0 + t * 0.7, depth * 60.0 - t * 1.6)) * vnoise(vec2(p.x * 9.0 - t * 0.4, t * 0.9));
  vec3 tir = mix(uMid * 0.1, sun * exp(-sigma * 0.06) * 0.25, 0.5) + sun * 1.2 * pow(rip, 4.0);
  water = mix(water, tir, nearSurf * nearSurf * 0.35 * below);
  // Snell's window: light pours through where the surface faces the sun
  water += sun * exp(-sigma * 0.04) * 0.35 * exp(-pow((p.x - sunP.x) / 0.55, 2.0)) * nearSurf * below;
  // foam: tiny bubbles crowding just under the surface
  {
    vec2 q = vec2(p.x * 70.0 + t * 0.15, depth * 70.0);
    vec2 id = floor(q), f = fract(q) - 0.5;
    vec2 o = (h22(id) - 0.5) * 0.5;
    float r = 0.18 + 0.22 * h21(id + 3.0);
    float on = step(h21(id + 9.0), 0.55) * (1.0 - smoothstep(0.0, 0.025, depth)) * below * step(depth, 0.03);
    bubble(water, (f - o) / 70.0, r / 70.0, 1.0, bubLit * 1.4, px, on);
  }

  /* =================== above the surface: the drained bottle =================== */
  float a = max(uv.y - surf, 0.0);
  vec3 env = vec3(0.01, 0.011, 0.013) + uMid * 0.035;
  // out-of-focus world beyond the PET wall: soft window light and blurred shapes
  env += mix(vec3(0.85, 0.9, 1.0), uLight, 0.15) * 0.1 * exp(-length((p - vec2(-0.45 * uAspect * 0.5, 0.95)) * vec2(1.4, 0.9)) * 2.2);
  env += vec3(0.6, 0.62, 0.66) * 0.05 * smoothstep(0.35, 0.8, fbm(p * 1.1 + vec2(0.0, t * 0.01)));
  // the curved wall: reflections bunch up at the sides, plus a long specular stripe
  env += vec3(0.06) * smoothstep(0.6, 0.93, wall) * (1.0 - smoothstep(0.94, 1.0, wall));
  env += vec3(0.12) * exp(-pow((uv.x - 0.27) * uAspect * 26.0, 2.0)) * (0.5 + 0.5 * vnoise(vec2(uv.y * 3.0, 1.0)));
  env += vec3(0.04) * exp(-pow((uv.x - 0.78) * uAspect * 14.0, 2.0));
  // light refracted through the moulded plastic: thin vertical streaks
  env += mix(vec3(1.0), uLight, 0.4) * 0.03 * pow(vnoise(vec2(p.x * 55.0, uv.y * 1.2)), 6.0) * 3.0;
  // the inside wall is coated with a little drink
  env = mix(env, env * (0.4 + uMid * 2.6), 0.35);
  // wet sheet draining just above the surface, with vertical drainage streaks
  float streak = vnoise(vec2(p.x * 85.0, a * 2.5 + t * 0.25));
  float film = exp(-a * 12.0) * (0.55 + 0.6 * streak);
  env += (sun * exp(-sigma * 0.1) * 0.07 + uMid * 0.25) * film;

  vec3 air = env;
  vec3 dropTint = mix(vec3(1.0), uMid * 2.4 + 0.15, 0.45);
  vec3 dropLit = mix(vec3(1.0), uLight, 0.25) * 0.32;
  float airK = 1.0 - below;
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float sc = 7.0 + fl * 9.0;
    vec2 q = p * sc;
    vec2 id = floor(q), f = fract(q) - 0.5;
    float hd = h21(id + fl * 11.0);
    float exist = step(hd, 0.2 - fl * 0.05);
    float slide = step(0.82, h21(id + 5.5));
    float r = 0.1 + 0.2 * h21(id + 2.2) * (1.0 - fl * 0.3);
    vec2 o = vec2((h21(id + 1.3) - 0.5) * 0.4, (h21(id + 6.1) - 0.5) * 0.3);
    o.y += slide * (0.25 - fract(t * 0.04 * (0.6 + hd) + hd * 5.0) * 0.6);
    // rivulet left behind by a sliding drop
    float trail = slide * (1.0 - smoothstep(r * 0.25, r * 0.45, abs(f.x - o.x))) * step(o.y, f.y);
    air += env * 0.6 * trail * exist * airK;
    air *= 1.0 - 0.25 * trail * exist * smoothstep(r * 0.2, r * 0.45, abs(f.x - o.x)) * airK;
    float k = exist * airK * smoothstep(0.0, 0.02, a);
    droplet(air, (f - o) / sc, r / sc, env, dropLit, dropTint, px, k);
  }
  // fine mist of micro-droplets
  {
    vec2 q = p * 60.0;
    vec2 id = floor(q), f = fract(q) - 0.5;
    vec2 o = (h22(id) - 0.5) * 0.6;
    float r = 0.12 + 0.18 * h21(id + 7.0);
    float k = step(h21(id + 4.0), 0.2) * airK * smoothstep(0.0, 0.02, a);
    droplet(air, (f - o) / 60.0, r / 60.0, env, dropLit * 0.5, dropTint, px, k);
  }

  vec3 col = mix(air, water, below);

  /* ---- meniscus: a bright refracted line over a dark band, with a hint of chromatic fringing ---- */
  vec3 men;
  vec3 caOff = vec3(1.0, 0.0, -1.0) * px * 1.5 * (1.0 + length(uv - 0.5) * 2.0);
  for (int c = 0; c < 3; c++) {
    float dy = uv.y + caOff[c] - surf;
    float line = exp(-pow(dy / (px * 1.4), 2.0));
    float dark = exp(-pow((dy + px * 3.5) / (px * 2.5), 2.0));
    men[c] = line * 0.9 - dark * 0.5;
  }
  vec3 menCol = mix(vec3(1.0), uLight, 0.35) * (0.6 + 0.6 * vnoise(vec2(p.x * 20.0, t)));
  col = col * (1.0 + min(men, 0.0)) + max(men, 0.0) * menCol;

  /* ---- film finish ---- */
  col *= 0.95;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);   // ACES fit
  float v = length((uv - 0.5) * vec2(uAspect * 0.7, 1.0));
  col *= 1.0 - 0.6 * smoothstep(0.3, 1.05, v);
  col.r *= 1.0 + 0.03 * v;
  col.b *= 1.0 - 0.03 * v;
  float g = h21(uv * 1000.0 + fract(t * 7.0) * 100.0) - 0.5;
  col += g * 0.035 * (0.4 + col);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), uOpacity);
}
`;
