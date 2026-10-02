// The spread picker: five dots down the left. Picking one shrinks the
// current spread away toward the bottom left as a solid shape, and once it is
// gone the new flavor grows in from the top right. Each switch rolls a
// slightly different noise pattern, direction, speed and easing so it never
// plays out quite the same twice.

// x/y are the dot centers on the 1440px-wide mockup.
export const flavors = [
  { name: 'Strawberry', color: '#f74b4b', x: 220, y: 279 },
  { name: 'Grape', color: '#df4bf7', x: 235, y: 339 },
  { name: 'Mint', color: '#2ff4b1', x: 250.5, y: 399, swatch: 'linear-gradient(160deg, #4ef27a, #1ef0ee)' },
  { name: 'Chocolate', color: '#52311a', x: 235, y: 459 },
  { name: 'Blueberry', color: '#8793ff', x: 219.5, y: 519 },
];

// Easing curves to pick from in the panel ("Spread switch").
export const easings = {
  Linear: (t) => t,
  'In sine': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'In cubic': (t) => t * t * t,
  'In back': (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  'Out sine': (t) => Math.sin((t * Math.PI) / 2),
  'Out cubic': (t) => 1 - (1 - t) ** 3,
  'Out quart': (t) => 1 - (1 - t) ** 4,
  'Out back': (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
  'Out elastic': (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  'In-out sine': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  'In-out cubic': (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  'In-out quint': (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),
  'In-out expo': (t) => (t === 0 || t === 1 ? t : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
};
// "Random" picks one of these each time.
const outEasings = ['In-out cubic', 'In-out quint', 'In-out sine'];
const inEasings = ['Out cubic', 'Out back', 'Out quart'];
export const easingChoices = ['Random', ...Object.keys(easings)];

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
  let busy = false;
  let queued = null;

  const list = document.querySelector('.flavors');
  const buttons = flavors.map((flavor, i) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flavor';
    button.setAttribute('aria-label', flavor.name);
    button.title = flavor.name;
    button.style.setProperty('--x', flavor.x);
    button.style.setProperty('--y', flavor.y);
    button.style.setProperty('--i', i);
    button.style.setProperty('--color', flavor.swatch ?? flavor.color);
    button.addEventListener('click', () => switchTo(i));
    item.append(button);
    list?.append(item);
    return button;
  });

  function sync() {
    const current = getColor().toLowerCase();
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(flavors[i].color === current)));
  }
  sync();

  async function switchTo(i) {
    if (flavors[i].color === getColor().toLowerCase() && !busy) return;
    if (busy) {
      queued = i; // play the latest pick once this switch finishes
      return;
    }
    busy = true;
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));

    const { outSeconds, gapSeconds, inSeconds, variation, outEasing, inEasing } = getTiming();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reduceMotion ? 0.4 : 1;
    const p = dissolve.uDissolve.value;

    roll(dissolve, variation);
    p.set(0, 0);
    const outEase = outEasing === 'Random' ? pick(outEasings) : outEasing;
    await tween(vary(outSeconds, outSeconds * 0.2, variation) * 1000 * speed, easings[outEase], (t) => p.set(t, 0));

    setColor(flavors[i].color);
    await wait(gapSeconds * 1000 * speed);

    roll(dissolve, variation);
    p.set(0, 1);
    const inEase = inEasing === 'Random' ? pick(inEasings) : inEasing;
    await tween(vary(inSeconds, inSeconds * 0.2, variation) * 1000 * speed, easings[inEase], (t) => p.set(t, 1));
    p.set(0, 0);

    busy = false;
    sync();
    if (queued !== null) {
      const next = queued;
      queued = null;
      switchTo(next);
    }
  }

  // Next flavor in the list, for the console helper.
  function switchSpread() {
    const i = flavors.findIndex((f) => f.color === getColor().toLowerCase());
    return switchTo((i + 1) % flavors.length);
  }

  return { switchTo, switchSpread, sync };
}
