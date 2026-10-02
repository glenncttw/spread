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
} from './tweaks.js';
import { createSpreadSwitch } from './spreadSwitch.js';

// The shaders work in display colors directly (see palette in toon.js).
THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
const still = params.has('still'); // no auto-rotate or line boil, for screenshots
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
controls.autoRotate = !still;
controls.autoRotateSpeed = 0.8;

const shared = createSharedUniforms();

const dissolve = createDissolveUniforms();

const materials = {
  'Purple Crumb': createToonMaterial(palette.crumb, shared),
  'Purple Crust': createToonMaterial(palette.crust, shared),
  'Purple Spread': createToonMaterial({ ...palette.spread, specular: 1 }, shared, dissolve),
};
const plainNormals = createNormalMaterial();
const normalMaterials = { 'Purple Spread': createNormalMaterial(dissolve) };

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
  scene.add(gltf.scene);
});

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
const settings = { ...defaults, spin: defaults.spin && !still };
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
}
const spreadSwitch = createSpreadSwitch({
  dissolve,
  getColor: () => settings.spread,
  getTiming: () => ({
    outSeconds: settings.switchOut,
    gapSeconds: settings.switchGap,
    inSeconds: settings.switchIn,
    variation: settings.switchVariation,
  }),
  setColor: (color) => {
    settings.spread = color;
    applyAll();
    panel?.controllersRecursive().forEach((c) => c.updateDisplay());
  },
});
const panel = showPanel
  ? createTweakPanel(settings, () => {
      applyAll();
      spreadSwitch.sync();
    })
  : null;

window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  updateLights(settings, shared, camera, controls.target);
  const time = still ? 0 : performance.now() / 1000;
  outline.uniforms.uTime.value = time;
  dissolve.uDissolveTime.value = time;
  outline.uniforms.uBgTime.value = time * settings.bgSpeed;

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
window.toast = { settings, apply: applyAll, camera, controls, dissolve, switchSpread: () => spreadSwitch.switchSpread() };
