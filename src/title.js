// The big title's entrances: each letter springs up out of the baseline like
// jelly (squashed flat, overshooting tall and thin, then wobbling to rest),
// one after the other. The motion runs on CSS custom properties that the
// letter's transform in index.html reads, so the hand-placed lean stays.
import { gsap } from 'gsap';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hidden = { '--ty': 0.35, '--sx': 1.5, '--sy': 0, '--tr': 0 };

function letters(line) {
  return [...line.children];
}

// Hide the letters until their entrance plays.
export function hideTitle(lines) {
  for (const line of lines) gsap.set(letters(line), hidden);
}

export function popIn(line, { delay = 0 } = {}) {
  const quick = reducedMotion.matches;
  return gsap.fromTo(
    letters(line),
    { ...hidden, '--tr': () => gsap.utils.random(-25, 25) },
    {
      '--ty': 0,
      '--sx': 1,
      '--sy': 1,
      '--tr': 0,
      delay,
      duration: quick ? 0.3 : 1.1,
      ease: quick ? 'power2.out' : 'elastic.out(1, 0.42)',
      stagger: quick ? 0 : 0.065,
      overwrite: true,
    },
  );
}

export function popOut(line) {
  return gsap.to(letters(line), {
    '--ty': 0.25,
    '--sx': 1.4,
    '--sy': 0,
    duration: reducedMotion.matches ? 0.15 : 0.32,
    ease: 'back.in(2.2)',
    stagger: { each: 0.035, from: 'end' },
    overwrite: true,
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
