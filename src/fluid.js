// The cursor's trail through the background liquid: every few frames the
// cursor drops a "splat" holding where it is and how fast it's moving. The
// background shader pushes the noise along each splat's motion; splats drift
// on a little way and fade, so the liquid keeps sliding after the cursor stops.
export function createFluidTrail(splats) {
  let next = 0;
  let last = null;
  let sinceDrop = 0;
  return {
    // x, y in CSS pixels from the bottom left; `inside` is false when the
    // cursor has left the window.
    update(dt, x, y, inside) {
      const fade = Math.exp(-dt * 1.4);
      for (const s of splats) {
        s.x += s.z * dt * 0.25;
        s.y += s.w * dt * 0.25;
        s.z *= fade;
        s.w *= fade;
      }
      if (!inside || dt <= 0) {
        last = null;
        return;
      }
      sinceDrop += dt;
      if (last && sinceDrop > 0.045) {
        const limit = 2500;
        const vx = Math.max(-limit, Math.min(limit, (x - last.x) / sinceDrop));
        const vy = Math.max(-limit, Math.min(limit, (y - last.y) / sinceDrop));
        if (vx * vx + vy * vy > 400) {
          splats[next].set(x, y, vx, vy);
          next = (next + 1) % splats.length;
        }
      }
      if (!last || sinceDrop > 0.045) {
        last = { x, y };
        sinceDrop = 0;
      }
    },
  };
}
