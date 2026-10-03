// The cursor's push on the background halftone, like a thumb dragged through
// wet printed ink. Not a fluid simulation: a coarse grid (about one cell per
// halftone dot) where every cell holds how far its ink has been shoved
// (displacement, in CSS pixels) and how fast it's moving. The cursor drags the
// cells under it along with it; each cell is on a springy band back to its
// rest spot, so the ink overshoots a little and wobbles home. The outline
// pass reads this texture to move, resize and stretch the dots.
//
// Every number worth tweaking is in `pressureDefaults` (and in the panel).
import * as THREE from 'three';

export const pressureDefaults = {
  pressRadius: 110, // CSS px: how wide the cursor's push is
  pressForce: 0.45, // how much of the cursor's movement the ink picks up
  pressSpeed: 0.8, // how much faster moves push harder (0 = speed doesn't matter)
  pressReturn: 34, // spring stiffness: how quickly dots go back to rest
  pressDecay: 5.5, // damping: low = bouncy, high = settles without wobble
  pressTrail: 0.6, // how much the push drifts on behind the cursor (0..1)
  pressDisplace: 1, // how far dots are moved by the push
  pressPressure: 1, // how much squeezed dots grow and stretched dots shrink
  pressDeform: 1, // how much fast-moving dots stretch into ovals and blobs
  pressWobble: 0.3, // small hand-printed irregularities, even at rest
};

export const CELL = 8; // CSS px per field cell

const updateShader = /* glsl */ `
  uniform sampler2D uField;
  uniform vec2 uView; // CSS px
  uniform vec2 uTexel;
  uniform float uDt;
  uniform vec2 uFrom; // the cursor's path this frame, CSS px from bottom left
  uniform vec2 uTo;
  uniform vec2 uMouseVel; // CSS px per second
  uniform float uActive;
  uniform float uRadius;
  uniform float uForce;
  uniform float uSpeed;
  uniform float uStiff;
  uniform float uDamp;
  uniform float uTrail;
  varying vec2 vUv;

  void main() {
    // Carry the push along its own motion, so it drifts on behind the cursor.
    vec4 here = texture2D(uField, vUv);
    vec2 from = vUv - here.zw * uDt * uTrail / uView;
    vec4 f = texture2D(uField, from);
    // Share a little with the neighbours so the push spreads like ink.
    vec4 around = 0.25 * (
      texture2D(uField, from + vec2(uTexel.x, 0.0)) + texture2D(uField, from - vec2(uTexel.x, 0.0)) +
      texture2D(uField, from + vec2(0.0, uTexel.y)) + texture2D(uField, from - vec2(0.0, uTexel.y))
    );
    f = mix(f, around, 0.12);
    vec2 d = f.xy; // displacement
    vec2 w = f.zw; // its velocity

    // The cursor: everything near this frame's stretch of its path is
    // dragged towards moving with it (faster moves drag harder).
    vec2 px = vUv * uView;
    vec2 seg = uTo - uFrom;
    float h = clamp(dot(px - uFrom, seg) / max(dot(seg, seg), 1e-4), 0.0, 1.0);
    float dist = length(px - uFrom - seg * h);
    float near = 1.0 - smoothstep(0.0, uRadius, dist);
    near *= near * uActive;
    float speed = length(uMouseVel);
    vec2 target = uMouseVel * uForce * (1.0 + uSpeed * speed / 900.0);
    w = mix(w, target, near * 0.6);

    // Spring back to rest.
    w += (-uStiff * d - uDamp * w) * uDt;
    d += w * uDt;
    // Never shove ink further than a few dots.
    float len = length(d);
    if (len > 70.0) d *= 70.0 / len;
    gl_FragColor = vec4(d, w);
  }
`;

export function createPressureField(renderer) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uField: { value: null },
      uView: { value: new THREE.Vector2(1, 1) },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uDt: { value: 0 },
      uFrom: { value: new THREE.Vector2() },
      uTo: { value: new THREE.Vector2() },
      uMouseVel: { value: new THREE.Vector2() },
      uActive: { value: 0 },
      uRadius: { value: 100 },
      uForce: { value: 0.5 },
      uSpeed: { value: 1 },
      uStiff: { value: 30 },
      uDamp: { value: 5 },
      uTrail: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: updateShader,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene().add(quad);

  const options = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  };
  let read = new THREE.WebGLRenderTarget(1, 1, options);
  let write = new THREE.WebGLRenderTarget(1, 1, options);
  const last = { x: 0, y: 0, known: false };
  const u = material.uniforms;

  function clearBoth() {
    const color = new THREE.Color();
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(color);
    renderer.setClearColor(0x000000, 0);
    for (const target of [read, write]) {
      renderer.setRenderTarget(target);
      renderer.clear();
    }
    renderer.setClearColor(color, alpha);
  }

  return {
    get texture() {
      return read.texture;
    },
    resize(width, height) {
      const w = Math.max(1, Math.round(width / CELL));
      const h = Math.max(1, Math.round(height / CELL));
      if (read.width === w && read.height === h) return;
      read.setSize(w, h);
      write.setSize(w, h);
      u.uView.value.set(width, height);
      u.uTexel.value.set(1 / w, 1 / h);
      clearBoth();
    },
    // x, y: the cursor in CSS px from the bottom left; `inside` is false when
    // there's no cursor over the page. `s` is the settings object.
    step(dt, x, y, inside, s) {
      dt = Math.min(Math.max(dt, 1 / 240), 1 / 30);
      const active = inside && last.known;
      u.uFrom.value.set(active ? last.x : x, active ? last.y : y);
      u.uTo.value.set(x, y);
      u.uMouseVel.value.set(active ? (x - last.x) / dt : 0, active ? (y - last.y) / dt : 0);
      u.uActive.value = active ? 1 : 0;
      last.x = x;
      last.y = y;
      last.known = inside;

      u.uDt.value = dt;
      u.uRadius.value = s.pressRadius;
      u.uForce.value = s.pressForce;
      u.uSpeed.value = s.pressSpeed;
      u.uStiff.value = s.pressReturn;
      u.uDamp.value = s.pressDecay;
      u.uTrail.value = s.pressTrail;
      u.uField.value = read.texture;
      quad.material = material;
      renderer.setRenderTarget(write);
      renderer.render(scene, camera);
      [read, write] = [write, read];
    },
  };
}
