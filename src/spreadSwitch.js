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
  { name: 'Love', color: '#dd3336', x: 220, y: 279 },
  { name: 'Joy', color: '#fabe4c', x: 235, y: 339 },
  { name: 'Calm', color: '#33c3dd', x: 250.5, y: 399 },
  { name: 'Growth', color: '#9cdd33', x: 235, y: 459 },
  { name: 'Friendship', color: '#ff71c3', x: 219.5, y: 519 },
];

// Easing curves to pick from in the panel ("Spread switch"), as GSAP eases.
export const easings = {
  Linear: 'none',
  'In sine': 'sine.in',
  'In cubic': 'power2.in',
  'In back': 'back.in',
  'Out sine': 'sine.out',
  'Out cubic': 'power2.out',
  'Out quart': 'power3.out',
  'Out back': 'back.out',
  'Out elastic': 'elastic.out',
  'In-out sine': 'sine.inOut',
  'In-out cubic': 'power2.inOut',
  'In-out quint': 'power4.inOut',
  'In-out expo': 'expo.inOut',
};

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
      .to(progress, { out: 1, duration: vary(outSeconds, outSeconds * 0.2, variation) * speed, ease: easings[outEasing] ?? 'power2.out' }, 0)
      .to(progress, { in: 1, duration: vary(inSeconds, inSeconds * 0.2, variation) * speed, ease: easings[inEasing] ?? 'power2.out' }, gapSeconds * speed);
  }

  return { switchTo, sync };
}
