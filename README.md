# Spread The Love

A hand-drawn looking toast, rendered with Three.js.

- `index.html` is the page. Open it through any static web server (for example `npx serve .`) or GitHub Pages.
- `src/toon.js` holds the look: cel shading with halftone-dot shadows, and a post-processing pass that draws wobbly ink outlines from depth and normal edges (after Maxime Heckel's "Moebius" style post-processing).
- `assets/toast_purple.glb` is the model (decompressed from the original Draco file so no decoder is needed).
- `vendor/three` is a pinned copy of Three.js r186, so the page has no build step.

Add `?still` to the URL to stop the rotation and line wiggle.

The scene sits in a rounded window inside a cream border (#FFEDCB, 20px border and 32px corners on a 1440px-wide screen, scaling with the window width). A slider panel ("Tweak the look") sits in the top right for trying halftone patterns, colors, light, background, frame and outlines. "Copy settings" copies the current values so they can be made the new defaults in `src/tweaks.js`. Add `?clean` to the URL to hide the panel.

The "Switch to …" button at the bottom shrinks the spread away as a solid outlined shape and grows the next flavor back in (`src/spreadSwitch.js`).
