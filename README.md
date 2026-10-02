# Spread The Love

A hand-drawn looking toast, rendered with Three.js.

- `index.html` is the page. Open it through any static web server (for example `npx serve .`) or GitHub Pages.
- `src/toon.js` holds the look: cel shading with halftone-dot shadows, and a post-processing pass that draws wobbly ink outlines from depth and normal edges (after Maxime Heckel's "Moebius" style post-processing).
- The bread top has generative holes (warped cellular noise). The normal pass dips the surface inside each one, so the outline pass inks them with the same wobbly line as the toast; the color pass adds a few halftone dots inside ("Bread holes" sliders under Colors: how many, size, pattern, stretch and lumpiness).
- `assets/toast_purple.glb` is the model (decompressed from the original Draco file so no decoder is needed).
- `vendor/three` is a pinned copy of Three.js r186 and `vendor/gsap` a copy of GSAP 3.15 (its ES module files), so the page has no build step.

Add `?still` to the URL to stop the cursor follow and line wiggle.

The scene sits in a rounded window inside a cream border (#FFEDCB, 20px border and 32px corners on a 1440px-wide screen, scaling with the window width). A slider panel ("Tweak the look") sits in the top right for trying halftone patterns, colors, light, background, frame and outlines. "Copy settings" copies the current values so they can be made the new defaults in `src/tweaks.js`. Add `?clean` to the URL to hide the panel.

The "Pick your spread" titles use BD Karlo (`assets/fonts`). Their positions, and the five flavor dots on the left, are measured off the 1440x800 mockup in CSS units of `--u` (one mockup pixel), so they match it at that size and scale with the window width. On phones the dots move to a row at the bottom. The titles' outline and shadow are SVG filters that grow one ink shape around all the letters together and stack five offset copies of it into an extruded shadow (the dots use the same five-step stack), and each letter of the big title leans a little at random ("Title" in the panel).

Picking a dot swaps the spread with two solid outlined shapes at once: the old color shrinks away while the new one grows in over it, after an optional "In delay" (`src/spreadSwitch.js`, timed with a GSAP timeline). Hovering a dot bounces it and pops out its name in a speech bubble. The NEXT button in the bottom right corner is a pink circle drawn by the canvas under the frame, with the same bounce (`src/ui.js`); it doesn't go anywhere yet. The toast floats gently (tipping as it bobs) and turns toward the cursor a moment later with an eased, spring-like follow; the "Toast position" sliders place, turn and size it and set the float. When the cursor nears the edge, the cream border bulges toward it on a springy follow ("Magnetic border" in the Frame folder).

A pink loading screen with a progress bar shows while the toast loads, then lifts off like a curtain with a wavy ink edge (`src/loader.js`) while the toast comes forward from far back, stood up at 90°, turning twice with cream speed streaks whipping round it (`src/streaks.js`) before it settles. The background halftone drifts slowly up along its tilt ("Dot drift speed" under Background).

"Layout overlay" in the panel lets you upload a mockup image and show it over the page (20% opacity by default) to check positions (`src/overlay.js`).
