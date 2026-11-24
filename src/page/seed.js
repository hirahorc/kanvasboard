// Added to every page of a scene's browser before the app's own scripts run
// (kanvas calls it with the scene's seed). It moves the page's clock to the
// config's "now", fills storage once (so a reload keeps what the steps
// changed), hides what the config hides (a dev badge that would sit over
// what a step presses), and holds back long timers when asked, so a moment
// that would pass (a toast) stays for the frame.
(({ clock, local, session, hold, hide }) => {
  if (window.top !== window) return;

  if (hide && hide.length) {
    const add = () => {
      if (document.getElementById("kanvas-hide")) return;
      const style = document.createElement("style");
      style.id = "kanvas-hide";
      style.textContent = `${hide.join(",")}{display:none!important}`;
      (document.head || document.documentElement).appendChild(style);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
    else add();
  }

  // only the date moves: timers and animation frames run as they always do
  if (typeof clock === "number") {
    const Real = Date;
    const began = Real.now();
    const now = () => clock + (Real.now() - began);
    class KanvasDate extends Real {
      constructor(...args) {
        if (args.length === 0) super(now());
        else super(...args);
      }
      static now() {
        return now();
      }
    }
    // Date() called without `new` gives a string, as it always has
    window.Date = new Proxy(KanvasDate, { apply: () => new Real(now()).toString() });
  }

  try {
    if (!sessionStorage.getItem("__kanvas_seeded")) {
      for (const [k, v] of Object.entries(local || {})) localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(session || {})) sessionStorage.setItem(k, v);
      sessionStorage.setItem("__kanvas_seeded", "1");
    }
  } catch {
    /* storage this page may not use */
  }

  let over = typeof hold === "number" ? hold : Infinity;
  const real = window.setTimeout;
  window.__kanvasHold = (ms) => {
    over = ms;
  };
  window.setTimeout = function (fn, ms, ...rest) {
    return (Number(ms) || 0) > over ? real(() => {}, 2147483647) : real(fn, ms, ...rest);
  };
})
