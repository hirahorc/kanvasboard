// Runs inside the page kanvas is snapping (its text is evaluated there), and
// defines window.__kanvas: `settle` puts the page still and whole for its
// picture, `freeze` turns it into one self-contained document. Plain browser
// JavaScript on purpose: nothing a bundler adds, nothing it needs.
(() => {
  if (window.__kanvas) return;

  const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  // every animation and transition at its end, and no caret blinking
  const STILL =
    "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;" +
    "animation-iteration-count:1!important;transition-duration:0s!important;" +
    "transition-delay:0s!important;caret-color:transparent!important}" +
    // a scroll kanvas makes lands at once, here and in the frozen copy
    "html,body{scroll-behavior:auto!important}";

  function addStyle(id, css) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  async function imagesLoaded(ms) {
    const pending = [...document.images].filter((img) => !img.complete);
    const each = pending.map(
      (img) =>
        new Promise((done) => {
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }),
    );
    await Promise.race([Promise.all(each), pause(ms)]);
    // loaded isn't painted: each picture decoded, so the frame doesn't catch one blank
    await Promise.race([Promise.all([...document.images].map((img) => img.decode().catch(() => {}))), pause(ms)]);
  }

  // CSS animations end where they end; one started from script keeps its last
  // frame as an inline style, so the frozen copy (which has no script) has it too
  function stillAnimations() {
    for (const a of document.getAnimations()) {
      const fromCss =
        (typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation) ||
        (typeof CSSTransition !== "undefined" && a instanceof CSSTransition);
      try {
        a.finish();
      } catch {
        /* an endless one: STILL has ended it */
      }
      if (!fromCss) {
        try {
          a.commitStyles();
          a.cancel();
        } catch {
          /* its element isn't rendered */
        }
      }
    }
  }

  /**
   * The page still and whole. `walk` scrolls it top to bottom first, so what
   * appears as it's scrolled to (a lazy image, a section that animates in)
   * is there. A screen keeps the scroll the steps left (it shows what's
   * there); a page goes back to its top, since it's shown whole from the top,
   * and what's pinned (a sticky header, a toast) belongs where the top has it.
   */
  async function settle({ view, hide, walk }) {
    if (hide && hide.length) addStyle("kanvas-hide", `${hide.join(",")}{display:none!important}`);
    const keep = view === "page" ? { x: 0, y: 0 } : { x: scrollX, y: scrollY };
    try {
      await document.fonts.ready;
    } catch {
      /* no fonts API */
    }
    for (const img of document.images) if (img.loading === "lazy") img.loading = "eager";
    if (walk) {
      const step = Math.max(200, innerHeight * 0.8);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo({ left: 0, top: y, behavior: "instant" });
        await frame();
        await pause(40);
      }
    }
    scrollTo({ left: keep.x, top: keep.y, behavior: "instant" });
    await imagesLoaded(8000);
    addStyle("kanvas-still", STILL);
    stillAnimations();
    await frame();
    await frame();
    stillAnimations();

    const doc = document.documentElement;
    const out = { scrollX, scrollY, width: doc.scrollWidth, height: doc.scrollHeight };
    const section = document.querySelector("[data-kanvas-section]");
    if (view === "section" && section) {
      // what's pinned to the screen and isn't the section's would sit over it
      for (const el of document.body.querySelectorAll("*")) {
        if (el === section || el.contains(section) || section.contains(el)) continue;
        const pos = getComputedStyle(el).position;
        if (pos === "fixed" || pos === "sticky") el.setAttribute("data-kanvas-off", "");
      }
      addStyle("kanvas-off", "[data-kanvas-off]{visibility:hidden!important}");
      await frame();
      const r = section.getBoundingClientRect();
      out.section = { y: Math.max(0, Math.round(r.top + scrollY)), height: Math.ceil(r.height) };
    }
    return out;
  }

  /**
   * The page as one document with no script: its DOM as it stands (fields
   * holding what was typed, a canvas as its picture), its CSS gathered, and
   * every file it uses listed, each replaced by a token kanvas swaps for its
   * own copy. `fallback` names what can't be frozen faithfully: such a frame
   * is shown as its picture.
   */
  async function freeze() {
    const assets = [];
    const index = new Map();
    const fallback = new Set();
    const token = (url) => {
      if (!url) return url;
      let abs;
      try {
        abs = new URL(url, document.baseURI).href;
      } catch {
        return url;
      }
      if (abs.startsWith("data:")) return abs;
      if (!/^(https?|blob):/.test(abs)) return url;
      if (!index.has(abs)) {
        index.set(abs, assets.length);
        assets.push(abs);
      }
      return `__KANVAS_ASSET_${index.get(abs)}__`;
    };

    // a blob: URL dies with the page, so its file is read now
    const blobs = new Map();
    for (const img of document.images) {
      const s = img.currentSrc || img.src;
      if (!s || !s.startsWith("blob:") || blobs.has(s)) continue;
      try {
        const blob = await (await fetch(s)).blob();
        const data = await new Promise((done) => {
          const reader = new FileReader();
          reader.onload = () => done(reader.result);
          reader.readAsDataURL(blob);
        });
        blobs.set(s, data);
      } catch {
        /* unreadable: the token stands, and fails to load */
      }
    }
    const file = (u) => (u && blobs.has(u) ? blobs.get(u) : token(u));

    try {
      if (document.querySelector(":modal")) fallback.add("a modal in the top layer");
      if (document.querySelector(":popover-open")) fallback.add("a popover in the top layer");
    } catch {
      /* selectors this browser doesn't know */
    }

    const root = document.documentElement;
    const copy = root.cloneNode(true);
    const from = [root, ...root.querySelectorAll("*")];
    const to = [copy, ...copy.querySelectorAll("*")];
    const drop = [];
    for (let i = 0; i < from.length; i++) {
      const o = from[i];
      const c = to[i];
      if (!c) break;
      // (one that can't be seen doesn't count: a dev overlay the config hides,
      // a screen reader's announcer a pixel wide)
      if (o.shadowRoot) {
        const r = o.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) fallback.add(`shadow DOM in <${o.localName}>`);
      }
      switch (o.localName) {
        case "script":
        case "noscript":
        case "link":
        case "style":
        case "base":
        case "source":
        case "audio":
          drop.push(c);
          continue;
        case "meta": {
          const eq = (o.getAttribute("http-equiv") || "").toLowerCase();
          if (o.hasAttribute("charset") || eq === "refresh" || eq === "content-security-policy") drop.push(c);
          break;
        }
        case "img": {
          const s = o.currentSrc || o.getAttribute("src");
          if (s) c.setAttribute("src", file(s));
          c.removeAttribute("srcset");
          c.removeAttribute("sizes");
          c.removeAttribute("fetchpriority");
          c.setAttribute("loading", "lazy");
          break;
        }
        case "video": {
          const poster = o.getAttribute("poster");
          if (poster) c.setAttribute("poster", token(poster));
          else fallback.add("a video");
          c.removeAttribute("src");
          c.removeAttribute("autoplay");
          break;
        }
        case "canvas": {
          try {
            const img = document.createElement("img");
            for (const a of o.attributes) img.setAttribute(a.name, a.value);
            img.setAttribute("src", o.toDataURL());
            const r = o.getBoundingClientRect();
            img.style.width = `${r.width}px`;
            img.style.height = `${r.height}px`;
            c.replaceWith(img);
          } catch {
            fallback.add("a canvas");
          }
          break;
        }
        case "iframe":
        case "embed":
        case "object":
          fallback.add(`an ${o.localName}`);
          break;
        case "input": {
          const type = (o.type || "").toLowerCase();
          if (type === "checkbox" || type === "radio") {
            if (o.checked) c.setAttribute("checked", "");
            else c.removeAttribute("checked");
          } else if (type !== "file") c.setAttribute("value", o.value);
          break;
        }
        case "textarea":
          c.textContent = o.value;
          break;
        case "option":
          if (o.selected) c.setAttribute("selected", "");
          else c.removeAttribute("selected");
          break;
        case "image":
        case "use":
          for (const name of ["href", "xlink:href"]) {
            const v = o.getAttribute(name);
            if (v && !v.startsWith("#")) c.setAttribute(name, token(v));
          }
          break;
      }
      c.removeAttribute("autofocus");
      if ((o.scrollTop || o.scrollLeft) && o !== root && o !== document.body) {
        c.setAttribute("data-kanvas-scroll", `${o.scrollLeft},${o.scrollTop}`);
      }
    }
    // the element with focus keeps showing it (kanvas makes `:focus` selectors match this)
    const active = document.activeElement;
    if (active && active !== document.body && active !== root) {
      const at = from.indexOf(active);
      if (at >= 0 && to[at]) to[at].setAttribute("data-kanvas-focus", active.matches(":focus-visible") ? "visible" : "");
    }
    for (const c of drop) c.remove();

    // the charset first, then the place kanvas puts the page's CSS
    const head = copy.querySelector("head");
    const slot = document.createElement("style");
    slot.setAttribute("data-kanvas-css", "");
    head.insertBefore(slot, head.firstChild);
    const charset = document.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    head.insertBefore(charset, head.firstChild);

    // every stylesheet in the cascade's order; one from another origin can't
    // be read here, so kanvas fetches it by its address
    const sheets = [];
    const mediaOf = (m) => (m && m.mediaText && m.mediaText !== "all" ? m.mediaText : "");
    const take = (sheet) => {
      if (sheet.disabled) return;
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        if (sheet.href) sheets.push({ href: sheet.href, media: mediaOf(sheet.media) });
        return;
      }
      let css = "";
      for (const r of rules) {
        if (typeof CSSImportRule !== "undefined" && r instanceof CSSImportRule) {
          if (r.styleSheet) take(r.styleSheet);
          continue;
        }
        css += `${r.cssText}\n`;
      }
      sheets.push({ css, base: sheet.href || document.baseURI, media: mediaOf(sheet.media) });
    };
    for (const s of document.styleSheets) take(s);
    for (const s of document.adoptedStyleSheets || []) take(s);

    return {
      html: `<!DOCTYPE html>\n${copy.outerHTML}`,
      sheets,
      assets,
      fallback: [...fallback],
      base: document.baseURI,
    };
  }

  window.__kanvas = { settle, freeze };
})();
