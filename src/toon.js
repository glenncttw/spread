import * as THREE from 'three';

// Shared look settings. Colors are display (sRGB) values; color management is
// turned off in main.js so these hex codes show up on screen exactly as written.
export const palette = {
  paper: '#f4ecdc',
  background: ['#6233dd', '#ff71c3', '#ff9c41'], // top, middle, bottom
  ink: '#211d1e',
  crumb: { base: '#f6dfa8', shade: '#e6c48a', dots: '#b98a4e' },
  crust: { base: '#c46a2c', shade: '#a9531f', dots: '#6e2c0e' },
  spread: { base: '#a75bd1', shade: '#8c45b8', dots: '#55247a' },
};

// Everything the slider panel can change. Patterns and color modes are
// numbered so the shader can switch on them.
export const PATTERNS = { Dots: 0, Lines: 1, Crosshatch: 2, Squares: 3, Stipple: 4 };
export const COLOR_MODES = { Tinted: 0, 'Single color': 1, 'CMY print': 2, RGB: 3 };

// World space to "toast space" (where the toast sits before it's moved),
// shared by every material. main.js updates it whenever the toast moves.
const toastSpace = { value: new THREE.Matrix4() };

// Shared by the crumb's color and normal materials, so the holes line up.
const holeUniforms = {
  uHoleAmount: { value: 0.25 }, // how many holes open up (0..1)
  uHoleSize: { value: 1 },
  uHolePattern: { value: 0 }, // each whole number is a different layout of holes
  uHoleStretch: { value: 1.4 }, // how much the holes are pulled out, like risen dough
  uHoleWarp: { value: 1.1 }, // how lumpy and bent the holes are
};

export function createSharedUniforms() {
  return {
    uToastInv: toastSpace,
    uLightDir: { value: new THREE.Vector3() },
    uDotSize: { value: 6 },
    uPattern: { value: PATTERNS.Dots },
    uColorMode: { value: COLOR_MODES.Tinted },
    uAngle: { value: Math.PI / 4 },
    uAmount: { value: 0.85 },
    uReach: { value: 0.7 },
    uSingleColor: { value: new THREE.Color(palette.ink) },
    uShift: { value: 2 },
    uShine: { value: 1 },
    uGloss: { value: 60 },
    uLightDir2: { value: new THREE.Vector3() },
    uShine2: { value: 1 },
    uShadowWobble: { value: 0.7 },
    uShadowWobbleSize: { value: 2.5 },
  };
}

// Screen-space halftone. `dark` (0..1) sets how much of each cell is inked,
// so shading reads as print rather than a smooth gradient.
const halftoneGLSL = /* glsl */ `
  uniform float uDotSize;
  uniform int uPattern;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
  }

  float halftone(vec2 fragCoord, float angle, float dark) {
    dark = clamp(dark, 0.0, 1.0);
    if (dark < 0.02) return 0.0;
    float c = cos(angle), s = sin(angle);
    vec2 p = mat2(c, -s, s, c) * fragCoord / uDotSize;
    vec2 cell = fract(p) - 0.5;

    if (uPattern == 1) { // Lines
      float d = abs(cell.y);
      float aa = fwidth(p.y) * 0.75;
      return 1.0 - smoothstep(dark * 0.5 - aa, dark * 0.5 + aa, d);
    }
    if (uPattern == 2) { // Crosshatch: a second set of lines joins in the darker areas
      float aa = fwidth(p.y) * 0.75;
      float w1 = min(dark, 0.6) * 0.45;
      float w2 = max(dark - 0.35, 0.0) * 0.45;
      float a = 1.0 - smoothstep(w1 - aa, w1 + aa, abs(cell.y));
      float b = 1.0 - smoothstep(w2 - aa, w2 + aa, abs(cell.x));
      return max(a, w2 > 0.0 ? b : 0.0);
    }
    if (uPattern == 3) { // Squares
      float d = max(abs(cell.x), abs(cell.y));
      float r = sqrt(dark) * 0.5;
      float aa = fwidth(d) * 0.75;
      return 1.0 - smoothstep(r - aa, r + aa, d);
    }
    if (uPattern == 4) { // Stipple: random specks, denser where darker
      vec2 g = floor(fragCoord / max(uDotSize * 0.3, 1.0));
      return step(hash21(g), dark * 0.85);
    }
    // Dots
    float d = length(cell);
    float r = sqrt(dark) * 0.72;
    float aa = fwidth(d) * 0.75;
    return 1.0 - smoothstep(r - aa, r + aa, d);
  }
`;

// Swapping the spread color: the new color grows over the old one as a solid,
// wobbly shape from the top right, with an ink line along its edge, until it
// covers the whole spread and settles onto the spread's own rim.
// `uSwitch` is (progress, 1 while a switch is playing).
export function createDissolveUniforms() {
  return {
    uSwitch: { value: new THREE.Vector2(0, 0) },
    uDissolveDir: { value: new THREE.Vector2(-Math.SQRT1_2, -Math.SQRT1_2) },
    uDissolveSeed: { value: new THREE.Vector2() },
    uDissolveNoise: { value: new THREE.Vector2(2.5, 0.3) }, // scale, strength
    uDissolveTime: { value: 0 },
    uOldBase: { value: new THREE.Color(palette.spread.base) },
    uOldShade: { value: new THREE.Color(palette.spread.shade) },
    uOldDots: { value: new THREE.Color(palette.spread.dots) },
    uCutInk: { value: new THREE.Color(palette.ink) },
    uCutWidth: { value: 3 }, // pixels
    uCenter: { value: new THREE.Vector3(0, 0.45, -0.17) },
    uRadius: { value: 1.3 },
    uToastInv: toastSpace,
  };
}

const dissolveGLSL = /* glsl */ `
  uniform vec2 uSwitch;
  uniform vec2 uDissolveDir;
  uniform vec2 uDissolveSeed;
  uniform vec2 uDissolveNoise;
  uniform float uDissolveTime;
  uniform vec3 uOldBase;
  uniform vec3 uOldShade;
  uniform vec3 uOldDots;
  uniform vec3 uCutInk;
  uniform float uCutWidth;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform mat4 uToastInv;
  varying float vEdge; // distance to the spread's own rim, in world units

  float dHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float dNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), f.x),
               mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // 1 while the growing shape is in charge, easing to 0 at the end where it
  // hands over to the resting spread, so nothing snaps.
  float switchBlend() { return 1.0 - smoothstep(0.8, 1.0, uSwitch.x); }

  // How far inside the new color's shape this point is (negative = outside).
  float switchMargin() {
    // Work top-down on the toast (world x/z) so the shape behaves like a
    // cookie cutter, slicing straight down through the spread's rim. The
    // screen direction (top right to bottom left) is turned into a direction
    // across the toast for the current camera.
    vec3 dirWorld = mat3(uToastInv) * (transpose(mat3(viewMatrix)) * vec3(uDissolveDir, 0.0));
    vec2 dir = normalize(dirWorld.xz + vec2(1e-5));
    vec2 rel = (vWorldPos.xz - uCenter.xz) / uRadius;
    float d = length(rel + 0.6 * dir);
    vec2 q = rel * uDissolveNoise.x + uDissolveSeed + uDissolveTime * 0.6;
    d += (dNoise(q) * 0.65 + dNoise(q * 2.3) * 0.35 - 0.5) * uDissolveNoise.y;

    // The blob grows big enough to cover the whole spread, so it has filled
    // out before the hand-off. It starts a little below zero: the noise can
    // push the edge out past the center, so at zero a speck of the new color
    // would already show before the animation has really started.
    float maxR = 1.75 + uDissolveNoise.y * 0.5;
    float r = mix(-0.05 - uDissolveNoise.y * 0.5, maxR, uSwitch.x);
    // Blend the blob with the spread's own rim using a smooth minimum, so
    // where the two meet the shape rounds off instead of forming a corner.
    float blob = (r - d) * uRadius;
    float k = 0.4;
    float h = clamp(0.5 + 0.5 * (vEdge - blob) / k, 0.0, 1.0);
    float shape = mix(vEdge, blob, h) - k * h * (1.0 - h);
    return mix(vEdge, shape, switchBlend());
  }
`;

// Bread holes, grown from noise and drawn in ink by the outline pass: the
// normal pass tips the surface normal inside each hole, so the same edge
// finder that outlines the toast draws a wobbly, boiling line around every
// hole. The color pass only adds a few halftone dots inside, like a shaded dip.
const holesGLSL = /* glsl */ `
  uniform float uHoleAmount;
  uniform float uHoleSize;
  uniform float uHolePattern;
  uniform float uHoleStretch;
  uniform float uHoleWarp;

  float holeHash(vec3 p) {
    return fract(sin(dot(p, vec3(17.1, 113.5, 61.7))) * 43758.5453);
  }
  float holeNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(holeHash(i), holeHash(i + vec3(1, 0, 0)), f.x),
          mix(holeHash(i + vec3(0, 1, 0)), holeHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(holeHash(i + vec3(0, 0, 1)), holeHash(i + vec3(1, 0, 1)), f.x),
          mix(holeHash(i + vec3(0, 1, 1)), holeHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  vec2 holeHash2(vec2 c) {
    return fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))) * 43758.5453);
  }

  // Cellular (Worley) noise gives each hole its own spot; a smooth-noise warp
  // bends the cells so every hole has its own lumpy shape, and only some
  // cells open up (more in some patches than others). Returns the signed
  // distance to the nearest hole's edge (negative inside), in cell units.
  float holeDistance(vec2 p) {
    // The pattern number shifts every noise lookup to a far-off spot, so each
    // number gives a new layout (in between, the holes drift across).
    vec2 seed = vec2(37.3, 91.7) * uHolePattern;
    vec2 q = p * 4.2 / uHoleSize;
    q += (vec2(holeNoise(vec3(p * 2.0 + seed, 1.7)), holeNoise(vec3(p * 2.0 + seed, 8.3))) - 0.5) * uHoleWarp;
    q *= vec2(1.0, uHoleStretch); // a little stretched, like risen dough
    q += seed;
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float best = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(x, y);
        vec2 h = holeHash2(cell + o);
        float pick = fract(h.x * 13.7 + h.y * 7.1);
        float cluster = holeNoise(vec3((cell + o) * 0.45, 4.2));
        if (pick * 0.55 + cluster * 0.6 < 1.0 - uHoleAmount) continue;
        float r = mix(0.1, 0.24, fract(pick * 5.3));
        best = min(best, length(o + 0.25 + 0.5 * h - f) - r);
      }
    }
    // Lumpy edges.
    return best + (holeNoise(vec3(q * 2.6, 3.1)) - 0.5) * 0.06;
  }
`;

// Cel shading: a hard light/shade split, halftone shading creeping in as the
// surface turns away from the light, and an optional glossy highlight.
export function createToonMaterial({ base, shade, dots, specular = 0, holes = false }, shared, dissolve) {
  const defines = {};
  if (dissolve) defines.DISSOLVE = '';
  if (holes) defines.HOLES = '';
  return new THREE.ShaderMaterial({
    defines,
    uniforms: {
      ...shared,
      ...dissolve,
      ...holeUniforms,
      uBase: { value: new THREE.Color(base) },
      uShade: { value: new THREE.Color(shade) },
      uDots: { value: new THREE.Color(dots) },
      uSpecular: { value: specular },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying float vUp;
      varying vec3 vViewDir;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;
      uniform mat4 uToastInv;
      #ifdef DISSOLVE
        attribute float edgeDist;
        varying float vEdge;
      #endif
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        // Position on the toast as it sits unmoved, so noise and the switch
        // shape stay stuck to the toast however it's placed or turned.
        vWorldPos = (uToastInv * worldPos).xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        // How much the surface faces the toast's own up, whatever its angle.
        vUp = normalize(mat3(uToastInv) * vNormal).y;
        vViewDir = cameraPosition - worldPos.xyz;
        vec4 viewPos = viewMatrix * worldPos;
        vViewPos = viewPos.xyz;
        #ifdef DISSOLVE
          vEdge = edgeDist;
        #endif
        gl_Position = projectionMatrix * viewPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uShade;
      uniform vec3 uDots;
      uniform vec3 uLightDir;
      uniform float uSpecular;
      uniform int uColorMode;
      uniform float uAngle;
      uniform float uAmount;
      uniform float uReach;
      uniform vec3 uSingleColor;
      uniform float uShift;
      uniform float uShine;
      uniform float uGloss;
      uniform vec3 uLightDir2;
      uniform float uShine2;
      uniform float uShadowWobble;
      uniform float uShadowWobbleSize;
      varying vec3 vNormal;
      varying float vUp;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      // Smooth 3D value noise, stuck to the toast's surface.
      float hash31(vec3 p) {
        return fract(sin(dot(p, vec3(17.1, 113.5, 61.7))) * 43758.5453);
      }
      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
              mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
              mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      ${halftoneGLSL}
      #ifdef DISSOLVE
        ${dissolveGLSL}
      #endif

      #ifdef HOLES
        ${holesGLSL}
      #endif

      // Glossy highlight: a small solid core with a ring of light dots around it.
      // Only on the rounded edges of the spread: the flat top never shines, so
      // it can't turn white, even while the toast tumbles in at an angle.
      vec3 addShine(vec3 color, vec3 N, vec3 V, vec3 L, float amount, vec2 dotOffset) {
        float edge = 1.0 - smoothstep(0.88, 0.96, vUp);
        float spec = pow(max(dot(N, normalize(L + V)), 0.0), uGloss) * edge * amount;
        vec3 shine = vec3(1.0, 0.97, 0.99);
        float glow = smoothstep(0.03, 0.55, spec) * 0.8 * uShine;
        color = mix(color, shine, halftone(gl_FragCoord.xy + dotOffset, uAngle, glow) * uSpecular);
        return mix(color, shine, smoothstep(0.55, 0.6, spec) * uSpecular);
      }

      vec3 inkDots; // the halftone dot color, picked per pixel in main()
      #ifdef DISSOLVE
        float inkLine(float m) {
          return 1.0 - smoothstep(uCutWidth - 1.0, uCutWidth, m / max(fwidth(m), 1e-5));
        }
      #endif

      vec3 shadeWithHalftone(vec3 color, float dark) {
        vec2 fc = gl_FragCoord.xy;
        if (uColorMode == 1) {
          return mix(color, uSingleColor, halftone(fc, uAngle, dark));
        }
        if (uColorMode == 2) {
          // Cyan, magenta and yellow screens at classic print angles, printed over each other.
          float c = halftone(fc, uAngle + 0.2618, dark);
          float m = halftone(fc, uAngle + 1.309, dark);
          float y = halftone(fc, uAngle, dark * 0.8);
          color *= mix(vec3(1.0), vec3(0.0, 0.68, 0.93), c * 0.6);
          color *= mix(vec3(1.0), vec3(0.93, 0.0, 0.55), m * 0.6);
          color *= mix(vec3(1.0), vec3(1.0, 0.92, 0.0), y * 0.6);
          return color;
        }
        if (uColorMode == 3) {
          // Red, green and blue dot screens at different angles, nudged out of register.
          vec2 o = vec2(uShift * uDotSize / 6.0, 0.0);
          color = mix(color, vec3(0.96, 0.18, 0.25), halftone(fc + o, uAngle + 0.2618, dark * 0.5) * 0.9);
          color = mix(color, vec3(0.1, 0.72, 0.42), halftone(fc, uAngle + 1.309, dark * 0.5) * 0.9);
          color = mix(color, vec3(0.16, 0.32, 0.95), halftone(fc - o, uAngle, dark * 0.5) * 0.9);
          return color;
        }
        return mix(color, inkDots, halftone(fc, uAngle, dark));
      }

      void main() {
        vec3 base = uBase;
        vec3 shade = uShade;
        inkDots = uDots;
        #ifdef DISSOLVE
          float cutLine = 0.0;
          if (uSwitch.y > 0.5) {
            float m = switchMargin();
            if (m < 0.0) {
              // Still the old color here, with an ink line a few pixels wide
              // along the new color's edge (it fades as the shape settles).
              base = uOldBase;
              shade = uOldShade;
              inkDots = uOldDots;
              cutLine = inkLine(-m) * switchBlend();
            }
          }
        #endif

        vec3 N = normalize(vNormal);
        vec3 L = normalize(uLightDir);
        vec3 V = normalize(vViewDir);
        float ndl = dot(N, L);
        // Push the light/shadow border around with a little noise, so it wanders
        // like a painted edge instead of running dead straight down the crust.
        vec3 q = vWorldPos * uShadowWobbleSize;
        // Faces turned well toward the light (the tops) are left alone so they stay clean.
        float wobbleWeight = 1.0 - smoothstep(0.35, 0.65, ndl);
        ndl += (noise3(q) * 0.65 + noise3(q * 2.7 + 11.0) * 0.35 - 0.5) * uShadowWobble * wobbleWeight;

        float lit = smoothstep(-0.02, 0.02, ndl);
        vec3 color = mix(shade, base, lit);
        float holeDark = 0.0;
        #ifdef HOLES
          // Halftone dots inside each hole, heavier along its upper lip.
          if (vUp > 0.7) {
            float inHole = step(holeDistance(vWorldPos.xz), 0.0);
            float lip = inHole * step(0.0, holeDistance(vWorldPos.xz + vec2(0.025, -0.035) * uHoleSize));
            holeDark = inHole * 0.2 + lip * 0.35;
          }
        #endif

        float dark = max((1.0 - smoothstep(-0.6, uReach, ndl)) * uAmount, holeDark);
        color = shadeWithHalftone(color, dark);

        color = addShine(color, N, V, L, 1.0, vec2(0.5 * uDotSize));
        color = addShine(color, N, V, normalize(uLightDir2), uShine2, vec2(0.0));
        #ifdef DISSOLVE
          color = mix(color, uCutInk, cutLine);
        #endif

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// Normals for the outline pass (same packing as THREE.MeshNormalMaterial).
// The crumb's version dips the normal inside each bread hole so the outline
// pass inks the holes.
export function createNormalMaterial({ holes = false, shared = null } = {}) {
  return new THREE.ShaderMaterial({
    defines: holes ? { HOLES: '' } : {},
    uniforms: holes ? { ...holeUniforms, uToastInv: shared.uToastInv } : {},
    vertexShader: /* glsl */ `
      varying vec3 vViewNormal;
      #ifdef HOLES
        uniform mat4 uToastInv;
        varying vec3 vWorldPos;
        varying float vUp;
      #endif
      void main() {
        vViewNormal = normalize(normalMatrix * normal);
        #ifdef HOLES
          vWorldPos = (uToastInv * modelMatrix * vec4(position, 1.0)).xyz;
          vUp = normalize(mat3(uToastInv) * mat3(modelMatrix) * normal).y;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vViewNormal;
      #ifdef HOLES
        varying vec3 vWorldPos;
        varying float vUp;
        ${holesGLSL}
      #endif
      void main() {
        vec3 n = normalize(vViewNormal);
        #ifdef HOLES
          // Inside a hole the surface "dips": tipping the normal hard makes
          // the outline pass see a fold all around the hole and ink it.
          if (vUp > 0.7 && holeDistance(vWorldPos.xz) < 0.0) n = normalize(n + vec3(0.9, -0.9, 0.0));
        #endif
        gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
      }
    `,
  });
}

// Full-screen pass in the spirit of Maxime Heckel's "Moebius" post-processing:
// edges come from a Sobel filter over depth and normals, and the lookup
// coordinates are wobbled so the outlines come out squiggly and hand-drawn.
// The wobble jumps a few times per second ("line boil"), like hand-drawn animation.
export function createOutlineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tNormal: { value: null },
      tDepth: { value: null },
      uResolution: { value: new THREE.Vector2() },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
      uInk: { value: new THREE.Color(palette.ink) },
      uThickness: { value: 2.0 },
      uWobble: { value: 1.1 },
      uBoilFps: { value: 6.0 },
      uDepthEdge: { value: 0.03 }, // how big a depth jump needs a line
      uNormalEdge: { value: 0.4 }, // how sharp a fold needs a line
      uBgTop: { value: new THREE.Color(palette.background[0]) },
      uBgMid: { value: new THREE.Color(palette.background[1]) },
      uBgBottom: { value: new THREE.Color(palette.background[2]) },
      uBgTime: { value: 0 },
      uBgFlow: { value: 0.35 }, // how much the noise bends the gradient
      uBgDotSize: { value: 6 }, // CSS pixels
      uBgDotAngle: { value: -0.2 }, // radians
      uBgDotDrift: { value: 2 }, // dot rows per second, along the screen's tilt
      uBgDots: { value: 0.7 }, // dot strength
      uBgNoiseOpacity: { value: 0.65 },
      uBgNoiseScale: { value: 1.2 },
      uBgSoft: { value: 0.6 }, // 0 = full strength, 1 = pale and gentle
      // Rounded frame around the scene, in CSS pixels:
      // x = border width, y = corner radius, z = outline width.
      uFrame: { value: new THREE.Vector3(20, 32, 2) },
      uFrameColor: { value: new THREE.Color('#ffedcb') },
      uFrameInk: { value: new THREE.Color(palette.ink) },
      // Magnetic border: where the bulge is (CSS px, from the bottom left),
      // how strongly it's pulled right now (0..1), its width and its height.
      uMagnet: { value: new THREE.Vector2() },
      // The NEXT button's circle: center (CSS px, from the bottom left) and
      // radius; radius 0 hides it.
      uNext: { value: new THREE.Vector3(0, 0, 0) },
      uNextColor: { value: new THREE.Color('#ff71c3') },
      uMagnetStrength: { value: 0 },
      uMagnetSize: { value: 90 },
      uMagnetPull: { value: 24 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D tColor;
      uniform sampler2D tNormal;
      uniform sampler2D tDepth;
      uniform vec2 uResolution;
      uniform float uPixelRatio;
      uniform float uTime;
      uniform float uNear;
      uniform float uFar;
      uniform vec3 uInk;
      uniform float uThickness;
      uniform float uWobble;
      uniform float uBoilFps;
      uniform float uDepthEdge;
      uniform float uNormalEdge;
      uniform vec3 uBgTop;
      uniform vec3 uBgMid;
      uniform vec3 uBgBottom;
      uniform float uBgTime;
      uniform float uBgFlow;
      uniform float uBgDotSize;
      uniform float uBgDotAngle;
      uniform float uBgDotDrift;
      uniform float uBgDots;
      uniform float uBgNoiseOpacity;
      uniform float uBgNoiseScale;
      uniform float uBgSoft;
      uniform vec3 uFrame;
      uniform vec3 uFrameColor;
      uniform vec3 uFrameInk;
      uniform vec2 uMagnet;
      uniform vec3 uNext;
      uniform vec3 uNextColor;
      uniform float uMagnetStrength;
      uniform float uMagnetSize;
      uniform float uMagnetPull;
      varying vec2 vUv;

      // Signed distance to a rounded rectangle (negative inside).
      float roundRect(vec2 p, vec2 halfSize, float r) {
        vec2 q = abs(p) - halfSize + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      // 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT licence).
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
      }

      // Soft light blend (same formula as CSS / Photoshop).
      vec3 softLight(vec3 base, vec3 blend) {
        vec3 d = mix(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, step(base, vec3(0.25)));
        return mix(
          base - (1.0 - 2.0 * blend) * base * (1.0 - base),
          base + (2.0 * blend - 1.0) * (d - base),
          step(0.5, blend)
        );
      }

      // Colorful noise layer: cyan, blue, magenta, yellow and orange fields.
      vec3 noiseRamp(float x) {
        x = clamp(x, 0.0, 1.0) * 4.0;
        vec3 c0 = vec3(0.18, 0.88, 1.0);
        vec3 c1 = vec3(0.29, 0.24, 1.0);
        vec3 c2 = vec3(1.0, 0.25, 0.82);
        vec3 c3 = vec3(1.0, 0.91, 0.23);
        vec3 c4 = vec3(1.0, 0.35, 0.12);
        if (x < 1.0) return mix(c0, c1, smoothstep(0.0, 1.0, x));
        if (x < 2.0) return mix(c1, c2, smoothstep(1.0, 2.0, x));
        if (x < 3.0) return mix(c2, c3, smoothstep(2.0, 3.0, x));
        return mix(c3, c4, smoothstep(3.0, 4.0, x));
      }

      // Pink to orange to green from top to bottom, with a slowly drifting
      // simplex-noise color layer on top in soft light, then one angled
      // halftone screen over the result.
      // bgUv runs 0..1 across the inside of the frame.
      vec3 background(vec2 cssPx, vec2 bgUv, float aspect) {
        vec2 p = vec2(bgUv.x * aspect, bgUv.y);
        float t = uBgTime * 0.05;

        float g = bgUv.y + snoise(vec3(p * 0.9, t)) * 0.12 * uBgFlow;
        g = clamp(g, 0.0, 1.0);
        vec3 color = g > 0.5
          ? mix(uBgMid, uBgTop, smoothstep(0.5, 1.0, g))
          : mix(uBgBottom, uBgMid, smoothstep(0.0, 0.5, g));

        vec2 q = p * uBgNoiseScale;
        float n = snoise(vec3(q + vec2(0.0, t * 0.6), t)) * 0.5 + 0.5;
        n = mix(n, snoise(vec3(q * 1.9 + 7.3, t * 1.4)) * 0.5 + 0.5, 0.3);
        vec3 layer = noiseRamp(n);
        // Softer: the noise colors lean lighter (soft light then mostly
        // brightens instead of muddying), and the whole thing goes a bit pastel.
        layer = mix(layer, vec3(1.0), uBgSoft * 0.45);
        color = mix(color, softLight(color, layer), uBgNoiseOpacity);
        color = mix(color, vec3(1.0), uBgSoft * 0.22);

        // One halftone screen: dots grow where the color is darker and are
        // printed in a deeper, richer version of the color underneath.
        float c = cos(uBgDotAngle), s = sin(uBgDotAngle);
        vec2 grid = mat2(c, -s, s, c) * cssPx / uBgDotSize;
        // The screen slides slowly upward along its own tilt, so the dots
        // drift diagonally while their sizes keep following the colors below.
        grid.y -= uBgTime * uBgDotDrift;
        float d = length(fract(grid) - 0.5);
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        float r = sqrt(clamp((1.0 - luma) * mix(1.2, 0.6, uBgSoft) + mix(0.12, 0.3, uBgSoft), 0.0, 1.0)) * 0.55;
        float aa = fwidth(d) * 0.75;
        float dotMask = 1.0 - smoothstep(r - aa, r + aa, d);
        vec3 ink = mix(pow(color, vec3(1.8)) * 0.85, color * 0.88, uBgSoft);
        vec3 paper = mix(color, vec3(1.0), mix(0.1, 0.16, uBgSoft));
        return mix(color, mix(paper, ink, dotMask), uBgDots);
      }

      float linearDepth(vec2 uv) {
        float z = texture2D(tDepth, uv).x;
        return -perspectiveDepthToViewZ(z, uNear, uFar);
      }

      void main() {
        float frame = floor(uTime * uBoilFps);
        vec2 jitter = vec2(hash(vec2(frame, 1.0)), hash(vec2(frame, 2.0))) * 100.0;
        vec2 cssPx = gl_FragCoord.xy / uPixelRatio;

        // Squiggle: a fine, tight jitter measured in CSS pixels, so the line
        // keeps its path and only its edge wobbles.
        vec2 wobble = vec2(
          noise(cssPx * 0.3 + jitter) - 0.5,
          noise(cssPx * 0.3 + jitter.yx + 17.0) - 0.5
        ) * 2.0;
        vec2 texel = 1.0 / uResolution;
        vec2 uv = vUv + wobble * uWobble * uPixelRatio * texel;

        // Nearly even line weight, like a felt-tip pen.
        float weight = uThickness * uPixelRatio * mix(0.9, 1.1, noise(cssPx * 0.05 + jitter * 0.1));
        vec2 o = texel * weight;

        float d01 = linearDepth(uv + vec2(-o.x, 0.0));
        float d10 = linearDepth(uv + vec2(0.0, -o.y));
        float d11 = linearDepth(uv);
        float d12 = linearDepth(uv + vec2(0.0, o.y));
        float d21 = linearDepth(uv + vec2(o.x, 0.0));

        vec3 n01 = texture2D(tNormal, uv + vec2(-o.x, 0.0)).rgb;
        vec3 n10 = texture2D(tNormal, uv + vec2(0.0, -o.y)).rgb;
        vec3 n12 = texture2D(tNormal, uv + vec2(0.0, o.y)).rgb;
        vec3 n21 = texture2D(tNormal, uv + vec2(o.x, 0.0)).rgb;

        // Second differences (how much the center differs from its four
        // neighbours) instead of first differences: a flat or evenly curving
        // surface seen at a steep angle changes depth and normal steadily and
        // gives ~0 here, so it no longer smears into a muddy dark band. Real
        // silhouettes and creases still jump and still get a line.
        vec3 n11 = texture2D(tNormal, uv).rgb;
        float depthJump = abs(d01 + d21 + d10 + d12 - 4.0 * d11) / max(d11, 0.001);
        float normalJump = length(n01 + n21 + n10 + n12 - 4.0 * n11);
        float edge = max(
          smoothstep(uDepthEdge, uDepthEdge * 1.5, depthJump),
          smoothstep(uNormalEdge, uNormalEdge * 1.3, normalJump)
        );

        // The frame: the scene sits in a rounded window inside a cream border,
        // outlined with the same wobbly pen as the toast.
        vec2 view = uResolution / uPixelRatio;
        vec2 inner = max(view - 2.0 * uFrame.x, vec2(1.0));
        float frameDist = roundRect(cssPx + wobble * uWobble * 0.5 - view * 0.5, inner * 0.5, uFrame.y);
        // Near the cursor the cream border swells inward in a soft, slightly
        // wobbling bump, as if it's being pulled toward the pointer.
        vec2 toMagnet = cssPx - uMagnet;
        float bump = exp(-dot(toMagnet, toMagnet) / (2.0 * uMagnetSize * uMagnetSize));
        bump *= 1.0 + 0.12 * sin(uBgTime * 3.1 + toMagnet.x * 0.03) * sin(uBgTime * 2.3 + toMagnet.y * 0.03);
        frameDist += bump * uMagnetStrength * uMagnetPull;
        float aaPx = 0.75 / uPixelRatio;
        float inside = 1.0 - smoothstep(-aaPx, aaPx, frameDist);
        float frameLine = 1.0 - smoothstep(uFrame.z * 0.5 - aaPx, uFrame.z * 0.5 + aaPx, abs(frameDist + uFrame.z * 0.5));

        vec3 color = texture2D(tColor, vUv).rgb;
        // Nothing was drawn here (only the clear color): show the gradient.
        if (texture2D(tDepth, vUv).x >= 0.99999) {
          vec2 bgUv = (cssPx - uFrame.x) / inner;
          color = background(cssPx, bgUv, inner.x / inner.y);
        }
        color = mix(color, uInk, edge);
        // NEXT: a flat pink circle in the corner with the frame's ink line,
        // wobbling the same way. It sits over the scene and under the frame.
        if (uNext.z > 0.0) {
          float nextDist = length(cssPx + wobble * uWobble * 0.5 - uNext.xy) - uNext.z;
          float nextFill = 1.0 - smoothstep(-aaPx, aaPx, nextDist);
          float nextLine = 1.0 - smoothstep(uFrame.z * 0.5 - aaPx, uFrame.z * 0.5 + aaPx, abs(nextDist + uFrame.z * 0.5));
          color = mix(color, uNextColor, nextFill);
          color = mix(color, uFrameInk, nextLine);
        }
        color = mix(uFrameColor, color, inside);
        // A touch of paper grain.
        color *= 1.0 - hash(floor(cssPx)) * 0.035;
        gl_FragColor = vec4(mix(color, uFrameInk, frameLine), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}
