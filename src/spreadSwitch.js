// The "switch spread" button: the current spread shrinks away toward the
// bottom left as a solid shape, and once it is gone the next flavor grows in
// from the top right. Each
// switch rolls a slightly different noise pattern, direction, speed and easing
// so it never plays out quite the same twice.

export const flavors = [
  { name: 'Blueberry', color: '#a75bd1' },
  { name: 'Strawberry', color: '#e5485f' },
  { name: 'Apricot', color: '#f39a2b' },
  { name: 'Pistachio', color: '#8cc063' },
  { name: 'Hazelnut', color: '#8a4b2d' },
  { name: 'Blue raspberry', color: '#3f7fe0' },
];

const easings = {
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outCubic: (t) => 1 - (1 - t) ** 3,
  outBack: (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
  outQuart: (t) => 1 - (1 - t) ** 4,
};
const outEasings = ['inOutCubic', 'inOutQuint', 'inOutSine'];
const inEasings = ['outCubic', 'outBack', 'outQuart'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (a, b) => a + Math.random() * (b - a);

function tween(duration, easing, onUpdate) {
  return new Promise((resolve) => {
    const start = performance.now();
    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      onUpdate(easing(t));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `variation` (0..1) sets how far each roll strays from the middle values.
const vary = (mid, spread, variation) => mid + between(-spread, spread) * variation;

function roll(dissolve, variation) {
  // Top right to bottom left, give or take up to 25°.
  const angle = Math.PI * 1.25 + vary(0, 0.44, variation);
  dissolve.uDissolveDir.value.set(Math.cos(angle), Math.sin(angle));
  dissolve.uDissolveSeed.value.set(between(0, 100), between(0, 100));
  dissolve.uDissolveNoise.value.set(vary(2.5, 1.2, variation), vary(0.35, 0.2, variation));
}

export function createSpreadSwitch({ dissolve, getColor, setColor, getTiming }) {
  let index = Math.max(0, flavors.findIndex((f) => f.color === getColor()));
  let busy = false;

  const button = document.createElement('button');
  button.className = 'spread-switch';
  button.type = 'button';
  const swatch = document.createElement('span');
  swatch.className = 'spread-switch__swatch';
  const label = document.createElement('span');
  button.append(swatch, label);
  document.body.appendChild(button);

  function showNext() {
    const next = flavors[(index + 1) % flavors.length];
    swatch.style.background = next.color;
    label.textContent = `Switch to ${next.name.toLowerCase()}`;
  }
  showNext();

  async function switchSpread() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    index = (index + 1) % flavors.length;

    const { outSeconds, gapSeconds, inSeconds, variation } = getTiming();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reduceMotion ? 0.4 : 1;
    const p = dissolve.uDissolve.value;

    roll(dissolve, variation);
    p.set(0, 0);
    const outEase = variation > 0 ? pick(outEasings) : 'inOutCubic';
    await tween(vary(outSeconds, outSeconds * 0.2, variation) * 1000 * speed, easings[outEase], (t) => p.set(t, 0));

    setColor(flavors[index].color);
    await wait(gapSeconds * 1000 * speed);

    roll(dissolve, variation);
    p.set(0, 1);
    const inEase = variation > 0 ? pick(inEasings) : 'outCubic';
    await tween(vary(inSeconds, inSeconds * 0.2, variation) * 1000 * speed, easings[inEase], (t) => p.set(t, 1));
    p.set(0, 0);

    showNext();
    busy = false;
    button.disabled = false;
  }

  button.addEventListener('click', switchSpread);
  return { button, switchSpread, sync: () => {
    const i = flavors.findIndex((f) => f.color === getColor());
    if (i >= 0) index = i;
    showNext();
  } };
}
