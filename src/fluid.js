// A small liquid simulation for the background: a grid of velocities that is
// stirred by the cursor (and by two slow, invisible stirrers that keep it
// moving on its own), kept from bunching up by a pressure solve, and given a
// little extra curl so it swirls. It doesn't carry color itself; it carries a
// "where did this bit of liquid come from" offset, which the background uses
// to bend its noise layer, so the colors smear and swirl like ink in water and
// then slowly ease back.
//
// Everything runs on the GPU in small half-float textures (about 128 cells
// tall), so it costs very little. Units: positions are measured in screen
// heights (x runs 0..aspect, y 0..1), velocities in screen heights per second.
import * as THREE from 'three';

const SIM_HEIGHT = 128;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Shared helpers: neighbours one cell away, and the cell size in screen heights.
const gridGLSL = /* glsl */ `
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec2 left() { return vUv - vec2(uTexel.x, 0.0); }
  vec2 right() { return vUv + vec2(uTexel.x, 0.0); }
  vec2 below() { return vUv - vec2(0.0, uTexel.y); }
  vec2 above() { return vUv + vec2(0.0, uTexel.y); }
  float cell() { return uTexel.y; }
`;

function pass(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { uTexel: { value: new THREE.Vector2() }, ...uniforms },
    vertexShader,
    fragmentShader: gridGLSL + fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}

// Moves a field along the velocity (looking back to where each cell's
// contents came from) and lets it fade. For the offset field it also adds the
// distance travelled, so the offset keeps pointing back to the origin.
const advect = pass(
  /* glsl */ `
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform float uDt;
  uniform float uKeep;
  uniform float uIsOffset;
  uniform float uAspect;
  void main() {
    vec2 v = texture2D(uVelocity, vUv).xy;
    vec2 back = v * uDt * vec2(1.0 / uAspect, 1.0); // in texture coordinates
    // Four taps half a cell apart: a touch of blur each step (like a little
    // viscosity) keeps the liquid silky and stops grid-sized ripples building up.
    vec2 from = vUv - back;
    vec2 h = uTexel * 0.5;
    vec4 value = 0.25 * (
      texture2D(uSource, from + vec2(-h.x, -h.y)) + texture2D(uSource, from + vec2(h.x, -h.y)) +
      texture2D(uSource, from + vec2(-h.x, h.y)) + texture2D(uSource, from + vec2(h.x, h.y))
    );
    if (uIsOffset > 0.5) value.xy -= v * uDt;
    gl_FragColor = value * uKeep;
  }
`,
  {
    uVelocity: { value: null },
    uSource: { value: null },
    uDt: { value: 0 },
    uKeep: { value: 1 },
    uIsOffset: { value: 0 },
    uAspect: { value: 1 },
  },
);

// Adds a soft round push of velocity.
const splat = pass(
  /* glsl */ `
  uniform sampler2D uVelocity;
  uniform vec2 uPoint;
  uniform vec2 uForce;
  uniform float uRadius;
  uniform float uAspect;
  void main() {
    vec2 d = (vUv - uPoint) * vec2(uAspect, 1.0);
    float w = exp(-dot(d, d) / (uRadius * uRadius));
    vec2 v = texture2D(uVelocity, vUv).xy + uForce * w;
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`,
  {
    uVelocity: { value: null },
    uPoint: { value: new THREE.Vector2() },
    uForce: { value: new THREE.Vector2() },
    uRadius: { value: 0.1 },
    uAspect: { value: 1 },
  },
);

// How much the liquid spins at each cell.
const curl = pass(
  /* glsl */ `
  uniform sampler2D uVelocity;
  void main() {
    float spin = texture2D(uVelocity, right()).y - texture2D(uVelocity, left()).y
               - texture2D(uVelocity, above()).x + texture2D(uVelocity, below()).x;
    gl_FragColor = vec4(spin * 0.5 / cell(), 0.0, 0.0, 1.0);
  }
`,
  { uVelocity: { value: null } },
);

// Feeds spin back in where it's strongest, so small eddies don't smear out.
const swirl = pass(
  /* glsl */ `
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float uStrength;
  uniform float uDt;
  void main() {
    float c = texture2D(uCurl, vUv).x;
    vec2 towardSpin = vec2(
      abs(texture2D(uCurl, right()).x) - abs(texture2D(uCurl, left()).x),
      abs(texture2D(uCurl, above()).x) - abs(texture2D(uCurl, below()).x)
    );
    towardSpin /= length(towardSpin) + 1e-5;
    vec2 v = texture2D(uVelocity, vUv).xy + vec2(towardSpin.y, -towardSpin.x) * c * uStrength * uDt;
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`,
  { uVelocity: { value: null }, uCurl: { value: null }, uStrength: { value: 0 }, uDt: { value: 0 } },
);

// How much liquid flows out of each cell (walls at the screen edges).
const divergence = pass(
  /* glsl */ `
  uniform sampler2D uVelocity;
  void main() {
    vec2 c = texture2D(uVelocity, vUv).xy;
    float l = vUv.x - uTexel.x < 0.0 ? -c.x : texture2D(uVelocity, left()).x;
    float r = vUv.x + uTexel.x > 1.0 ? -c.x : texture2D(uVelocity, right()).x;
    float b = vUv.y - uTexel.y < 0.0 ? -c.y : texture2D(uVelocity, below()).y;
    float t = vUv.y + uTexel.y > 1.0 ? -c.y : texture2D(uVelocity, above()).y;
    gl_FragColor = vec4((r - l + t - b) * 0.5 / cell(), 0.0, 0.0, 1.0);
  }
`,
  { uVelocity: { value: null } },
);

// One relaxation step towards the pressure that evens the flow out.
const pressure = pass(
  /* glsl */ `
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  void main() {
    float sum = texture2D(uPressure, left()).x + texture2D(uPressure, right()).x
              + texture2D(uPressure, below()).x + texture2D(uPressure, above()).x;
    float d = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((sum - d * cell() * cell()) * 0.25, 0.0, 0.0, 1.0);
  }
`,
  { uPressure: { value: null }, uDivergence: { value: null } },
);

// Takes the pressure's push out of the velocity, leaving pure swirling flow.
const project = pass(
  /* glsl */ `
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  void main() {
    vec2 push = vec2(
      texture2D(uPressure, right()).x - texture2D(uPressure, left()).x,
      texture2D(uPressure, above()).x - texture2D(uPressure, below()).x
    ) * 0.5 / cell();
    gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - push, 0.0, 1.0);
  }
`,
  { uPressure: { value: null }, uVelocity: { value: null } },
);

const clear = pass(
  /* glsl */ `
  uniform sampler2D uSource;
  uniform float uKeep;
  void main() { gl_FragColor = texture2D(uSource, vUv) * uKeep; }
`,
  { uSource: { value: null }, uKeep: { value: 0.8 } },
);

function createTarget() {
  return new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
}
// A field that's read from one texture and written to the other, then swapped.
function createField() {
  const field = {
    read: createTarget(),
    write: createTarget(),
    swap() {
      [field.read, field.write] = [field.write, field.read];
    },
    setSize(w, h) {
      field.read.setSize(w, h);
      field.write.setSize(w, h);
    },
  };
  return field;
}

export function createFluid(renderer) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const scene = new THREE.Scene().add(quad);

  const velocity = createField();
  const offset = createField();
  const pressureField = createField();
  const curlTarget = createTarget();
  const divergenceTarget = createTarget();
  const texel = new THREE.Vector2();
  let aspect = 1;
  let fresh = true; // targets need clearing to zero before first use

  function run(material, target) {
    material.uniforms.uTexel.value.copy(texel);
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }

  function resize(width, height) {
    aspect = width / Math.max(height, 1);
    const h = SIM_HEIGHT;
    const w = Math.max(1, Math.round(h * aspect));
    if (texel.x === 1 / w) return; // same grid: keep the liquid as it is
    texel.set(1 / w, 1 / h);
    for (const field of [velocity, offset, pressureField]) field.setSize(w, h);
    curlTarget.setSize(w, h);
    divergenceTarget.setSize(w, h);
    fresh = true;
  }

  function zero(field) {
    clear.uniforms.uKeep.value = 0;
    for (let i = 0; i < 2; i++) {
      clear.uniforms.uSource.value = field.read.texture;
      run(clear, field.write);
      field.swap();
    }
  }

  function addSplat(x, y, fx, fy, radius) {
    splat.uniforms.uVelocity.value = velocity.read.texture;
    splat.uniforms.uPoint.value.set(x, y);
    splat.uniforms.uForce.value.set(fx, fy);
    splat.uniforms.uRadius.value = radius;
    splat.uniforms.uAspect.value = aspect;
    run(splat, velocity.write);
    velocity.swap();
  }

  // The cursor, in 0..1 screen coordinates (y up). Moves are split into a few
  // steps so a fast flick leaves a smooth stroke instead of a dotted one.
  const cursor = { x: 0, y: 0, known: false };
  let time = 0;

  // `stir` is how much the liquid moves by itself, `drag` how much the
  // cursor pushes it; both around 0..3 (1 is the default).
  function step(dt, { x, y, inside, stir = 1, drag = 1 }) {
    if (fresh) {
      for (const field of [velocity, offset, pressureField]) zero(field);
      fresh = false;
    }
    dt = Math.min(Math.max(dt, 1 / 240), 1 / 30);
    time += dt;

    // Two invisible stirrers drifting on slow loops keep the liquid alive.
    for (let i = 0; i < 2; i++) {
      const t = time * (0.11 + i * 0.04) + i * 2.7;
      const px = 0.5 + 0.38 * Math.sin(t * 1.3 + i);
      const py = 0.5 + 0.34 * Math.sin(t * 0.9 + i * 1.7);
      const vx = 0.38 * 1.3 * Math.cos(t * 1.3 + i) * aspect;
      const vy = 0.34 * 0.9 * Math.cos(t * 0.9 + i * 1.7);
      addSplat(px, py, vx * stir * dt * 1.5, vy * stir * dt * 1.5, 0.3);
    }

    if (inside && cursor.known && drag > 0) {
      const dx = (x - cursor.x) * aspect;
      const dy = y - cursor.y;
      const steps = Math.min(4, Math.ceil(Math.hypot(dx, dy) / 0.03));
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        // Force: the cursor's speed, so the liquid moves along with it.
        addSplat(
          cursor.x + (x - cursor.x) * k,
          cursor.y + (y - cursor.y) * k,
          (dx / dt) * 0.35 * drag / steps,
          (dy / dt) * 0.35 * drag / steps,
          0.085,
        );
      }
    }
    cursor.x = x;
    cursor.y = y;
    cursor.known = inside;

    // Extra curl, then make the flow even (no piling up or emptying out).
    curl.uniforms.uVelocity.value = velocity.read.texture;
    run(curl, curlTarget);
    swirl.uniforms.uVelocity.value = velocity.read.texture;
    swirl.uniforms.uCurl.value = curlTarget.texture;
    swirl.uniforms.uStrength.value = 0.2;
    swirl.uniforms.uDt.value = dt;
    run(swirl, velocity.write);
    velocity.swap();

    divergence.uniforms.uVelocity.value = velocity.read.texture;
    run(divergence, divergenceTarget);
    clear.uniforms.uKeep.value = 0.8; // start from most of last frame's pressure
    clear.uniforms.uSource.value = pressureField.read.texture;
    run(clear, pressureField.write);
    pressureField.swap();
    pressure.uniforms.uDivergence.value = divergenceTarget.texture;
    for (let i = 0; i < 20; i++) {
      pressure.uniforms.uPressure.value = pressureField.read.texture;
      run(pressure, pressureField.write);
      pressureField.swap();
    }
    project.uniforms.uPressure.value = pressureField.read.texture;
    project.uniforms.uVelocity.value = velocity.read.texture;
    run(project, velocity.write);
    velocity.swap();

    // Carry the velocity and the offsets along the flow. The velocity calms
    // down over a couple of seconds; the offsets ease back more slowly, so
    // the smeared colors drift home gently.
    advect.uniforms.uVelocity.value = velocity.read.texture;
    advect.uniforms.uDt.value = dt;
    advect.uniforms.uAspect.value = aspect;
    advect.uniforms.uSource.value = velocity.read.texture;
    advect.uniforms.uKeep.value = Math.exp(-dt * 0.9);
    advect.uniforms.uIsOffset.value = 0;
    run(advect, velocity.write);
    velocity.swap();

    advect.uniforms.uVelocity.value = velocity.read.texture;
    advect.uniforms.uSource.value = offset.read.texture;
    advect.uniforms.uKeep.value = Math.exp(-dt * 0.35);
    advect.uniforms.uIsOffset.value = 1;
    run(advect, offset.write);
    offset.swap();
  }

  return {
    resize,
    step,
    // Offsets (in screen heights) for the background to bend its noise by.
    get texture() {
      return offset.read.texture;
    },
  };
}
