/*
 * Page effects: scroll reveals, active-section nav, and the cursor readout.
 */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  const year = $("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ───────── scroll reveal ───────── */

  const rvEls = Array.from(document.querySelectorAll(".rv"));
  if (reduceMotion || !("IntersectionObserver" in window)) {
    rvEls.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      let k = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = k++ * 90;
        el.style.transitionDelay = `${delay}ms`;
        el.classList.add("in");
        // drop the stagger afterwards so hover transitions aren't delayed
        setTimeout(() => { el.style.transitionDelay = ""; }, delay + 800);
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 });
    rvEls.forEach((el) => io.observe(el));
  }

  /* ───────── active section → nav + readout ───────── */

  const navLinks = Array.from(document.querySelectorAll("#nav a"));
  const hudS = $("hud-s");
  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const name = entry.target.dataset.section;
      if (hudS) hudS.textContent = name;
      navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${name}`));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("[data-section]").forEach((s) => sectionIO.observe(s));

  /* ───────── cursor readout ───────── */

  const hud = $("hud"), hx = $("hud-x"), hy = $("hud-y");
  const pad = (n) => String(Math.max(0, Math.round(n))).padStart(4, "0");
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    hud.classList.add("on");
    hx.textContent = pad(e.pageX);
    hy.textContent = pad(e.pageY);
  }, { passive: true });
})();
