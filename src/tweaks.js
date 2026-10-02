import * as THREE from 'three';
import GUI from '../vendor/lil-gui/lil-gui.esm.min.js';
import { palette, PATTERNS, COLOR_MODES } from './toon.js';
import { easingChoices } from './spreadSwitch.js';

// Slider-friendly settings (pixels, degrees, 0..1). `applySettings` turns them
// into shader uniforms. "Copy settings" puts the current values on the
// clipboard so they can be pasted back here as the new defaults.
export const defaults = {
  pattern: 'Dots',
  colorMode: 'Tinted',
  singleColor: palette.ink,
  size: 6,
  angle: 45,
  amount: 0.85,
  reach: 0.7,
  rgbShift: 2,
  lightAround: 88,
  lightHeight: 52,
  followCamera: true,
  highlightSize: 0.67,
  highlightDots: 1,
  secondHighlight: 1,
  secondAround: -60,
  secondHeight: 30,
  shadowWobble: 0.7,
  shadowWobbleSize: 2.5,
  switchOut: 1.8,
  switchGap: 0,
  switchOutEasing: 'Random',
  switchInEasing: 'Random',
  switchIn: 1.8,
  switchVariation: 0.5,
  outlineColor: palette.ink,
  thickness: 2,
  squiggle: 1.1,
  boil: 6,
  lineDepth: 0.03,
  lineFold: 0.4,
  crust: palette.crust.base,
  crumb: palette.crumb.base,
  spread: palette.spread.base,
  holeAmount: 0.25,
  holeSize: 1,
  bgTop: palette.background[0],
  bgMiddle: palette.background[1],
  bgBottom: palette.background[2],
  bgFlow: 0.35,
  bgSpeed: 1,
  bgDotSize: 6,
  bgDotAngle: -12,
  bgDots: 0.7,
  bgNoise: 0.65,
  bgNoiseScale: 1.2,
  bgSoft: 0.6,
  // Frame sizes are what they measure on a 1440px-wide screen; they scale
  // with the window width from there.
  frameBorder: 20,
  frameRadius: 32,
  frameLine: 2,
  frameColor: '#ffedcb',
  frameInk: palette.ink,
  magnet: true,
  magnetPull: 24,
  magnetSize: 90,
  magnetReach: 160,
  floatAmount: 0.5,
  floatSpeed: 1,
  floatTilt: 1,
  followDelay: 0.06,
  letterLean: 5,
  // Where the toast sits. Positions are in scene units, angles in degrees.
  toastX: 0,
  toastY: -0.3,
  toastZ: 0,
  toastTurn: 0,
  toastTilt: 0,
  toastRoll: 0,
  toastSize: 1,
  followCursor: true,
  followAmount: 14,
  followSmooth: 0.35,
  orbit: false,
  spin: false,
};

export function applySettings(s, { shared, outline, materials, scene, controls, pixelRatio }) {
  shared.uPattern.value = PATTERNS[s.pattern];
  shared.uColorMode.value = COLOR_MODES[s.colorMode];
  shared.uSingleColor.value.set(s.singleColor);
  shared.uDotSize.value = s.size * pixelRatio;
  shared.uAngle.value = THREE.MathUtils.degToRad(s.angle);
  shared.uAmount.value = s.amount;
  shared.uReach.value = s.reach;
  shared.uShift.value = s.rgbShift;
  shared.uGloss.value = THREE.MathUtils.lerp(150, 15, s.highlightSize);
  shared.uShine.value = s.highlightDots;
  shared.uShine2.value = s.secondHighlight;
  shared.uShadowWobble.value = s.shadowWobble;
  shared.uShadowWobbleSize.value = s.shadowWobbleSize;

  outline.uniforms.uInk.value.set(s.outlineColor);
  outline.uniforms.uThickness.value = s.thickness;
  outline.uniforms.uWobble.value = s.squiggle;
  outline.uniforms.uBoilFps.value = s.boil;
  outline.uniforms.uDepthEdge.value = s.lineDepth;
  outline.uniforms.uNormalEdge.value = s.lineFold;

  const u = outline.uniforms;
  u.uBgTop.value.set(s.bgTop);
  u.uBgMid.value.set(s.bgMiddle);
  u.uBgBottom.value.set(s.bgBottom);
  u.uBgFlow.value = s.bgFlow;
  u.uBgDotSize.value = s.bgDotSize;
  u.uBgDotAngle.value = THREE.MathUtils.degToRad(s.bgDotAngle);
  u.uBgDots.value = s.bgDots;
  u.uBgNoiseOpacity.value = s.bgNoise;
  u.uBgNoiseScale.value = s.bgNoiseScale;
  u.uBgSoft.value = s.bgSoft;
  u.uFrameColor.value.set(s.frameColor);
  u.uFrameInk.value.set(s.frameInk);
  const f = frameSize(s);
  u.uFrame.value.set(f.border, f.radius, f.line);
  u.uMagnetPull.value = s.magnetPull * f.scale;
  u.uMagnetSize.value = s.magnetSize * f.scale;
  const root = document.documentElement.style;
  root.setProperty('--frame-border', `${f.border}px`);
  root.setProperty('--frame-radius', `${f.radius}px`);
  root.setProperty('--ink-line', `${f.line}px`);
  updateTitleInk(s, f);
  root.setProperty('--frame-color', s.frameColor);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.frameColor);
  controls.autoRotate = s.spin;
  controls.enabled = s.orbit;
}

// The frame scales with the window width (the sizes are set for 1440px),
// with a small floor so it doesn't vanish on phones.
export function frameSize(s, width = window.innerWidth) {
  const scale = width / 1440;
  return {
    border: Math.max(s.frameBorder * scale, s.frameBorder * 0.5),
    radius: Math.max(s.frameRadius * scale, s.frameRadius * 0.6),
    line: Math.max(s.frameLine * scale, 1.5),
    scale: Math.max(scale, 0.5),
  };
}

// The title outline and shadow are SVG filters, which can't read CSS sizes,
// so their sizes are set here whenever the window or the settings change.
function updateTitleInk(s, f) {
  const width = window.innerWidth;
  const u = width <= 700 ? width / 760 : width / 1440; // same as --u in index.html
  const sizes = { 'title-big-ink': [6, 8], 'title-small-ink': [3, 3.5] };
  for (const [id, [dx, dy]] of Object.entries(sizes)) {
    const filter = document.getElementById(id);
    if (!filter) continue;
    filter.querySelector('feMorphology').setAttribute('radius', (f.line * 1.5).toFixed(2));
    filter.querySelector('feFlood').setAttribute('flood-color', s.frameInk);
    filter.querySelectorAll('feOffset').forEach((offset) => {
      const step = Number(offset.dataset.step);
      offset.setAttribute('dx', (dx * u * step).toFixed(2));
      offset.setAttribute('dy', (dy * u * step).toFixed(2));
    });
  }
}

function setDirection(target, aroundDeg, heightDeg) {
  const around = THREE.MathUtils.degToRad(aroundDeg);
  const height = THREE.MathUtils.degToRad(heightDeg);
  target.set(
    Math.cos(height) * Math.cos(around),
    Math.sin(height),
    Math.cos(height) * Math.sin(around),
  );
}

// Called every frame. With "follows the camera" on, the light's direction is
// measured from wherever the camera is, so the shading turns with the view
// instead of staying put on the toast.
export function updateLights(s, shared, camera, target) {
  const cameraAround = s.followCamera
    ? THREE.MathUtils.radToDeg(Math.atan2(camera.position.z - target.z, camera.position.x - target.x))
    : 55; // where the camera starts
  setDirection(shared.uLightDir.value, cameraAround + s.lightAround, s.lightHeight);
  setDirection(shared.uLightDir2.value, cameraAround + s.secondAround, s.secondHeight);
}

// Surface colors: the shade and dot tones are derived from the base color
// only once someone moves that color away from its default.
export function applySurfaceColor(material, hex, original) {
  const u = material.uniforms;
  if (hex.toLowerCase() === original.base) {
    u.uBase.value.set(original.base);
    u.uShade.value.set(original.shade);
    u.uDots.value.set(original.dots);
    return;
  }
  u.uBase.value.set(hex);
  u.uShade.value.set(hex).multiplyScalar(0.86);
  u.uDots.value.set(hex).multiplyScalar(0.5);
}

export function createTweakPanel(settings, onChange, overlay) {
  const gui = new GUI({ title: 'Tweak the look', width: 280 });

  const place = gui.addFolder('Toast position');
  place.add(settings, 'toastX', -3, 3, 0.01).name('Left / right');
  place.add(settings, 'toastY', -2, 2, 0.01).name('Down / up');
  place.add(settings, 'toastZ', -3, 3, 0.01).name('Back / front');
  place.add(settings, 'toastTurn', -180, 180, 1).name('Turn');
  place.add(settings, 'toastTilt', -90, 90, 1).name('Tilt');
  place.add(settings, 'toastRoll', -90, 90, 1).name('Roll');
  place.add(settings, 'toastSize', 0.3, 2.5, 0.01).name('Size');
  place.add(settings, 'followCursor').name('Follows the cursor');
  place.add(settings, 'followAmount', 0, 45, 1).name('Follow amount (°)');
  place.add(settings, 'followSmooth', 0, 0.95, 0.01).name('Follow smoothness');
  place.add(settings, 'floatAmount', 0, 2, 0.01).name('Float amount');
  place.add(settings, 'floatSpeed', 0, 3, 0.01).name('Float speed');
  place.add(settings, 'floatTilt', 0, 3, 0.01).name('Float tilt');
  place.add(settings, 'followDelay', 0, 0.6, 0.01).name('Follow delay (s)');
  place.add(settings, 'orbit').name('Drag to orbit camera');
  place.add(settings, 'spin').name('Spin');

  if (overlay) {
    const layout = gui.addFolder('Layout overlay');
    layout.add(overlay, 'upload').name('Upload image…');
    const show = layout.add(overlay.state, 'show').name('Show overlay').onChange(overlay.render);
    layout.add(overlay.state, 'opacity', 0, 1, 0.01).name('Opacity').onChange(overlay.render);
    overlay.onLoaded(() => show.updateDisplay());
  }

  const shading = gui.addFolder('Halftone shading');
  shading.add(settings, 'pattern', Object.keys(PATTERNS)).name('Pattern');
  shading.add(settings, 'colorMode', Object.keys(COLOR_MODES)).name('Colors');
  shading.addColor(settings, 'singleColor').name('Single color');
  shading.add(settings, 'size', 3, 18, 0.5).name('Size');
  shading.add(settings, 'angle', 0, 90, 1).name('Angle');
  shading.add(settings, 'amount', 0, 1, 0.01).name('Darkness');
  shading.add(settings, 'reach', -0.3, 1, 0.01).name('How far it reaches');
  shading.add(settings, 'rgbShift', 0, 6, 0.1).name('Color offset');
  shading.add(settings, 'shadowWobble', 0, 1, 0.01).name('Shadow edge wobble');
  shading.add(settings, 'shadowWobbleSize', 0.5, 10, 0.1).name('Wobble size');

  const light = gui.addFolder('Light');
  light.add(settings, 'lightAround', -180, 180, 1).name('Direction');
  light.add(settings, 'lightHeight', 5, 85, 1).name('Height');
  light.add(settings, 'followCamera').name('Follows the camera');

  const highlight = gui.addFolder('Spread highlight');
  highlight.add(settings, 'highlightSize', 0, 1, 0.01).name('Size');
  highlight.add(settings, 'highlightDots', 0, 1, 0.01).name('Dots around it');
  highlight.add(settings, 'secondHighlight', 0, 1, 0.01).name('Second highlight');
  highlight.add(settings, 'secondAround', -180, 180, 1).name('Second direction');
  highlight.add(settings, 'secondHeight', 5, 85, 1).name('Second height');

  const switching = gui.addFolder('Spread switch');
  switching.add(settings, 'switchOut', 0.3, 5, 0.05).name('Out duration (s)');
  switching.add(settings, 'switchOutEasing', easingChoices).name('Out easing');
  switching.add(settings, 'switchGap', 0, 2, 0.01).name('Delay before in (s)');
  switching.add(settings, 'switchIn', 0.3, 5, 0.05).name('In duration (s)');
  switching.add(settings, 'switchInEasing', easingChoices).name('In easing');
  switching.add(settings, 'switchVariation', 0, 1, 0.01).name('Variation (shape & speed)');

  const bg = gui.addFolder('Background');
  bg.addColor(settings, 'bgTop').name('Top');
  bg.addColor(settings, 'bgMiddle').name('Middle');
  bg.addColor(settings, 'bgBottom').name('Bottom');
  bg.add(settings, 'bgSoft', 0, 1, 0.01).name('Softness');
  bg.add(settings, 'bgNoise', 0, 1, 0.01).name('Noise colors (soft light)');
  bg.add(settings, 'bgNoiseScale', 0.2, 5, 0.05).name('Noise size');
  bg.add(settings, 'bgFlow', 0, 1, 0.01).name('Swirl');
  bg.add(settings, 'bgSpeed', 0, 5, 0.05).name('Movement speed');
  bg.add(settings, 'bgDotSize', 2, 20, 0.5).name('Dot size');
  bg.add(settings, 'bgDotAngle', -45, 45, 1).name('Dot angle');
  bg.add(settings, 'bgDots', 0, 1, 0.01).name('Dot strength');

  const frame = gui.addFolder('Frame (sizes at 1440px wide)');
  frame.add(settings, 'frameBorder', 0, 60, 1).name('Border (px)');
  frame.add(settings, 'frameRadius', 0, 80, 1).name('Corner radius (px)');
  frame.add(settings, 'frameLine', 0, 6, 0.25).name('Outline (px)');
  frame.addColor(settings, 'frameColor').name('Border color');
  frame.addColor(settings, 'frameInk').name('Outline color');
  frame.add(settings, 'magnet').name('Magnetic border');
  frame.add(settings, 'magnetPull', 0, 80, 1).name('Magnet bulge (px)');
  frame.add(settings, 'magnetSize', 20, 250, 1).name('Magnet width (px)');
  frame.add(settings, 'magnetReach', 20, 400, 1).name('Magnet reach (px)');

  const title = gui.addFolder('Title');
  title.add(settings, 'letterLean', 0, 15, 0.5).name('Letter lean (°)');
  title.add({ shuffle: () => window.toast?.shuffleLetters() }, 'shuffle').name('Shuffle letter lean');

  const outlines = gui.addFolder('Outlines');
  outlines.addColor(settings, 'outlineColor').name('Color');
  outlines.add(settings, 'thickness', 0.5, 5, 0.1).name('Thickness');
  outlines.add(settings, 'squiggle', 0, 5, 0.1).name('Squiggle');
  outlines.add(settings, 'boil', 0, 15, 1).name('Wiggle speed');
  outlines.add(settings, 'lineDepth', 0.01, 0.3, 0.005).name('Outline: depth needed');
  outlines.add(settings, 'lineFold', 0.1, 1.5, 0.01).name('Inner lines: fold needed');

  const colors = gui.addFolder('Colors');
  colors.addColor(settings, 'crust').name('Crust');
  colors.addColor(settings, 'crumb').name('Bread');
  colors.addColor(settings, 'spread').name('Spread');
  colors.add(settings, 'holeAmount', 0, 1, 0.01).name('Bread holes: how many');
  colors.add(settings, 'holeSize', 0.3, 3, 0.05).name('Bread holes: size');

  const actions = {
    copy() {
      const text = JSON.stringify(settings, null, 2);
      navigator.clipboard?.writeText(text).then(
        () => copyButton.name('Copied!'),
        () => window.prompt?.('Copy these settings:', text),
      );
      setTimeout(() => copyButton.name('Copy settings'), 1500);
    },
    reset() {
      Object.assign(settings, defaults);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      onChange();
    },
  };
  const copyButton = gui.add(actions, 'copy').name('Copy settings');
  gui.add(actions, 'reset').name('Reset');

  gui.onChange(onChange);
  if (window.innerWidth < 600) gui.close();
  return gui;
}
