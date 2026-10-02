// The "switch spread" button: the current spread dissolves away from the top
// right, and once it is gone the next flavor dissolves in the same way. Each
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
  inBack: (t) => 2.2 * t ** 3 - 1.2 * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  outBack: (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
  outQuart: (t) => 1 - (1 - t) ** 4,
};
const outEasings = ['inOutCubic', 'inOutQuint', 'inBack'];
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

function roll(dissolve) {
  // Roughly top right to bottom left, give or take 20°.
  const angle = Math.PI * 1.25 + between(-0.35, 0.35);
  dissolve.uDissolveDir.value.set(Math.cos(angle), Math.sin(angle));
  dissolve.uDissolveSeed.value.set(between(0, 100), between(0, 100));
  dissolve.uDissolveNoise.value.set(between(1.5, 4), between(0.15, 0.45));
}

export function createSpreadSwitch({ dissolve, getColor, setColor }) {
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

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reduceMotion ? 0.4 : 1;
    const p = dissolve.uDissolve.value;

    roll(dissolve);
    p.set(0, 0);
    await tween(between(750, 1100) * speed, easings[pick(outEasings)], (t) => p.set(t, 0));

    setColor(flavors[index].color);
    await wait(between(120, 260) * speed);

    roll(dissolve);
    p.set(0, 1);
    await tween(between(850, 1250) * speed, easings[pick(inEasings)], (t) => p.set(t, 1));
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
