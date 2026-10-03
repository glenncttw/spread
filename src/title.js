// The big title's entrances: each letter springs up out of the baseline like
// jelly (squashed flat, overshooting tall and thin, then wobbling to rest),
// one after the other. The motion runs on CSS custom properties that the
// letter's transform in index.html reads, so the hand-placed lean stays.
import { gsap } from 'gsap';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
// Hidden letters are also fully transparent: a letter squashed to (nearly)
// zero height can still leave dark specks once the title's ink-outline filter
// is drawn around it, so it mustn't be drawn at all.
const shape = { '--ty': 0.35, '--sx': 1.5, '--sy': 0.02, '--tr': 0 };
const hidden = { ...shape, autoAlpha: 0 };

function letters(line) {
  return [...line.children];
}

// Hide the letters until their entrance plays.
export function hideTitle(lines) {
  for (const line of lines) gsap.set(letters(line), hidden);
}

export function popIn(line, { delay = 0 } = {}) {
  const quick = reducedMotion.matches;
  const each = quick ? 0 : 0.065;
  // Each letter becomes visible the moment its spring starts.
  gsap.to(letters(line), { autoAlpha: 1, duration: 0.01, delay, stagger: each, overwrite: 'auto' });
  return gsap.fromTo(
    letters(line),
    { ...shape, '--tr': () => gsap.utils.random(-25, 25) },
    {
      '--ty': 0,
      '--sx': 1,
      '--sy': 1,
      '--tr': 0,
      delay,
      duration: quick ? 0.3 : 1.1,
      ease: quick ? 'power2.out' : 'elastic.out(1, 0.42)',
      stagger: each,
      overwrite: 'auto',
    },
  );
}

export function popOut(line) {
  const duration = reducedMotion.matches ? 0.15 : 0.32;
  const stagger = { each: 0.035, from: 'end' };
  // Gone (transparent) right as each letter flattens out.
  gsap.to(letters(line), { autoAlpha: 0, duration, ease: 'expo.in', stagger, overwrite: 'auto' });
  return gsap.to(letters(line), {
    '--ty': 0.25,
    '--sx': 1.4,
    '--sy': 0.02,
    duration,
    ease: 'back.in(2.2)',
    stagger,
    overwrite: 'auto',
  });
}

// Replaces a title line's letters with a new word, one span per letter.
// `nudge` shifts single letters sideways (by letter index, in em) where the
// font's spacing needs a hand.
export function setWord(line, word, nudge = {}) {
  line.replaceChildren(
    ...[...word].map((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch;
      if (nudge[i]) span.style.setProperty('--kx', nudge[i]);
      return span;
    }),
  );
  gsap.set(letters(line), hidden);
}
