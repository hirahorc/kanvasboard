/**
 * Rewriting a page's CSS for its frozen frame, declaration by declaration:
 * selectors and at-rule preludes are never touched (a class like
 * `.min-h-[100dvh]` must still match), only the values.
 *
 * - `url(...)` to a file becomes the frame's own copy of it;
 * - viewport units become pixels of the device the frame was taken on, so a
 *   `100dvh` hero stays a screen tall when the frame is shown as tall as its
 *   page, instead of growing to the whole frame.
 */

export interface CssContext {
  /** the absolute URL a file is fetched from, to the reference the frame uses */
  asset: (absUrl: string) => string;
  /** the device's viewport, for viewport units */
  vw: number;
  vh: number;
}

/**
 * Each declaration in `css` mapped by `fn`, and each prelude (what comes
 * before a `{`: a selector, an at-rule's condition) by `prelude`.
 */
export function mapDeclarations(css: string, fn: (decl: string) => string, prelude: (p: string) => string = (p) => p): string {
  let out = "";
  let start = 0;
  let depth = 0; // parentheses: a `;` inside url(data:…;base64,…) isn't the end of anything
  const flush = (end: number, isPrelude: boolean) => {
    const seg = css.slice(start, end);
    out += isPrelude ? prelude(seg) : !seg.includes(":") ? seg : fn(seg);
  };
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      for (i++; i < css.length && css[i] !== ch; i++) if (css[i] === "\\") i++;
      continue;
    }
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === "{" || ch === ";" || ch === "}")) {
      flush(i, ch === "{");
      out += ch;
      start = i + 1;
    }
  }
  flush(css.length, false);
  return out;
}

const URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g;
const VP_RE = /(^|[^\w.#-])(-?\d*\.?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|dvmin|svmin|lvmin|vmin|dvmax|svmax|lvmax|vmax)\b/g;

function px(n: number, unit: string, c: CssContext): string {
  const base = unit.endsWith("h")
    ? c.vh
    : unit.endsWith("w")
      ? c.vw
      : unit.endsWith("min")
        ? Math.min(c.vw, c.vh)
        : Math.max(c.vw, c.vh);
  return `${+((n * base) / 100).toFixed(3)}px`;
}

/** one declaration's value rewritten (its property name kept) */
function rewriteDeclaration(decl: string, base: string, c: CssContext): string {
  const colon = decl.indexOf(":");
  const name = decl.slice(0, colon + 1);
  let value = decl.slice(colon + 1);
  value = value.replace(URL_RE, (whole, a: string | undefined, b: string | undefined, bare: string | undefined) => {
    const raw = (a ?? b ?? bare ?? "").trim();
    // a fragment is a reference inside the document (an SVG gradient), and data stays inline
    if (!raw || raw.startsWith("#") || raw.startsWith("data:")) return whole;
    let abs: string;
    try {
      abs = new URL(raw, base).href;
    } catch {
      return whole;
    }
    if (!/^(https?|blob):/.test(abs)) return whole;
    return `url("${c.asset(abs)}")`;
  });
  value = value.replace(VP_RE, (_w, pre: string, n: string, unit: string) => `${pre}${px(Number(n), unit, c)}`);
  return name + value;
}

/**
 * A frozen page has no focus, so the element that had it carries
 * `data-kanvas-focus` ("visible" when it showed a ring), and a selector that
 * asks for focus matches that too: a field the page put focus on keeps its ring.
 */
function rewriteSelector(sel: string): string {
  if (sel.trimStart().startsWith("@")) return sel;
  return sel
    .replace(/:focus-visible(?![\w-])/g, ':is(:focus-visible,[data-kanvas-focus="visible"])')
    .replace(/:focus-within(?![\w-])/g, ":is(:focus-within,:has([data-kanvas-focus]))")
    .replace(/:focus(?![\w-])/g, ":is(:focus,[data-kanvas-focus])");
}

/** a whole stylesheet's text, from `base` (the sheet's own URL, or the page's for inline CSS) */
export function rewriteCss(css: string, base: string, c: CssContext): string {
  return mapDeclarations(css, (d) => rewriteDeclaration(d, base, c), rewriteSelector);
}

/** a `style` attribute's value */
export const rewriteStyle = (style: string, base: string, c: CssContext): string => mapDeclarations(style, (d) => rewriteDeclaration(d, base, c));
