import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  palette,
  createSharedUniforms,
  createDissolveUniforms,
  createToonMaterial,
  createNormalMaterial,
  createOutlineMaterial,
} from './toon.js';
import {
  defaults,
  applySettings,
  applySurfaceColor,
  updateLights,
  createTweakPanel,
  frameSize,
} from './tweaks.js';
import { createSpreadSwitch } from './spreadSwitch.js';
import { createOverlay } from './overlay.js';

// The shaders work in display colors directly (see palette in toon.js).
THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
const still = params.has('still'); // no cursor follow or line boil, for screenshots
const showPanel = !params.has('clean'); // ?clean hides the slider panel

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.paper);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
camera.position.set(3.2, 3.4, 4.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.25, -0.15);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI * 0.48;
controls.autoRotateSpeed = 0.8;

const shared = createSharedUniforms();

const dissolve = createDissolveUniforms();

const materials = {
  'Purple Crumb': createToonMaterial({ ...palette.crumb, holes: true }, shared),
  'Purple Crust': createToonMaterial(palette.crust, shared),
  'Purple Spread': createToonMaterial({ ...palette.spread, specular: 1 }, shared, dissolve),
};
const plainNormals = createNormalMaterial();
const normalMaterials = {
  'Purple Spread': createNormalMaterial(dissolve),
  'Purple Crumb': createNormalMaterial(null, { holes: true, shared }),
};

// For each vertex of the spread: how far it is (across the toast) from the
// spread's rim, where the surface turns down. The color switch blends its
// shrinking shape with this so the spread stays round and blobby.
function addEdgeDistance(geometry) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const rim = [];
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(nrm.getY(i)) < 0.35) rim.push(pos.getX(i), pos.getZ(i));
  }
  const dist = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let best = Infinity;
    for (let j = 0; j < rim.length; j += 2) {
      const dx = x - rim[j];
      const dz = z - rim[j + 1];
      best = Math.min(best, dx * dx + dz * dz);
    }
    dist[i] = Math.sqrt(best) + 0.03;
  }
  geometry.setAttribute('edgeDist', new THREE.BufferAttribute(dist, 1));
}

// The toast hangs from two groups: `placement` takes the position sliders,
// `follow` adds the small turn toward the cursor. The model is offset so both
// turn it around its own middle.
const placement = new THREE.Group();
const follow = new THREE.Group();
const bob = new THREE.Group(); // the float
placement.add(follow);
follow.add(bob);
scene.add(placement);
let model = null;
const letterRolls = []; // see shuffleLetters()
const modelCenter = new THREE.Vector3();

const meshes = [];
new GLTFLoader().load('./assets/toast_purple.glb', (gltf) => {
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    const name = child.material.name;
    child.userData.toonMaterial = materials[name] ?? materials['Purple Crumb'];
    child.userData.normalMaterial = normalMaterials[name] ?? plainNormals;
    child.material = child.userData.toonMaterial;
    if (name === 'Purple Spread') addEdgeDistance(child.geometry);
    meshes.push(child);
  });
  model = gltf.scene;
  new THREE.Box3().setFromObject(model).getCenter(modelCenter);
  model.position.copy(modelCenter).negate();
  bob.add(model);
  placeToast();
});

function placeToast() {
  const deg = THREE.MathUtils.degToRad;
  placement.position.set(
    modelCenter.x + settings.toastX,
    modelCenter.y + settings.toastY,
    modelCenter.z + settings.toastZ,
  );
  placement.rotation.set(deg(settings.toastTilt), deg(settings.toastTurn), deg(settings.toastRoll), 'YXZ');
  placement.scale.setScalar(settings.toastSize);
}

// Cursor position across the window, -1..1 on each axis, plus where it is in
// pixels (for the magnetic border).
const pointer = new THREE.Vector2();
const pointerPx = { x: 0, y: 0, inside: false };
window.addEventListener('pointermove', (event) => {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  pointerPx.x = event.clientX;
  pointerPx.y = event.clientY;
  pointerPx.inside = true;
});
document.documentElement.addEventListener('pointerleave', () => {
  pointer.set(0, 0);
  pointerPx.inside = false;
});

// The cursor's recent path, so the toast can follow it a moment later.
const pointerHistory = [];
const followVelocity = { turn: 0, tilt: 0 };

// Spring-like smoothing (as in Unity's SmoothDamp): eases in and out and never
// overshoots. `time` is roughly how long it takes to catch up.
function smoothDamp(current, target, key, time, dt) {
  const omega = 2 / Math.max(time, 0.0001);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (followVelocity[key] + omega * change) * dt;
  followVelocity[key] = (followVelocity[key] - omega * temp) * decay;
  return target + (change + temp) * decay;
}

function followCursor(dt, now) {
  const on = settings.followCursor && !still;
  // Look up where the cursor was `followDelay` seconds ago.
  pointerHistory.push({ t: now, x: pointer.x, y: pointer.y });
  while (pointerHistory.length > 2 && pointerHistory[1].t <= now - settings.followDelay * 1000) pointerHistory.shift();
  const past = pointerHistory[0];
  const amount = THREE.MathUtils.degToRad(settings.followAmount);
  const targetTurn = on ? past.x * amount : 0;
  const targetTilt = on ? -past.y * amount * 0.6 : 0;
  // "Smoothness" 0 is snappy, 0.95 drifts slowly (about 1.5 seconds to catch up).
  const time = THREE.MathUtils.lerp(0.04, 1.5, settings.followSmooth);
  follow.rotation.y = smoothDamp(follow.rotation.y, targetTurn, 'turn', time, dt);
  follow.rotation.x = smoothDamp(follow.rotation.x, targetTilt, 'tilt', time, dt);
}

// A slow, gentle bob and sway so the toast feels like it's hovering.
function floatToast(time) {
  const a = still ? 0 : settings.floatAmount;
  const t = time * settings.floatSpeed;
  const deg = Math.PI / 180;
  bob.position.y = Math.sin(t * 1.1) * 0.05 * a;
  // Tip forward on the way up and back on the way down (follows the bob's
  // speed, so it leans into the movement), plus a slow side-to-side sway.
  bob.rotation.x = Math.cos(t * 1.1) * 2.2 * settings.floatTilt * a * deg;
  bob.rotation.z = Math.sin(t * 0.7 + 1.3) * 1.6 * a * deg + Math.cos(t * 1.1 + 0.6) * 0.8 * settings.floatTilt * a * deg;
  placement.position.x = modelCenter.x + settings.toastX + Math.sin(t * 0.5 + 0.4) * 0.02 * a;
}

// The magnetic border: the bulge chases the cursor along the frame on a
// springy follow, and swells as the cursor gets close to the edge.
const magnet = { x: 0, y: 0, vx: 0, vy: 0, strength: 0, vs: 0 };
function updateMagnet(dt) {
  const u = outline.uniforms;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const f = frameSize(settings, w);
  let target = 0;
  let tx = magnet.x;
  let ty = magnet.y;
  if (settings.magnet && pointerPx.inside && !still) {
    // Distance from the cursor to the nearest edge of the scene window.
    const d = Math.min(pointerPx.x - f.border, w - f.border - pointerPx.x, pointerPx.y - f.border, h - f.border - pointerPx.y);
    const reach = settings.magnetReach * f.scale;
    target = 1 - THREE.MathUtils.smoothstep(d, 0, reach);
    tx = pointerPx.x;
    ty = h - pointerPx.y; // the shader counts from the bottom
    if (magnet.strength < 0.01) {
      magnet.x = tx;
      magnet.y = ty;
    }
  }
  // Damped springs: a little overshoot makes it feel fluid and elastic.
  const k = 120;
  const damping = 14;
  magnet.vx += ((tx - magnet.x) * k - magnet.vx * damping) * dt;
  magnet.vy += ((ty - magnet.y) * k - magnet.vy * damping) * dt;
  magnet.x += magnet.vx * dt;
  magnet.y += magnet.vy * dt;
  magnet.vs += ((target - magnet.strength) * 90 - magnet.vs * 11) * dt;
  magnet.strength = Math.max(0, magnet.strength + magnet.vs * dt);
  u.uMagnet.value.set(magnet.x, magnet.y);
  u.uMagnetStrength.value = magnet.strength;
}

// Render targets: the toon-shaded color, and normals + depth for finding edges.
const colorTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
const normalTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
  depthTexture: new THREE.DepthTexture(1, 1),
});

const outline = createOutlineMaterial();
outline.uniforms.tColor.value = colorTarget.texture;
outline.uniforms.tNormal.value = normalTarget.texture;
outline.uniforms.tDepth.value = normalTarget.depthTexture;
outline.uniforms.uNear.value = camera.near;
outline.uniforms.uFar.value = camera.far;
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outline);
quad.frustumCulled = false;
const quadScene = new THREE.Scene();
quadScene.add(quad);
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = renderer.getPixelRatio();
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Keep the whole toast in frame on narrow (phone) screens.
  camera.fov = w / h < 1 ? 32 / Math.max(w / h, 0.55) : 32;
  camera.updateProjectionMatrix();
  colorTarget.setSize(w * dpr, h * dpr);
  normalTarget.setSize(w * dpr, h * dpr);
  outline.uniforms.uResolution.value.set(w * dpr, h * dpr);
  outline.uniforms.uPixelRatio.value = dpr;
  applyAll();
}
const settings = { ...defaults };
function applyAll() {
  applySettings(settings, {
    shared,
    outline,
    materials,
    scene,
    controls,
    pixelRatio: renderer.getPixelRatio(),
  });
  dissolve.uCutInk.value.set(settings.outlineColor);
  dissolve.uCutWidth.value = settings.thickness * 1.5 * renderer.getPixelRatio();
  applySurfaceColor(materials['Purple Crust'], settings.crust, palette.crust);
  applySurfaceColor(materials['Purple Crumb'], settings.crumb, palette.crumb);
  applySurfaceColor(materials['Purple Spread'], settings.spread, palette.spread);
  materials['Purple Crumb'].uniforms.uHoleAmount.value = settings.holeAmount;
  materials['Purple Crumb'].uniforms.uHoleSize.value = settings.holeSize;
  placeToast();
  if (letterRolls.length) leanLetters();
}
const spreadSwitch = createSpreadSwitch({
  dissolve,
  getColor: () => settings.spread,
  getTiming: () => ({
    outSeconds: settings.switchOut,
    gapSeconds: settings.switchGap,
    inSeconds: settings.switchIn,
    variation: settings.switchVariation,
    outEasing: settings.switchOutEasing,
    inEasing: settings.switchInEasing,
  }),
  setColor: (color) => {
    settings.spread = color;
    applyAll();
    panel?.controllersRecursive().forEach((c) => c.updateDisplay());
  },
});
const overlay = createOverlay();
const panel = showPanel
  ? createTweakPanel(settings, () => {
      applyAll();
      spreadSwitch.sync();
    }, overlay)
  : null;

window.addEventListener('resize', resize);
resize();

// Each letter of the big title leans a little, alternating sides with a
// random amount so it looks hand-placed. "Shuffle" in the panel re-rolls it.
function shuffleLetters() {
  letterRolls.length = 0;
  document.querySelectorAll('.title__big > span').forEach((letter, i) => {
    const side = (i % 2 ? 1 : -1) * (Math.random() < 0.2 ? -1 : 1);
    letterRolls.push(side * (0.35 + Math.random() * 0.65));
  });
  leanLetters();
}
function leanLetters() {
  document.querySelectorAll('.title__big > span').forEach((letter, i) => {
    letter.style.setProperty('--lean', (letterRolls[i] * settings.letterLean).toFixed(2));
  });
}
shuffleLetters();

// Re-roll the wobble on the HTML titles and buttons in step with the line boil.
const wobbles = document.querySelectorAll('feTurbulence');
let wobbleFrame = -1;

let lastFrame = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  controls.update();
  followCursor(dt, now);
  floatToast(now / 1000);
  updateMagnet(dt);
  scene.updateMatrixWorld();
  if (model) shared.uToastInv.value.copy(model.matrixWorld).invert();
  updateLights(settings, shared, camera, controls.target);
  const time = still ? 0 : performance.now() / 1000;
  outline.uniforms.uTime.value = time;
  dissolve.uDissolveTime.value = time;
  outline.uniforms.uBgTime.value = time * settings.bgSpeed;
  const boilFrame = Math.floor(time * settings.boil);
  if (boilFrame !== wobbleFrame) {
    wobbleFrame = boilFrame;
    wobbles.forEach((w) => w.setAttribute('seed', String(1 + (boilFrame % 7))));
  }

  renderer.setRenderTarget(colorTarget);
  renderer.render(scene, camera);

  for (const mesh of meshes) mesh.material = mesh.userData.normalMaterial;
  const background = scene.background;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(normalTarget);
  renderer.render(scene, camera);
  scene.background = background;
  for (const mesh of meshes) mesh.material = mesh.userData.toonMaterial;

  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCamera);
});

// Handy from the browser console: change `toast.settings`, then call `toast.apply()`.
window.toast = {
  settings,
  apply: applyAll,
  camera,
  controls,
  dissolve,
  overlay,
  outline,
  shuffleLetters,
  groups: { placement, follow, bob },
  switchSpread: () => spreadSwitch.switchSpread(),
};
