// Springy UI: hover bounces, the flavor labels and the NEXT button.
// GSAP drives these; it tweens CSS custom properties (--s for scale, --lift
// for how far a button rises off the page) that the CSS in index.html turns
// into the actual transform and shadow, so the layout itself stays in CSS.
import { gsap } from 'gsap';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const phone = window.matchMedia('(max-width: 700px)');

// Hover grows the element with an elastic overshoot, pressing squashes it a
// little and letting go springs it back.
export function bounce(el, { grow = 1.2, onHover, onLeave } = {}) {
  gsap.set(el, { '--s': 1, '--lift': 0 });
  let hovered = false;
  const to = (vars) => gsap.to(el, { overwrite: 'auto', ...vars });
  const springy = () => (reducedMotion.matches ? 'power2.out' : 'elastic.out(1.1, 0.35)');

  function enter() {
    if (hovered) return;
    hovered = true;
    to({ '--s': grow, '--lift': 1, duration: 0.9, ease: springy() });
    onHover?.();
  }
  function leave() {
    if (!hovered) return;
    hovered = false;
    to({ '--s': 1, '--lift': 0, duration: 0.7, ease: reducedMotion.matches ? 'power2.out' : 'elastic.out(1, 0.45)' });
    onLeave?.();
  }

  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('focus', enter);
  el.addEventListener('blur', leave);
  el.addEventListener('pointerdown', () => to({ '--s': grow * 0.88, duration: 0.12, ease: 'power2.out' }));
  el.addEventListener('pointerup', () => to({ '--s': hovered ? grow : 1, duration: 0.8, ease: springy() }));
  return { enter, leave };
}

// A speech-bubble label that pops out next to its button.
export function popLabel(label) {
  const pill = label.firstElementChild;
  gsap.set(pill, { autoAlpha: 0 });
  return {
    show() {
      const fromSide = !phone.matches;
      gsap.fromTo(
        pill,
        { autoAlpha: 0, scale: 0.4, x: fromSide ? -10 : 0, y: fromSide ? 0 : 8, rotation: fromSide ? -8 : 0 },
        {
          autoAlpha: 1,
          scale: 1,
          x: 0,
          y: 0,
          rotation: 0,
          transformOrigin: fromSide ? '0% 50%' : '50% 100%',
          duration: reducedMotion.matches ? 0.2 : 0.6,
          ease: reducedMotion.matches ? 'power2.out' : 'elastic.out(1, 0.5)',
          overwrite: 'auto',
        },
      );
    },
    hide() {
      gsap.to(pill, {
        autoAlpha: 0,
        scale: 0.7,
        x: phone.matches ? 0 : -6,
        duration: 0.18,
        ease: 'power2.in',
        overwrite: 'auto',
      });
    },
  };
}

// The NEXT button: a big pink circle tucked into the bottom right corner. The
// circle itself is drawn by the canvas (so it sits under the frame, with the
// same wobbly ink line); this button is the clickable part and holds the word.
// Sizes are from the 1440x800 mockup, measured from the bottom right corner.
const mockup = { right: 138, bottom: 136, radius: 195 };

export function createNextButton({ onClick } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'next';
  button.innerHTML = '<span class="next__word" aria-hidden="true">Next</span>';
  button.setAttribute('aria-label', 'Next');
  document.body.append(button);
  bounce(button, { grow: 1.07 });
  button.addEventListener('click', () => onClick?.());

  // Center and radius in CSS pixels (y from the top).
  const shape = { x: 0, y: 0, radius: 0 };
  function layout(width, height) {
    if (phone.matches) {
      shape.radius = 84;
      shape.x = width - 26;
      shape.y = height - 26;
    } else {
      const k = width / 1440;
      shape.radius = mockup.radius * k;
      shape.x = width - mockup.right * k;
      shape.y = height - mockup.bottom * k;
    }
    button.style.left = `${shape.x - shape.radius}px`;
    button.style.top = `${shape.y - shape.radius}px`;
    button.style.width = button.style.height = `${shape.radius * 2}px`;
  }

  return {
    element: button,
    layout,
    // Radius right now, including the hover bounce.
    current() {
      const s = Number(gsap.getProperty(button, '--s')) || 1;
      return { x: shape.x, y: shape.y, radius: shape.radius * s };
    },
  };
}
