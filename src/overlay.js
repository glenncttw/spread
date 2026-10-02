// Layout check: upload a mockup and see it over the page at low opacity.
// The image is stretched to the window, so a 1440x800 mockup lines up exactly
// when the window is 1440x800. It's remembered in this browser between visits.

const STORAGE_KEY = 'spread.layoutOverlay';

export function createOverlay() {
  const img = document.createElement('img');
  img.className = 'layout-overlay';
  img.alt = '';
  img.hidden = true;
  document.body.append(img);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  document.body.append(input);

  const state = { show: false, opacity: 0.2 };
  let hasImage = false;
  let onLoaded = () => {};

  function render() {
    img.hidden = !(state.show && hasImage);
    img.style.opacity = state.opacity;
  }

  function setSource(src) {
    img.src = src;
    hasImage = true;
    state.show = true;
    render();
    onLoaded();
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      img.src = saved;
      hasImage = true;
    }
  } catch {
    // Storage blocked (private window etc.): the overlay just isn't remembered.
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSource(reader.result);
      try {
        localStorage.setItem(STORAGE_KEY, reader.result);
      } catch {
        // Too big to remember, or storage blocked. It still works for this visit.
      }
    };
    reader.readAsDataURL(file);
    input.value = '';
  });

  render();
  return {
    state,
    render,
    setSource,
    upload: () => input.click(),
    onLoaded: (fn) => (onLoaded = fn),
  };
}
