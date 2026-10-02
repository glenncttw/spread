// Loading screen: a pink page with "Loading..." and a progress bar (the
// markup is in index.html so it shows before any script runs). Once the toast
// is ready, the words pop away and the pink lifts off the editor like a
// curtain, its bottom edge rippling in a wave with an ink line along it.
import { gsap } from 'gsap';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export function createLoader() {
  const screen = document.querySelector('.loader');
  const fill = screen?.querySelector('.loader__fill');
  const content = screen?.querySelector('.loader__content');
  const svg = screen?.querySelector('.loader__wave');
  const curtain = svg?.querySelector('.loader__curtain');
  const edge = svg?.querySelector('.loader__edge');
  if (!screen) return { progress() {}, ready() {} };

  const shown = { value: 0 }; // what the bar shows, eased toward the real progress
  const startedAt = performance.now();
  let target = 0;
  let finished = false;

  function progress(fraction) {
    target = Math.max(target, Math.min(fraction, 1) * 0.9); // the last 10% is "ready"
    gsap.to(shown, {
      value: target,
      duration: 0.5,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: () => (fill.style.transform = `scaleX(${shown.value})`),
    });
  }

  // The wave: `lift` runs 0..1 as the curtain rises off the screen. The
  // ripple is biggest halfway, so it starts and ends flat.
  const wave = { lift: 0 };
  function drawWave() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const amp = Math.sin(Math.PI * wave.lift) * Math.min(h * 0.12, 110);
    const base = (h + amp * 1.2) * (1 - wave.lift) - amp * 0.2;
    const phase = wave.lift * Math.PI * 2.5;
    const points = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const t = i / steps;
      // One broad swell (the middle lags a little behind the sides) plus a
      // smaller ripple travelling across.
      const y = base + amp * (0.7 * Math.sin(Math.PI * t) + 0.3 * Math.sin(t * Math.PI * 5 + phase));
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    curtain.setAttribute('d', `M0,-10 L${w},-10 L${points.reverse().join(' L')} Z`);
    edge.setAttribute('d', `M${points.reverse().join(' L')}`);
  }

  // `onReveal` runs as the curtain starts to lift.
  function ready(onReveal) {
    if (finished) return;
    finished = true;
    screen.style.background = 'none'; // the SVG curtain takes over from here
    // Show the loader for at least a moment so it doesn't just flash.
    const wait = Math.max(0, 0.6 - (performance.now() - startedAt) / 1000);
    const quick = reducedMotion.matches;
    drawWave();
    gsap
      .timeline({ delay: wait, onComplete: () => screen.remove() })
      .to(shown, {
        value: 1,
        duration: 0.35,
        ease: 'power2.out',
        overwrite: true,
        onUpdate: () => (fill.style.transform = `scaleX(${shown.value})`),
      })
      .to(content, { autoAlpha: 0, scale: 0.85, y: -10, duration: 0.3, ease: 'back.in(2)' }, '+=0.15')
      .add(() => onReveal?.(), '-=0.05')
      .to(wave, { lift: 1, duration: quick ? 0.4 : 1.3, ease: 'power3.inOut', onUpdate: drawWave }, '<');
  }

  window.addEventListener('resize', () => !finished || drawWave());
  return { progress, ready };
}
