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
  lightAround: 143,
  lightHeight: 52,
  highlightSize: 0.67,
  highlightDots: 1,
  outlineColor: palette.ink,
  thickness: 2,
  squiggle: 1.1,
  boil: 6,
  crust: palette.crust.base,
  crumb: palette.crumb.base,
  spread: palette.spread.base,
  paper: palette.paper,
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

  const around = THREE.MathUtils.degToRad(s.lightAround);
  const height = THREE.MathUtils.degToRad(s.lightHeight);
  shared.uLightDir.value.set(
    Math.cos(height) * Math.cos(around),
    Math.sin(height),
    Math.cos(height) * Math.sin(around),
  );

  outline.uniforms.uInk.value.set(s.outlineColor);
  outline.uniforms.uThickness.value = s.thickness;
  outline.uniforms.uWobble.value = s.squiggle;
  outline.uniforms.uBoilFps.value = s.boil;

  scene.background.set(s.paper);
  controls.autoRotate = s.spin;
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

  const light = gui.addFolder('Light');
  light.add(settings, 'lightAround', 0, 360, 1).name('Direction');
  light.add(settings, 'lightHeight', 5, 85, 1).name('Height');

  const highlight = gui.addFolder('Spread highlight');
  highlight.add(settings, 'highlightSize', 0, 1, 0.01).name('Size');
  highlight.add(settings, 'highlightDots', 0, 1, 0.01).name('Dots around it');

  const outlines = gui.addFolder('Outlines');
  outlines.addColor(settings, 'outlineColor').name('Color');
  outlines.add(settings, 'thickness', 0.5, 5, 0.1).name('Thickness');
  outlines.add(settings, 'squiggle', 0, 5, 0.1).name('Squiggle');
  outlines.add(settings, 'boil', 0, 15, 1).name('Wiggle speed');

  const colors = gui.addFolder('Colors');
  colors.addColor(settings, 'crust').name('Crust');
  colors.addColor(settings, 'crumb').name('Bread');
  colors.addColor(settings, 'spread').name('Spread');
  colors.addColor(settings, 'paper').name('Background');
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
