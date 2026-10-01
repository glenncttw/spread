import * as THREE from 'three';

// Shared look settings. Colors are display (sRGB) values; color management is
// turned off in main.js so these hex codes show up on screen exactly as written.
export const palette = {
  paper: '#f4ecdc',
  ink: '#24122c',
  crumb: { base: '#f6dfa8', shade: '#dcb478' },
  crust: { base: '#c46a2c', shade: '#97461c' },
  spread: { base: '#a75bd1', shade: '#7a3aa6' },
};

// Halftone dots on a 45° screen-space grid. `dark` (0..1) sets the dot radius,
// so shading reads as printed dots rather than a smooth gradient.
const halftoneGLSL = /* glsl */ `
  float halftone(vec2 fragCoord, float cellSize, float dark) {
    vec2 p = fragCoord / cellSize;
    p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;
    float d = length(fract(p) - 0.5);
    float r = sqrt(clamp(dark, 0.0, 1.0)) * 0.72;
    float aa = fwidth(d) * 0.75;
    return (1.0 - smoothstep(r - aa, r + aa, d)) * step(0.02, dark);
  }
`;

// Cel shading: a hard light/shade split, halftone dots creeping in as the
// surface turns away from the light, and an optional crisp specular blob.
export function createToonMaterial({ base, shade, specular = 0 }, shared) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(base) },
      uShade: { value: new THREE.Color(shade) },
      uSpecular: { value: specular },
      uInk: shared.uInk,
      uLightDir: shared.uLightDir,
      uDotSize: shared.uDotSize,
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = cameraPosition - worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uShade;
      uniform vec3 uInk;
      uniform vec3 uLightDir;
      uniform float uSpecular;
      uniform float uDotSize;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      ${halftoneGLSL}
      void main() {
        vec3 N = normalize(vNormal);
        vec3 L = normalize(uLightDir);
        vec3 V = normalize(vViewDir);
        float ndl = dot(N, L);

        float lit = smoothstep(-0.02, 0.02, ndl);
        vec3 color = mix(uShade, uBase, lit);

        float dark = (1.0 - smoothstep(-0.7, 0.35, ndl)) * 0.7;
        color = mix(color, uInk, halftone(gl_FragCoord.xy, uDotSize, dark));

        float spec = pow(max(dot(N, normalize(L + V)), 0.0), 60.0);
        color = mix(color, vec3(1.0, 0.97, 0.94), smoothstep(0.55, 0.6, spec) * uSpecular);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// A paper-colored floor that only shows a halftone contact shadow under the toast.
export function createGroundMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPaper: { value: new THREE.Color(palette.paper) },
      uInk: shared.uInk,
      uDotSize: shared.uDotSize,
      uLightDir: shared.uLightDir,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorld = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPaper;
      uniform vec3 uInk;
      uniform vec3 uLightDir;
      uniform float uDotSize;
      varying vec3 vWorld;
      ${halftoneGLSL}
      void main() {
        // Push the shadow away from the light a little.
        vec2 offset = -normalize(uLightDir.xz) * 0.35;
        float d = length((vWorld.xz - offset) / vec2(1.25, 1.4));
        float dark = (1.0 - smoothstep(0.55, 1.2, d)) * 0.75;
        gl_FragColor = vec4(mix(uPaper, uInk, halftone(gl_FragCoord.xy, uDotSize, dark)), 1.0);
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
      uThickness: { value: 1.6 },
      uWobble: { value: 3.0 },
      uBoilFps: { value: 6.0 },
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

      float linearDepth(vec2 uv) {
        float z = texture2D(tDepth, uv).x;
        return -perspectiveDepthToViewZ(z, uNear, uFar);
      }

      void main() {
        float frame = floor(uTime * uBoilFps);
        vec2 jitter = vec2(hash(vec2(frame, 1.0)), hash(vec2(frame, 2.0))) * 100.0;
        vec2 cssPx = gl_FragCoord.xy / uPixelRatio;

        // Squiggle: slow sine sway plus finer noise, measured in CSS pixels.
        vec2 wobble = vec2(
          sin(cssPx.y * 0.045 + frame * 1.7) + (noise(cssPx * 0.09 + jitter) - 0.5) * 1.6,
          cos(cssPx.x * 0.045 + frame * 2.3) + (noise(cssPx * 0.09 + jitter.yx + 17.0) - 0.5) * 1.6
        );
        vec2 texel = 1.0 / uResolution;
        vec2 uv = vUv + wobble * uWobble * uPixelRatio * texel;

        // Slightly uneven line weight, like a pen.
        float weight = uThickness * uPixelRatio * mix(0.75, 1.3, noise(cssPx * 0.02 + jitter * 0.1));
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
          smoothstep(0.08, 0.2, depthEdge),
          smoothstep(0.9, 1.4, normalEdge)
        );

        vec3 color = texture2D(tColor, vUv).rgb;
        // A touch of paper grain.
        color *= 1.0 - hash(floor(cssPx)) * 0.035;
        gl_FragColor = vec4(mix(color, uInk, edge), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}
