import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  palette,
  createSharedUniforms,
  createToonMaterial,
  createOutlineMaterial,
} from './toon.js';
import { defaults, applySettings, applySurfaceColor, createTweakPanel } from './tweaks.js';

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

const materials = {
  'Purple Crumb': createToonMaterial(palette.crumb, shared),
  'Purple Crust': createToonMaterial(palette.crust, shared),
  'Purple Spread': createToonMaterial({ ...palette.spread, specular: 1 }, shared),
};

new GLTFLoader().load('./assets/toast_purple.glb', (gltf) => {
  gltf.scene.traverse((child) => {
    if (child.isMesh) child.material = materials[child.material.name] ?? materials['Purple Crumb'];
  });
  scene.add(gltf.scene);
});

// Render targets: the toon-shaded color, and normals + depth for finding edges.
const colorTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
const normalTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
  depthTexture: new THREE.DepthTexture(1, 1),
});
const normalMaterial = new THREE.MeshNormalMaterial();

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
  applySurfaceColor(materials['Purple Crust'], settings.crust, palette.crust);
  applySurfaceColor(materials['Purple Crumb'], settings.crumb, palette.crumb);
  applySurfaceColor(materials['Purple Spread'], settings.spread, palette.spread);
}
if (showPanel) createTweakPanel(settings, applyAll);

window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  outline.uniforms.uTime.value = still ? 0 : performance.now() / 1000;

  renderer.setRenderTarget(colorTarget);
  renderer.render(scene, camera);

  scene.overrideMaterial = normalMaterial;
  const background = scene.background;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(normalTarget);
  renderer.render(scene, camera);
  scene.background = background;
  scene.overrideMaterial = null;

  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCamera);
});

// Handy from the browser console: change `toast.settings`, then call `toast.apply()`.
window.toast = { settings, apply: applyAll, camera, controls };
