/*
 * CubeSat that drifts toward the cursor.
 *
 * Position follows a damped spring toward the cursor (clamped to the sky
 * above the Earth's limb), so it lags and overshoots a little like it's
 * floating. It banks into its horizontal velocity and leaves a faint
 * dotted trail. With no cursor movement it drifts on a slow orbit.
 */
(() => {
  "use strict";

  const scene = document.getElementById("sat-scene");
  const sat = document.getElementById("sat");
  const trailEl = document.getElementById("sat-trail");
  if (!scene || !sat) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const BOUNDS = { x0: 85, x1: 235, y0: 70, y1: 185 };
  // ω ≈ 0.006 rad/ms (~1 s period), damping ratio ≈ 0.6: floaty, slight overshoot
  const STIFFNESS = 0.000036; // spring pull per ms²
  const DAMPING = 0.0072;     // velocity damping per ms
  const TRAIL_LEN = 46;

  const pos = { x: 160, y: 130 };
  const vel = { x: 0, y: 0 };
  const goal = { x: 160, y: 130 };
  let rot = 0;
  let lastPointer = -Infinity;
  let visible = false;
  let last = 0;
  const trail = [];

  function toScene(clientX, clientY) {
    const m = scene.getScreenCTM();
    if (!m) return null;
    return new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  }

  window.addEventListener("pointermove", (e) => {
    if (!visible) return;
    const p = toScene(e.clientX, e.clientY);
    if (!p) return;
    goal.x = clamp(p.x, BOUNDS.x0, BOUNDS.x1);
    goal.y = clamp(p.y, BOUNDS.y0, BOUNDS.y1);
    lastPointer = performance.now();
  }, { passive: true });

  function render(now) {
    const bob = reduceMotion ? 0 : Math.sin(now / 900) * 2.5;
    sat.setAttribute("transform", `translate(${pos.x.toFixed(2)} ${(pos.y + bob).toFixed(2)}) rotate(${rot.toFixed(2)}) scale(0.95)`);

    trail.push(`${pos.x.toFixed(1)} ${(pos.y + bob).toFixed(1)}`);
    if (trail.length > TRAIL_LEN) trail.shift();
    trailEl.setAttribute("d", trail.length > 1 ? "M " + trail.join(" L ") : "");
  }

  function tick(now) {
    const dt = last ? Math.min(48, now - last) : 16;
    last = now;
    if (visible) {
      if (!reduceMotion && now - lastPointer > 2500) {
        // idle: slow elliptical drift
        const t = now / 1000;
        goal.x = 160 + 62 * Math.cos(t * 0.45);
        goal.y = 128 + 32 * Math.sin(t * 0.45);
      }
      if (reduceMotion) {
        pos.x = goal.x; pos.y = goal.y;
      } else {
        // semi-implicit Euler on a damped spring
        vel.x += ((goal.x - pos.x) * STIFFNESS - vel.x * DAMPING) * dt;
        vel.y += ((goal.y - pos.y) * STIFFNESS - vel.y * DAMPING) * dt;
        pos.x += vel.x * dt;
        pos.y += vel.y * dt;
      }
      // bank into horizontal motion, plus a gentle idle sway
      const sway = reduceMotion ? 0 : Math.sin(now / 1700) * 4;
      const rotTarget = clamp(vel.x * 50, -26, 26) + sway;
      rot += (rotTarget - rot) * (1 - Math.exp(-dt / 180));
      render(now);
    }
    requestAnimationFrame(tick);
  }

  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(scene);
  render(0);
  requestAnimationFrame(tick);
})();
