// The spread picker: five dots down the left. Picking one swaps the spread
// color with two shapes at once: the old color shrinks away toward the bottom
// left while the new one grows in from the top right, after an optional delay.
// Each switch rolls a slightly different noise pattern, direction and speed so
// it never plays out quite the same twice. Hovering a dot bounces it and pops
// out its name.
import { gsap } from 'gsap';
import { bounce, popLabel } from './ui.js';

// x/y are the dot centers on the 1440px-wide mockup.
export const flavors = [
  { name: 'Love', color: '#f2434b', x: 220, y: 279 }, // strawberry red
  { name: 'Joy', color: '#ffd23f', x: 235, y: 339 }, // yellow
  { name: 'Calm', color: '#8ccdf5', x: 250.5, y: 399 }, // soft sky blue
  { name: 'Growth', color: '#a6d96a', x: 235, y: 459 }, // pistachio green
  { name: 'Friendship', color: '#e4447f', x: 219.5, y: 519 }, // raspberry pink
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

// `variation` (0..1) sets how far each roll strays from the middle values.
const vary = (mid, spread, variation) => mid + between(-spread, spread) * variation;

// `layer` is 0 for the old color going out, 1 for the new one coming in.
function roll(dissolve, variation, layer) {
  const key = layer === 0 ? ['x', 'y'] : ['z', 'w'];
  const set = (v, a, b) => {
    v[key[0]] = a;
    v[key[1]] = b;
  };
  // Top right to bottom left, give or take up to 25°.
  const angle = Math.PI * 1.25 + vary(0, 0.44, variation);
  set(dissolve.uDissolveDir.value, Math.cos(angle), Math.sin(angle));
  set(dissolve.uDissolveSeed.value, between(0, 100), between(0, 100));
  set(dissolve.uDissolveNoise.value, vary(2.5, 1.2, variation), vary(0.35, 0.2, variation));
}

export function createSpreadSwitch({ dissolve, getColor, setColor, keepOldColor, getTiming }) {
  let busy = false;
  let queued = null;

  const list = document.querySelector('.flavors');
  const buttons = flavors.map((flavor, i) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flavor';
    button.setAttribute('aria-label', flavor.name);
    item.style.setProperty('--x', flavor.x);
    item.style.setProperty('--y', flavor.y);
    item.style.setProperty('--i', i);
    button.style.setProperty('--color', flavor.color);
    button.innerHTML = '<span class="flavor__dot"></span>';
    button.addEventListener('click', () => switchTo(i));

    const label = document.createElement('span');
    label.className = 'flavor-label';
    label.setAttribute('aria-hidden', 'true');
    label.innerHTML =
      '<span class="flavor-label__pill"><span class="flavor-label__bubble"></span><span class="flavor-label__text"></span></span>';
    label.querySelector('.flavor-label__text').textContent = flavor.name;
    const pop = popLabel(label);
    bounce(button, { grow: 1.2, onHover: pop.show, onLeave: pop.hide });

    item.append(button, label);
    list?.append(item);
    return button;
  });

  // The picked dot sits pressed into the page.
  function press(button, pressed) {
    if (button.getAttribute('aria-pressed') === String(pressed)) return;
    button.setAttribute('aria-pressed', String(pressed));
    gsap.to(button, { '--press': pressed ? 1 : 0, duration: 0.25, ease: 'power2.out' });
  }
  buttons.forEach((b) => gsap.set(b, { '--press': 0 }));

  function sync() {
    const current = getColor().toLowerCase();
    buttons.forEach((b, i) => press(b, flavors[i].color === current));
  }
  sync();

  function switchTo(i) {
    if (flavors[i].color === getColor().toLowerCase() && !busy) return;
    if (busy) {
      queued = i; // play the latest pick once this switch finishes
      return;
    }
    busy = true;
    buttons.forEach((b, j) => press(b, j === i));

    const { outSeconds, gapSeconds, inSeconds, variation, outEasing, inEasing } = getTiming();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reduceMotion ? 0.4 : 1;
    const outEase = outEasing === 'Random' ? pick(outEasings) : outEasing;
    const inEase = inEasing === 'Random' ? pick(inEasings) : inEasing;

    // The old color is kept for the shape that shrinks away, and the new
    // color goes straight onto the spread for the shape that grows in.
    roll(dissolve, variation, 0);
    roll(dissolve, variation, 1);
    keepOldColor();
    setColor(flavors[i].color);

    const progress = { out: 0, in: 0 };
    const show = () => dissolve.uSwitch.value.set(progress.out, progress.in, 1);
    show();
    gsap
      .timeline({
        onUpdate: show,
        onComplete() {
          dissolve.uSwitch.value.set(0, 0, 0);
          busy = false;
          sync();
          if (queued !== null) {
            const next = queued;
            queued = null;
            switchTo(next);
          }
        },
      })
      // Both start together; "In delay" holds the new color back.
      .to(progress, { out: 1, duration: vary(outSeconds, outSeconds * 0.2, variation) * speed, ease: easings[outEase] }, 0)
      .to(progress, { in: 1, duration: vary(inSeconds, inSeconds * 0.2, variation) * speed, ease: easings[inEase] }, gapSeconds * speed);
  }

  // Next flavor in the list, for the console helper.
  function switchSpread() {
    const i = flavors.findIndex((f) => f.color === getColor().toLowerCase());
    return switchTo((i + 1) % flavors.length);
  }

  return { switchTo, switchSpread, sync };
}
