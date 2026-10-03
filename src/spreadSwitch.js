// The spread picker: five dots down the left. Picking one grows the new color
// over the old one as a solid shape from the top right, while main.js spins
// the toast round. Each switch rolls a slightly different noise pattern,
// direction and speed so it never plays out quite the same twice. Hovering a
// dot bounces it and pops out its name.
import { gsap } from 'gsap';
import { bounce, popLabel } from './ui.js';

// x/y are the dot centers on the 1440px-wide mockup.
export const flavors = [
  { name: 'Love', color: '#ff71c3', x: 154, y: 294 },
  { name: 'Joy', color: '#ff9c41', x: 196, y: 350.5 },
  { name: 'Good Vibes', color: '#41ff70', x: 236, y: 407 },
  { name: 'Chill', color: '#41e2ff', x: 249, y: 476 },
  // The toast's own purple, so it starts out picked.
  { name: 'Friendship', color: '#a75bd1', x: 261, y: 544.5 },
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

function roll(dissolve, variation) {
  // Top right to bottom left, give or take up to 25°.
  const angle = Math.PI * 1.25 + vary(0, 0.44, variation);
  dissolve.uDissolveDir.value.set(Math.cos(angle), Math.sin(angle));
  dissolve.uDissolveSeed.value.set(between(0, 100), between(0, 100));
  dissolve.uDissolveNoise.value.set(vary(2.5, 1.2, variation), vary(0.35, 0.2, variation));
}

export function createSpreadSwitch({ dissolve, getColor, setColor, keepOldColor, getTiming, onSwitch }) {
  let busy = false;
  let queued = null;
  let running = null; // the switch's tween while it plays

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
  // The picked dot isn't drawn differently; only screen readers hear it.
  function press(button, pressed) {
    button.setAttribute('aria-pressed', String(pressed));
  }

  function sync() {
    const current = getColor().toLowerCase();
    buttons.forEach((b, i) => press(b, flavors[i].color === current));
  }
  sync();

  function switchTo(i) {
    if (flavors[i].color === getColor().toLowerCase() && !busy) return;
    if (busy) {
      // Picking again mid-switch: the running one hurries to its end (in about
      // a tenth of a second) and the latest pick plays straight after.
      queued = i;
      buttons.forEach((b, j) => press(b, j === i));
      const left = running.duration() - running.time();
      running.timeScale(Math.max(running.timeScale(), left / 0.12));
      return;
    }
    busy = true;
    buttons.forEach((b, j) => press(b, j === i));

    const { seconds, variation, easing } = getTiming();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // The old color stays on the spread until the new shape covers it.
    roll(dissolve, variation);
    keepOldColor();
    setColor(flavors[i].color);

    const duration = vary(seconds, seconds * 0.2, variation) * (reduceMotion ? 0.4 : 1);
    onSwitch?.(duration);
    const progress = { value: 0 };
    dissolve.uSwitch.value.set(0, 1);
    running = gsap.to(progress, {
      value: 1,
      duration,
      ease: easings[easing] ?? 'power2.out',
      onUpdate: () => dissolve.uSwitch.value.set(progress.value, 1),
      onComplete() {
        dissolve.uSwitch.value.set(0, 0);
        busy = false;
        if (queued === null) return sync();
        const next = queued;
        queued = null;
        switchTo(next);
      },
    });
  }

  return { switchTo, sync };
}
