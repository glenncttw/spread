# Spread The Love

A hand-drawn looking toast, rendered with Three.js.

- `index.html` is the page. Open it through any static web server (for example `npx serve .`) or GitHub Pages.
- `src/toon.js` holds the look: cel shading with halftone-dot shadows, and a post-processing pass that draws wobbly ink outlines from depth and normal edges (after Maxime Heckel's "Moebius" style post-processing).
- `assets/toast_purple.glb` is the model (decompressed from the original Draco file so no decoder is needed).
- `vendor/three` is a pinned copy of Three.js r186, so the page has no build step.

Add `?still` to the URL to stop the cursor follow and line wiggle.

The scene sits in a rounded window inside a cream border (#FFEDCB, 20px border and 32px corners on a 1440px-wide screen, scaling with the window width). A slider panel ("Tweak the look") sits in the top right for trying halftone patterns, colors, light, background, frame and outlines. "Copy settings" copies the current values so they can be made the new defaults in `src/tweaks.js`. Add `?clean` to the URL to hide the panel.

The "Pick your spread" titles use BD Karlo (`assets/fonts`). Their positions, and the five flavor dots on the left, are measured off the 1440x800 mockup in CSS units of `--u` (one mockup pixel), so they match it at that size and scale with the window width. On phones the dots move to a row at the bottom.

Picking a dot shrinks the spread away as a solid outlined shape and grows the new flavor back in (`src/spreadSwitch.js`). The toast floats gently and turns slightly toward the cursor; the "Toast position" sliders place, turn and size it and set the float. When the cursor nears the edge, the cream border bulges toward it on a springy follow ("Magnetic border" in the Frame folder).

"Layout overlay" in the panel lets you upload a mockup image and show it over the page (20% opacity by default) to check positions (`src/overlay.js`).
