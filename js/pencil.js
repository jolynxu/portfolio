/*
 * Pencil writes the name.
 *
 * The whole performance is precomputed as one timeline of segments
 * (hop → trace contour → hop → trace … → set down), driven by a single
 * requestAnimationFrame loop, so there are no stalls between strokes.
 * Tracing uses a trapezoidal velocity profile (accelerate, cruise,
 * decelerate), like a motion planner would. The pencil's tilt is
 * low-pass filtered and leans into its direction of travel.
 */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const svg = document.getElementById("name-svg");
  const pencil = document.getElementById("pencil");
  const shadow = document.getElementById("pencil-shadow");
  const outlines = Array.from(document.querySelectorAll("#name-strokes path.outline"));
  const glyphs = Array.from(document.querySelectorAll("#name-strokes .glyph"));
  const dimPaths = Array.from(document.querySelectorAll("#dim path"));
  const replayBtn = document.getElementById("replay");
  if (!svg || !pencil) return;

  // ── tuning ──
  const V_MAX = 2.4;        // svg units / ms, cruise speed while tracing
  const ACCEL = 0.02;       // svg units / ms², ramp up/down
  const WRITE_ANGLE = -52;  // pencil held up-and-to-the-right
  const ROT_TAU = 110;      // ms, tilt smoothing time constant
  const LEAN_GAIN = 5;      // degrees of lean per (unit/ms) of horizontal speed

  const LAYOUTS = {
    wide:   { viewBox: "0 0 900 215", rest: { x: 690, y: 160, rot: -9 } },
    narrow: { viewBox: "0 0 680 262", rest: { x: 240, y: 244, rot: -3 } },
  };
  const pickLayout = () => (window.innerWidth > 640 ? "wide" : "narrow");
  let layoutKey = pickLayout();

  dimPaths.forEach((p) => p.setAttribute("pathLength", "1"));

  // Pencil pose. x/y is the tip on the paper; lift raises it off the page.
  const pose = { x: 0, y: 0, rot: WRITE_ANGLE, lift: 0 };
  let lean = 0;

  function render() {
    const { x, y, rot, lift } = pose;
    pencil.setAttribute("transform", `translate(${x.toFixed(2)} ${(y - lift).toFixed(2)}) rotate(${rot.toFixed(2)})`);
    shadow.setAttribute(
      "transform",
      `translate(${(x + 2 + lift * 0.7).toFixed(2)} ${(y + 3 + lift * 0.35).toFixed(2)}) rotate(${rot.toFixed(2)})`
    );
    shadow.style.opacity = String(1 - clamp(lift / 70, 0, 0.6));
  }

  /* ───────── motion primitives ───────── */

  // Trapezoidal (or triangular, for short paths) velocity profile.
  function trapezoid(L, vmax, a) {
    let ta = vmax / a;
    let da = 0.5 * a * ta * ta;
    let tc = 0;
    if (2 * da >= L) {
      ta = Math.sqrt(L / a);
      da = L / 2;
      vmax = a * ta;
    } else {
      tc = (L - 2 * da) / vmax;
    }
    const T = 2 * ta + tc;
    const s = (t) => {
      if (t <= 0) return 0;
      if (t >= T) return L;
      if (t < ta) return 0.5 * a * t * t;
      if (t < ta + tc) return da + vmax * (t - ta);
      const r = T - t;
      return L - 0.5 * a * r * r;
    };
    return { T, s };
  }

  // A lifted move between two points, arcing off the paper.
  function hop(from, to, dur, { liftH = 10, rotFrom = WRITE_ANGLE, rotTo = WRITE_ANGLE, ease = easeInOutSine } = {}) {
    return {
      dur,
      eval(p) {
        const e = ease(p);
        return {
          x: lerp(from.x, to.x, e),
          y: lerp(from.y, to.y, e),
          lift: lerp(from.lift || 0, to.lift || 0, e) + Math.sin(Math.PI * p) * liftH,
          rot: lerp(rotFrom, rotTo, e),
        };
      },
    };
  }

  function trace(path) {
    const L = path.getTotalLength();
    const prof = trapezoid(L, V_MAX, ACCEL);
    return {
      dur: prof.T,
      begin() { path.style.opacity = "1"; },
      eval(p) {
        const d = prof.s(p * prof.T);
        path.style.strokeDashoffset = String(L - d);
        const pt = path.getPointAtLength(d);
        return { x: pt.x, y: pt.y, lift: 0, rot: WRITE_ANGLE };
      },
      finish() {
        path.style.strokeDashoffset = "0";
        const glyph = path.parentNode;
        if (glyph.lastElementChild === path) shadeIn(glyph);
      },
    };
  }

  function shadeIn(glyph) {
    glyph.classList.add("hatched");
    setTimeout(() => glyph.classList.add("filled"), 380);
  }

  /* ───────── timeline ───────── */

  function buildTimeline(startPose) {
    const segs = [];
    let cur = { ...startPose };
    let curRot = startPose.rot;

    outlines.forEach((path, i) => {
      const p0 = path.getPointAtLength(0);
      const dist = Math.hypot(p0.x - cur.x, p0.y - cur.y);
      const first = i === 0;
      segs.push(
        hop(cur, { x: p0.x, y: p0.y, lift: 0 },
          first ? 650 : clamp(110 + dist * 0.35, 110, 300),
          first
            ? { liftH: 6, rotFrom: curRot, ease: easeOutCubic }
            : { liftH: clamp(dist * 0.1, 4, 12) })
      );
      segs.push(trace(path));
      const L = path.getTotalLength();
      const end = path.getPointAtLength(L);
      cur = { x: end.x, y: end.y, lift: 0 };
      curRot = WRITE_ANGLE;
    });

    const rest = LAYOUTS[layoutKey].rest;
    segs.push(hop(cur, { x: rest.x, y: rest.y, lift: 0 }, 950, { liftH: 30, rotTo: rest.rot }));

    let t = 0;
    segs.forEach((s) => { s.t0 = t; t += s.dur; });
    return { segs, total: t };
  }

  /* ───────── playback ───────── */

  let rafId = 0;
  let playing = false;

  function resetDrawing() {
    outlines.forEach((path) => {
      const L = path.getTotalLength();
      path.style.strokeDasharray = `${L} ${L}`;
      path.style.strokeDashoffset = String(L);
      path.style.opacity = "0";
    });
    glyphs.forEach((g) => g.classList.remove("hatched", "filled"));
    svg.classList.remove("dimensioned");
  }

  function finishedDrawing() {
    svg.classList.add("dimensioned");
    if (!document.body.classList.contains("written")) {
      document.body.classList.add("written");
      document.dispatchEvent(new CustomEvent("name:written"));
    }
  }

  function play() {
    cancelAnimationFrame(rafId);
    playing = true;
    layoutKey = pickLayout();
    svg.setAttribute("viewBox", LAYOUTS[layoutKey].viewBox);
    resetDrawing();

    const { segs, total } = buildTimeline({ ...pose });
    const rest = LAYOUTS[layoutKey].rest;
    let idx = 0;
    let started = -1;
    let t0 = 0;
    let last = 0;
    let prevX = pose.x;
    let landed = false;

    const frame = (now) => {
      if (!t0) { t0 = now; last = now; }
      const t = now - t0;
      const dt = Math.max(1, now - last);
      last = now;

      // finish any segments we've passed (handles dropped frames)
      while (idx < segs.length && t >= segs[idx].t0 + segs[idx].dur) {
        if (started < idx) { segs[idx].begin?.(); started = idx; }
        segs[idx].finish?.();
        idx++;
      }

      let target;
      if (idx < segs.length) {
        const seg = segs[idx];
        if (started < idx) { seg.begin?.(); started = idx; }
        target = seg.eval(clamp((t - seg.t0) / seg.dur, 0, 1));
      } else {
        target = { x: rest.x, y: rest.y, lift: 0, rot: rest.rot };
        if (!landed) { landed = true; finishedDrawing(); }
      }

      pose.x = target.x;
      pose.y = target.y;
      pose.lift = target.lift;

      // lean into horizontal motion, then low-pass the tilt
      const vx = (pose.x - prevX) / dt;
      prevX = pose.x;
      const writing = idx < segs.length;
      const leanTarget = writing ? clamp(vx * LEAN_GAIN, -6, 6) : 0;
      lean += (leanTarget - lean) * (1 - Math.exp(-dt / 160));
      const sway = writing ? Math.sin(now / 420) * 1.2 : 0;
      const rotTarget = target.rot + lean + sway;
      pose.rot += (rotTarget - pose.rot) * (1 - Math.exp(-dt / ROT_TAU));

      render();

      // keep running briefly after landing so the tilt settles
      if (t < total + 700) rafId = requestAnimationFrame(frame);
      else playing = false;
    };
    rafId = requestAnimationFrame(frame);
  }

  function showFinal() {
    svg.setAttribute("viewBox", LAYOUTS[layoutKey].viewBox);
    outlines.forEach((path) => {
      path.style.strokeDasharray = "none";
      path.style.strokeDashoffset = "0";
      path.style.opacity = "1";
    });
    glyphs.forEach((g) => g.classList.add("hatched", "filled"));
    Object.assign(pose, LAYOUTS[layoutKey].rest, { lift: 0 });
    render();
    finishedDrawing();
  }

  function init() {
    svg.setAttribute("viewBox", LAYOUTS[layoutKey].viewBox);
    if (reduceMotion) return showFinal();
    const vbW = Number(LAYOUTS[layoutKey].viewBox.split(" ")[2]);
    Object.assign(pose, { x: vbW + 80, y: -120, rot: -40, lift: 40 });
    render();
    setTimeout(play, 300);
  }

  const replay = () => { if (!reduceMotion) play(); };
  svg.addEventListener("click", replay);
  replayBtn?.addEventListener("click", replay);

  window.addEventListener("resize", () => {
    const next = pickLayout();
    if (next === layoutKey || playing) return;
    layoutKey = next;
    svg.setAttribute("viewBox", LAYOUTS[layoutKey].viewBox);
    Object.assign(pose, LAYOUTS[layoutKey].rest, { lift: 0 });
    render();
  });

  init();
})();
