import * as THREE from 'three';

// Shared look settings. Colors are display (sRGB) values; color management is
// turned off in main.js so these hex codes show up on screen exactly as written.
export const palette = {
  paper: '#f4ecdc',
  background: ['#ff71c3', '#ff9c41', '#9cdd33'], // top, middle, bottom
  ink: '#211d1e',
  crumb: { base: '#f6dfa8', shade: '#e6c48a', dots: '#b98a4e' },
  crust: { base: '#c46a2c', shade: '#a9531f', dots: '#6e2c0e' },
  spread: { base: '#a75bd1', shade: '#8c45b8', dots: '#55247a' },
};

// Everything the slider panel can change. Patterns and color modes are
// numbered so the shader can switch on them.
export const PATTERNS = { Dots: 0, Lines: 1, Crosshatch: 2, Squares: 3, Stipple: 4 };
export const COLOR_MODES = { Tinted: 0, 'Single color': 1, 'CMY print': 2, RGB: 3 };

export function createSharedUniforms() {
  return {
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

// Shrink-and-grow for swapping the spread color. The spread stays a solid
// shape: its edge is cut by a wobbly blob that shrinks toward the bottom left
// until nothing is left, then the new color grows back out from the top right.
// The outline pass sees the same cut, so the ink line follows the edge as it
// moves. `uDissolve.x` is the progress (0..1); `uDissolve.y` is 0 while the
// old color shrinks away and 1 while the new one grows in.
export function createDissolveUniforms() {
  return {
    uDissolve: { value: new THREE.Vector2(0, 0) },
    uDissolveDir: { value: new THREE.Vector2(-Math.SQRT1_2, -Math.SQRT1_2) },
    uDissolveSeed: { value: new THREE.Vector2() },
    uDissolveNoise: { value: new THREE.Vector2(2.5, 0.3) }, // scale, strength
    uDissolveTime: { value: 0 },
    uCutInk: { value: new THREE.Color(palette.ink) },
    uCutWidth: { value: 3 }, // pixels
    uCenter: { value: new THREE.Vector3(0, 0.45, -0.17) },
    uRadius: { value: 1.3 },
  };
}

const dissolveGLSL = /* glsl */ `
  uniform vec2 uDissolve;
  uniform vec2 uDissolveDir;
  uniform vec2 uDissolveSeed;
  uniform vec2 uDissolveNoise;
  uniform float uDissolveTime;
  uniform vec3 uCutInk;
  uniform float uCutWidth;
  uniform vec3 uCenter;
  uniform float uRadius;
  varying vec3 vViewPos;

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

  // How far inside the remaining shape this point is (negative = cut away).
  float dissolveMargin() {
    if (uDissolve.y < 0.5 && uDissolve.x <= 0.0) return 1e3;
    vec3 center = (viewMatrix * vec4(uCenter, 1.0)).xyz;
    vec2 rel = (vViewPos.xy - center.xy) / uRadius;

    // Shrink toward the bottom left; grow from the top right.
    vec2 anchor = (uDissolve.y < 0.5 ? 0.6 : -0.6) * uDissolveDir;
    float d = length(rel - anchor);
    vec2 q = rel * uDissolveNoise.x + uDissolveSeed + uDissolveTime * 0.6;
    d += (dNoise(q) * 0.65 + dNoise(q * 2.3) * 0.35 - 0.5) * uDissolveNoise.y;

    float maxR = 1.3 + uDissolveNoise.y * 0.5;
    float r = uDissolve.y < 0.5 ? mix(maxR, 0.0, uDissolve.x) : mix(0.0, maxR, uDissolve.x);
    return r - d;
  }
`;

// Cel shading: a hard light/shade split, halftone shading creeping in as the
// surface turns away from the light, and an optional glossy highlight.
export function createToonMaterial({ base, shade, dots, specular = 0 }, shared, dissolve) {
  return new THREE.ShaderMaterial({
    defines: dissolve ? { DISSOLVE: '' } : {},
    uniforms: {
      ...shared,
      ...dissolve,
      uBase: { value: new THREE.Color(base) },
      uShade: { value: new THREE.Color(shade) },
      uDots: { value: new THREE.Color(dots) },
      uSpecular: { value: specular },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = cameraPosition - worldPos.xyz;
        vec4 viewPos = viewMatrix * worldPos;
        vViewPos = viewPos.xyz;
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

      // Glossy highlight: a small solid core with a ring of light dots around it.
      // Only on the rounded edges of the spread: the flat top (normal pointing
      // straight up) never shines, so it can't turn white when seen from above.
      vec3 addShine(vec3 color, vec3 N, vec3 V, vec3 L, float amount, vec2 dotOffset) {
        float edge = 1.0 - smoothstep(0.88, 0.96, N.y);
        float spec = pow(max(dot(N, normalize(L + V)), 0.0), uGloss) * edge * amount;
        vec3 shine = vec3(1.0, 0.97, 0.99);
        float glow = smoothstep(0.03, 0.55, spec) * 0.8 * uShine;
        color = mix(color, shine, halftone(gl_FragCoord.xy + dotOffset, uAngle, glow) * uSpecular);
        return mix(color, shine, smoothstep(0.55, 0.6, spec) * uSpecular);
      }

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
        return mix(color, uDots, halftone(fc, uAngle, dark));
      }

      void main() {
        #ifdef DISSOLVE
          float margin = dissolveMargin();
          if (margin < 0.0) discard;
          // Ink along the cut edge, a few pixels wide whatever the zoom.
          float cutLine = 1.0 - smoothstep(uCutWidth - 1.0, uCutWidth, margin / max(fwidth(margin), 1e-5));
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
        vec3 color = mix(uShade, uBase, lit);

        float dark = (1.0 - smoothstep(-0.6, uReach, ndl)) * uAmount;
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
// The spread's version hides whatever the dissolve has eaten, so its outline
// follows the solid part of the spread.
export function createNormalMaterial(dissolve) {
  return new THREE.ShaderMaterial({
    defines: dissolve ? { DISSOLVE: '' } : {},
    uniforms: { ...dissolve },
    vertexShader: /* glsl */ `
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        vViewNormal = normalize(normalMatrix * normal);
        vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = viewPos.xyz;
        gl_Position = projectionMatrix * viewPos;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vViewNormal;
      #ifdef DISSOLVE
        ${dissolveGLSL}
      #endif
      void main() {
        #ifdef DISSOLVE
          if (dissolveMargin() < 0.0) discard;
        #endif
        gl_FragColor = vec4(normalize(vViewNormal) * 0.5 + 0.5, 1.0);
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
      uBgTop: { value: new THREE.Color(palette.background[0]) },
      uBgMid: { value: new THREE.Color(palette.background[1]) },
      uBgBottom: { value: new THREE.Color(palette.background[2]) },
      uBgTime: { value: 0 },
      uBgFlow: { value: 0.35 }, // how much the noise bends the gradient
      uBgDotSize: { value: 6 }, // CSS pixels
      uBgDotAngle: { value: -0.2 }, // radians
      uBgDots: { value: 0.45 }, // dot strength
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
      uniform vec3 uBgTop;
      uniform vec3 uBgMid;
      uniform vec3 uBgBottom;
      uniform float uBgTime;
      uniform float uBgFlow;
      uniform float uBgDotSize;
      uniform float uBgDotAngle;
      uniform float uBgDots;
      varying vec2 vUv;

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

      float fbm(vec2 p) {
        return noise(p) * 0.55 + noise(p * 2.1 + 5.3) * 0.3 + noise(p * 4.3 + 9.1) * 0.15;
      }

      // Pink to orange to green from top to bottom. Slow-moving noise bends the
      // bands so the colors drift, and an angled halftone screen sits on top.
      vec3 background(vec2 cssPx) {
        vec2 uv = vUv;
        float aspect = uResolution.x / uResolution.y;
        vec2 p = vec2(uv.x * aspect, uv.y) * 1.6;
        float t = uBgTime * 0.06;
        vec2 warp = vec2(fbm(p + vec2(t, -t * 0.7)), fbm(p + vec2(3.7 - t * 0.8, 1.3 + t)));
        float g = uv.y + (warp.x - 0.5) * uBgFlow + (warp.y - 0.5) * uBgFlow * 0.5;
        g = clamp(g, 0.0, 1.0);
        vec3 color = g > 0.5
          ? mix(uBgMid, uBgTop, smoothstep(0.5, 1.0, g))
          : mix(uBgBottom, uBgMid, smoothstep(0.0, 0.5, g));

        float c = cos(uBgDotAngle), s = sin(uBgDotAngle);
        vec2 grid = mat2(c, -s, s, c) * cssPx / uBgDotSize;
        float d = length(fract(grid) - 0.5);
        float r = mix(0.28, 0.42, fbm(p * 1.3 - t * 1.5));
        float aa = fwidth(d) * 0.75;
        float dotMask = 1.0 - smoothstep(r - aa, r + aa, d);
        return mix(color, color * vec3(0.86, 0.8, 0.84), dotMask * uBgDots);
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

        float d00 = linearDepth(uv + vec2(-o.x, -o.y));
        float d01 = linearDepth(uv + vec2(-o.x, 0.0));
        float d02 = linearDepth(uv + vec2(-o.x, o.y));
        float d10 = linearDepth(uv + vec2(0.0, -o.y));
        float d11 = linearDepth(uv);
        float d12 = linearDepth(uv + vec2(0.0, o.y));
        float d20 = linearDepth(uv + vec2(o.x, -o.y));
        float d21 = linearDepth(uv + vec2(o.x, 0.0));
        float d22 = linearDepth(uv + vec2(o.x, o.y));
        float dgx = d00 + 2.0 * d01 + d02 - d20 - 2.0 * d21 - d22;
        float dgy = d00 + 2.0 * d10 + d20 - d02 - 2.0 * d12 - d22;
        float depthEdge = sqrt(dgx * dgx + dgy * dgy) / max(min(d11, d01 + d21), 0.001);

        vec3 n00 = texture2D(tNormal, uv + vec2(-o.x, -o.y)).rgb;
        vec3 n01 = texture2D(tNormal, uv + vec2(-o.x, 0.0)).rgb;
        vec3 n02 = texture2D(tNormal, uv + vec2(-o.x, o.y)).rgb;
        vec3 n10 = texture2D(tNormal, uv + vec2(0.0, -o.y)).rgb;
        vec3 n12 = texture2D(tNormal, uv + vec2(0.0, o.y)).rgb;
        vec3 n20 = texture2D(tNormal, uv + vec2(o.x, -o.y)).rgb;
        vec3 n21 = texture2D(tNormal, uv + vec2(o.x, 0.0)).rgb;
        vec3 n22 = texture2D(tNormal, uv + vec2(o.x, o.y)).rgb;
        vec3 ngx = n00 + 2.0 * n01 + n02 - n20 - 2.0 * n21 - n22;
        vec3 ngy = n00 + 2.0 * n10 + n20 - n02 - 2.0 * n12 - n22;
        float normalEdge = sqrt(dot(ngx, ngx) + dot(ngy, ngy));

        float edge = max(
          smoothstep(0.1, 0.14, depthEdge),
          smoothstep(1.0, 1.15, normalEdge)
        );

        vec3 color = texture2D(tColor, vUv).rgb;
        // Nothing was drawn here (only the clear color): show the gradient.
        if (texture2D(tDepth, vUv).x >= 0.99999) color = background(cssPx);
        // A touch of paper grain.
        color *= 1.0 - hash(floor(cssPx)) * 0.035;
        gl_FragColor = vec4(mix(color, uInk, edge), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}
