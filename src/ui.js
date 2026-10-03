// Springy UI: hover bounces, the flavor labels and the NEXT button.
// GSAP drives these. It tweens the --s custom property (hover size), which
// the CSS in index.html turns into the actual size, so the layout stays in CSS.
import { gsap } from 'gsap';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const phone = window.matchMedia('(max-width: 700px)');

// Hover grows the element with one springy overshoot and settles back the
// same way. The listeners go on a hit area that doesn't change size, so the
// growing dot can't slip out from under the cursor and retrigger itself.
// Keyboard focus counts as hover; a mouse click's focus doesn't.
export function bounce(el, { grow = 1.2, onHover, onLeave } = {}) {
  gsap.set(el, { '--s': 1 });
  let pointer = false;
  let keyboard = false;
  let shown = false;

  function update() {
    const on = pointer || keyboard;
    if (on === shown) return;
    shown = on;
    gsap.to(el, {
      '--s': on ? grow : 1,
      duration: reducedMotion.matches ? 0.15 : 0.5,
      ease: reducedMotion.matches ? 'power1.out' : 'back.out(3)',
      overwrite: 'auto',
    });
    (on ? onHover : onLeave)?.();
  }

  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return; // touch has no hover
    pointer = true;
    update();
  });
  el.addEventListener('pointerleave', () => {
    pointer = false;
    update();
  });
  el.addEventListener('focus', () => {
    keyboard = el.matches(':focus-visible');
    update();
  });
  el.addEventListener('blur', () => {
    keyboard = false;
    update();
  });
}

// A speech-bubble label that pops (and swings) out next to its button.
export function popLabel(label) {
  const pill = label.firstElementChild;
  gsap.set(pill, { autoAlpha: 0 });
  return {
    show() {
      const side = !phone.matches;
      gsap.fromTo(
        pill,
        // Beside the dot it also swings in, pivoting on its left end.
        { autoAlpha: 0, scale: 0.6, x: side ? -8 : 0, y: side ? 0 : 6, rotation: side ? -35 : 0 },
        {
          autoAlpha: 1,
          scale: 1,
          x: 0,
          y: 0,
          rotation: 0,
          transformOrigin: side ? '0% 50%' : '50% 100%',
          duration: reducedMotion.matches ? 0.15 : 0.4,
          ease: reducedMotion.matches ? 'power1.out' : 'back.out(2.5)',
          overwrite: true,
        },
      );
    },
    hide() {
      gsap.to(pill, { autoAlpha: 0, duration: 0.15, ease: 'power1.in', overwrite: true });
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
  button.innerHTML = '<span class="next__ink" aria-hidden="true"><span class="next__word">Next</span></span>';
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
    // Radius right now, including the hover bounce and the entrance (--in).
    current() {
      const s = Number(gsap.getProperty(button, '--s')) || 1;
      const entrance = parseFloat(gsap.getProperty(button, '--in'));
      return { x: shape.x, y: shape.y, radius: shape.radius * s * (Number.isNaN(entrance) ? 1 : entrance) };
    },
  };
}
