import * as THREE from 'three';
import GUI from '../vendor/lil-gui/lil-gui.esm.min.js';
import { palette, PATTERNS, COLOR_MODES } from './toon.js';

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
  switchGap: 0.2,
  switchIn: 1.8,
  switchVariation: 0.5,
  outlineColor: palette.ink,
  thickness: 2,
  squiggle: 1.1,
  boil: 6,
  crust: palette.crust.base,
  crumb: palette.crumb.base,
  spread: palette.spread.base,
  bgTop: palette.background[0],
  bgMiddle: palette.background[1],
  bgBottom: palette.background[2],
  bgFlow: 0.35,
  bgSpeed: 1,
  bgDotSize: 6,
  bgDotAngle: -12,
  bgDots: 0.45,
  spin: true,
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

  const u = outline.uniforms;
  u.uBgTop.value.set(s.bgTop);
  u.uBgMid.value.set(s.bgMiddle);
  u.uBgBottom.value.set(s.bgBottom);
  u.uBgFlow.value = s.bgFlow;
  u.uBgDotSize.value = s.bgDotSize;
  u.uBgDotAngle.value = THREE.MathUtils.degToRad(s.bgDotAngle);
  u.uBgDots.value = s.bgDots;
  controls.autoRotate = s.spin;
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

export function createTweakPanel(settings, onChange) {
  const gui = new GUI({ title: 'Tweak the look', width: 280 });

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
  switching.add(settings, 'switchGap', 0, 2, 0.05).name('Pause before in (s)');
  switching.add(settings, 'switchIn', 0.3, 5, 0.05).name('In duration (s)');
  switching.add(settings, 'switchVariation', 0, 1, 0.01).name('Variation');

  const bg = gui.addFolder('Background');
  bg.addColor(settings, 'bgTop').name('Top');
  bg.addColor(settings, 'bgMiddle').name('Middle');
  bg.addColor(settings, 'bgBottom').name('Bottom');
  bg.add(settings, 'bgFlow', 0, 1, 0.01).name('Swirl');
  bg.add(settings, 'bgSpeed', 0, 5, 0.05).name('Movement speed');
  bg.add(settings, 'bgDotSize', 2, 20, 0.5).name('Dot size');
  bg.add(settings, 'bgDotAngle', -45, 45, 1).name('Dot angle');
  bg.add(settings, 'bgDots', 0, 1, 0.01).name('Dot strength');

  const outlines = gui.addFolder('Outlines');
  outlines.addColor(settings, 'outlineColor').name('Color');
  outlines.add(settings, 'thickness', 0.5, 5, 0.1).name('Thickness');
  outlines.add(settings, 'squiggle', 0, 5, 0.1).name('Squiggle');
  outlines.add(settings, 'boil', 0, 15, 1).name('Wiggle speed');

  const colors = gui.addFolder('Colors');
  colors.addColor(settings, 'crust').name('Crust');
  colors.addColor(settings, 'crumb').name('Bread');
  colors.addColor(settings, 'spread').name('Spread');
  colors.add(settings, 'spin').name('Spin');

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
