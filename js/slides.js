/*
 * Slideshow for the "tinkering" section.
 * Builds its dots and counter from however many <li class="slide"> exist,
 * and supports buttons, dots, arrow keys, and swipe. The active slide's
 * caption writes itself in, pencil-style.
 */
(() => {
  "use strict";

  const root = document.getElementById("slideshow");
  if (!root) return;

  const track = root.querySelector(".slides");
  const viewport = root.querySelector(".slides-viewport");
  const slides = Array.from(root.querySelectorAll(".slide"));
  const dotsEl = root.querySelector(".dots");
  const countEl = root.querySelector(".slide-count");
  const prevBtn = root.querySelector(".prev");
  const nextBtn = root.querySelector(".next");
  const n = slides.length;
  const pad = (v) => String(v).padStart(2, "0");
  let i = 0;

  const dots = slides.map((_, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dot";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", `Slide ${k + 1} of ${n}`);
    b.addEventListener("click", () => go(k));
    dotsEl.appendChild(b);
    return b;
  });

  function go(k) {
    i = (k + n) % n;
    track.style.transform = `translateX(${-i * 100}%)`;
    slides.forEach((s, j) => {
      const active = j === i;
      s.classList.toggle("active", active);
      s.setAttribute("aria-hidden", String(!active));
      s.inert = !active;
    });
    dots.forEach((d, j) => d.setAttribute("aria-selected", String(j === i)));
    countEl.textContent = `${pad(i + 1)} / ${pad(n)}`;
    const single = n < 2;
    prevBtn.hidden = nextBtn.hidden = dotsEl.hidden = single;
  }

  prevBtn.addEventListener("click", () => go(i - 1));
  nextBtn.addEventListener("click", () => go(i + 1));

  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
  });

  // swipe / drag
  let sx = null, sy = null;
  viewport.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
  viewport.addEventListener("pointerup", (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? i + 1 : i - 1);
  });
  viewport.addEventListener("pointercancel", () => { sx = sy = null; });

  go(0);
})();
