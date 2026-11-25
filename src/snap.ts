import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { Assets } from "./assets.js";
import { atClock } from "./clock.js";
import type { Device, KanvasConfig, Scene, Seed, Step } from "./config.js";
import { rewriteCss, rewriteStyle, type CssContext } from "./css.js";
import { describe, frameId, readManifest, viewKind, writeManifest, type FrameRecord, type Manifest } from "./manifest.js";
import { scenesOf } from "./load.js";
import { locate, say } from "./target.js";

const FREEZE = readFileSync(new URL("./page/freeze.js", import.meta.url), "utf8");
const SEED = readFileSync(new URL("./page/seed.js", import.meta.url), "utf8").trim();

export interface SnapOptions {
  config: KanvasConfig;
  /** the folder the config is in: `out` is under it */
  root: string;
  boards?: string[];
  scenes?: string[];
  devices?: string[];
  concurrency?: number;
  /** "chrome" (the one installed, the default), "chromium" (Playwright's), or a path to a browser */
  browser?: string;
  log?: (line: string) => void;
}

export async function launch(browser = "chrome", headless = true): Promise<Browser> {
  try {
    if (browser === "chrome") return await chromium.launch({ channel: "chrome", headless });
    if (browser === "chromium") return await chromium.launch({ headless });
    return await chromium.launch({ executablePath: browser, headless });
  } catch (e) {
    const m = (e as Error).message;
    if (browser === "chrome" && /is not found|distribution/i.test(m))
      throw new Error("Google Chrome isn't installed here: install it, or run `npx playwright-core install chromium` and add --browser chromium");
    if (browser === "chromium" && /Executable doesn't exist|playwright install/i.test(m)) throw new Error("Playwright's Chromium isn't installed: run `npx playwright-core install chromium` first");
    throw e;
  }
}

/** a picture small enough for a whole board of them: about this wide */
const THUMB_WIDTH = 360;

const STEP_MS = 10000;

/** the network quiet for a moment, or a few seconds gone: whichever is first */
async function quiet(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
}

async function play(page: Page, step: Step) {
  if ("click" in step) await locate(page, step.click).click({ timeout: STEP_MS });
  else if ("fill" in step) {
    const field = locate(page, step.fill);
    await field.fill("", { timeout: STEP_MS });
    await field.pressSequentially(step.text);
  } else if ("select" in step) {
    const field = locate(page, step.select);
    await field.waitFor({ state: "visible", timeout: STEP_MS });
    // an option that isn't there would only time out: say which ones are
    const options = await field.evaluate((el) => (el instanceof HTMLSelectElement ? [...el.options].map((o) => [o.label, o.value] as const) : null));
    if (!options) throw new Error("not a <select>");
    if (!options.some(([label, value]) => label === step.option || value === step.option))
      throw new Error(`${say(step.select)} has no option "${step.option}": it has ${options.map(([l]) => `"${l}"`).join(", ")}`);
    await field.selectOption(step.option, { timeout: STEP_MS });
  }
  else if ("leave" in step) await locate(page, step.leave).blur({ timeout: STEP_MS });
  else if ("see" in step) await locate(page, step.see).waitFor({ state: "visible", timeout: STEP_MS });
  else if ("show" in step) {
    await locate(page, step.show).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }), undefined, { timeout: STEP_MS });
  } else if ("top" in step) await page.evaluate("scrollTo(0, 0)");
  else if ("press" in step) await page.keyboard.press(step.press);
  else if ("wait" in step) await page.waitForTimeout(step.wait);
  else if ("hold" in step) await page.evaluate(`window.__kanvasHold(${Number(step.hold)})`);
}

const stepName = (s: Step): string => {
  if ("click" in s) return `click ${say(s.click)}`;
  if ("fill" in s) return `fill ${say(s.fill)}`;
  if ("select" in s) return `select "${s.option}" in ${say(s.select)}`;
  if ("leave" in s) return `leave ${say(s.leave)}`;
  if ("see" in s) return `see ${say(s.see)}`;
  if ("show" in s) return `show ${say(s.show)}`;
  if ("press" in s) return `press ${s.press}`;
  if ("wait" in s) return `wait ${s.wait}ms`;
  if ("hold" in s) return `hold ${s.hold}ms`;
  return "top";
};

/** what a step's failure means, in words: Playwright's own first line otherwise */
function failure(step: Step, e: Error): string {
  const m = e.message.split("\n")[0] ?? "";
  const target = "click" in step ? step.click : "fill" in step ? step.fill : "select" in step ? step.select : "leave" in step ? step.leave : "see" in step ? step.see : "show" in step ? step.show : undefined;
  if (/not an <input>, <textarea>|contenteditable/i.test(m)) return `fill types into a text field; for a <select> use { select: …, option: "…" }`;
  if (/not a <select>/i.test(m)) return `select picks an option of a <select>; for a text field use { fill: …, text: "…" }`;
  if (target !== undefined && /Timeout \d+ms exceeded/i.test(m)) return `nothing visible matches ${say(target)} after ${STEP_MS / 1000}s: check its words, role or label (\`contains: true\` matches part of the words)`;
  return m;
}

const sha1 = (b: string | Buffer) => createHash("sha1").update(b).digest("hex");

interface Settled {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  section?: { y: number; height: number };
}
interface Frozen {
  html: string;
  sheets: ({ css: string; base: string; media: string } | { href: string; media: string })[];
  assets: string[];
  fallback: string[];
  base: string;
}

/**
 * A scene in its state: a browser context at the device, its date at the
 * config's clock, its storage seeded, its steps played. `live` is for a
 * person to use it (`kanvas open`): motion as the page has it, timers not held.
 * A step that can't be played stops the steps and says which.
 */
export async function openScene(browser: Browser, config: KanvasConfig, scene: Scene, device: Device, live = false): Promise<{ context: BrowserContext; page: Page; error?: string }> {
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale ?? 1,
    isMobile: !!device.mobile,
    hasTouch: !!device.mobile,
    reducedMotion: live || config.reducedMotion === false ? "no-preference" : "reduce",
    ...(config.timezone ? { timezoneId: config.timezone } : {}),
    ...(config.locale ? { locale: config.locale } : {}),
  });
  let error: string | undefined;
  try {
    const seed: Seed = await atClock(config.clock, async () => (typeof scene.seed === "function" ? await scene.seed() : (scene.seed ?? {})));
    if (seed.cookies?.length) {
      const host = new URL(config.baseUrl).hostname;
      await context.addCookies(seed.cookies.map((c) => ({ name: c.name, value: c.value, domain: host, path: c.path ?? "/" })));
    }
    await context.addInitScript({
      // the page's date starts at the config's clock and runs on from it
      content: `(${SEED})(${JSON.stringify({ clock: new Date(config.clock).getTime(), local: seed.localStorage, session: seed.sessionStorage, hold: live ? undefined : scene.hold, hide: config.hide ?? [] })});`,
    });
    const page = await context.newPage();
    await page.goto(scene.path, { waitUntil: "load", timeout: 45000 });
    await quiet(page);
    for (const [i, step] of (scene.steps ?? []).entries()) {
      if (live && "hold" in step) continue;
      try {
        await play(page, step);
      } catch (e) {
        error = `step ${i + 1}, ${stepName(step)}: ${failure(step, e as Error)}`;
        break;
      }
    }
    await quiet(page);
    return { context, page, ...(error ? { error } : {}) };
  } catch (e) {
    await context.close();
    throw e;
  }
}

/** one scene at one device: its picture, a small one, and its frozen page, written under `out` */
async function snapOne(browser: Browser, config: KanvasConfig, scene: Scene, device: Device, out: string, assets: Assets, was?: FrameRecord): Promise<FrameRecord> {
  const view = viewKind(scene.view);
  const opened = await openScene(browser, config, scene, device);
  const { context, page } = opened;
  let error = opened.error;
  try {
    // the pointer off the page, so the last thing pressed doesn't show its hover
    await page.mouse.move(-1, -1).catch(() => {});
    await page.waitForTimeout(300);

    if (typeof scene.view === "object") {
      try {
        await locate(page, scene.view.section).evaluate((el) => el.setAttribute("data-kanvas-section", ""), undefined, { timeout: STEP_MS });
      } catch (e) {
        error ??= `the section ${say(scene.view.section)} isn't on the page: ${(e as Error).message.split("\n")[0]}`;
      }
    }
    // a state the steps couldn't reach keeps the last frame that did: half a state is never written over a whole one
    if (error && was?.html && was.png && (!was.error || was.stale) && existsSync(join(out, was.html)) && existsSync(join(out, was.png))) {
      return { ...was, error, stale: true };
    }
    await page.evaluate(FREEZE);
    const geo = (await page.evaluate(
      `window.__kanvas.settle(${JSON.stringify({ view, hide: config.hide ?? [], walk: view !== "screen" })})`,
    )) as Settled;

    // the picture
    const shot = { animations: "disabled" as const, caret: "hide" as const };
    let png: Buffer;
    let size: { width: number; height: number };
    let scroll: { x: number; y: number } | undefined;
    if (view === "screen") {
      png = await page.screenshot(shot);
      size = { width: device.width, height: device.height };
      scroll = { x: Math.round(geo.scrollX), y: Math.round(geo.scrollY) };
    } else if (view === "section" && geo.section) {
      const clip = { x: 0, y: geo.section.y, width: device.width, height: Math.max(1, geo.section.height) };
      png = await page.screenshot({ ...shot, fullPage: true, clip });
      size = { width: device.width, height: clip.height };
      scroll = { x: 0, y: clip.y };
    } else {
      png = await page.screenshot({ ...shot, fullPage: true });
      size = { width: device.width, height: Math.max(device.height, geo.height) };
    }

    // the small picture, for a board seen from far: the same clip, scaled
    const scale = Math.min(1, THUMB_WIDTH / device.width);
    const clipOf = { x: view === "screen" ? geo.scrollX : 0, y: view === "screen" ? geo.scrollY : (scroll?.y ?? 0), ...size, scale };
    const cdp = await context.newCDPSession(page);
    const small = (await cdp.send("Page.captureScreenshot", { format: "webp", quality: 80, clip: clipOf, captureBeyondViewport: true })) as { data: string };
    const thumb = Buffer.from(small.data, "base64");

    // the page, frozen
    const frozen = (await page.evaluate("window.__kanvas.freeze()")) as Frozen;
    const html = await assemble(frozen, device, assets);

    const id = frameId(scene.id, device.id);
    const htmlHash = sha1(html);
    mkdirSync(join(out, "frames"), { recursive: true });
    writeFileSync(join(out, "frames", `${id}.html`), html);
    // the same page as last time keeps last time's pictures: rendering isn't byte-exact,
    // and a picture rewritten for nothing would be a change in the app's repo for nothing
    const kept = !!was && was.htmlHash === htmlHash && was.error === error && !!was.png && existsSync(join(out, was.png)) && (!was.thumb || existsSync(join(out, was.thumb)));
    if (!kept) {
      writeFileSync(join(out, "frames", `${id}.png`), png);
      writeFileSync(join(out, "frames", `${id}.thumb.webp`), thumb);
    }
    return {
      scene: scene.id,
      device: device.id,
      view,
      ...size,
      ...(scroll && (scroll.x || scroll.y) ? { scroll } : {}),
      html: `frames/${id}.html`,
      png: `frames/${id}.png`,
      thumb: `frames/${id}.thumb.webp`,
      htmlHash,
      pngHash: kept ? was!.pngHash : sha1(png),
      ...(frozen.fallback.length ? { fallback: frozen.fallback } : {}),
      ...(error ? { error } : {}),
    };
  } finally {
    await context.close();
  }
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, "\u00a0").replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/\u00a0/g, "&nbsp;");

/**
 * The frozen page with every file pointing at the frame's own copy. Its
 * stylesheets become files under assets, each kept by its content: a page's
 * CSS is the same on every frame of it, so forty frames share one file (and
 * the board's browser loads it once).
 */
async function assemble(f: Frozen, device: Device, assets: Assets): Promise<string> {
  const urls = [...f.assets];
  const index = new Map(urls.map((u, i) => [u, i]));
  const ctx: CssContext = {
    vw: device.width,
    vh: device.height,
    asset: (abs) => {
      let i = index.get(abs);
      if (i === undefined) {
        i = urls.length;
        urls.push(abs);
        index.set(abs, i);
      }
      return `__KANVAS_ASSET_${i}__`;
    },
  };
  const sheets: { css: string; media: string }[] = [];
  for (const s of f.sheets) {
    const text = "css" in s ? s.css : await assets.text(s.href);
    if (text == null || !text.trim()) continue;
    sheets.push({ css: rewriteCss(text, "css" in s ? s.base : s.href, ctx), media: s.media });
  }
  // a `style` attribute is CSS too
  let html = f.html.replace(/(<[a-zA-Z][^>]*?\s)style="([^"]*)"/g, (_w, pre: string, v: string) => `${pre}style="${encode(rewriteStyle(decode(v), f.base, ctx))}"`);

  const names = await Promise.all(urls.map((u) => (u.startsWith("blob:") ? Promise.resolve(null) : assets.get(u))));
  // a stylesheet sits beside the files it uses; the page one folder up
  const fill = (text: string, prefix: string) =>
    text.replace(/__KANVAS_ASSET_(\d+)__/g, (_w, n: string) => {
      const name = names[Number(n)];
      return name ? `${prefix}${name}` : (urls[Number(n)] ?? "");
    });
  const links = sheets
    .map((s) => {
      const name = assets.put(fill(s.css, ""), ".css");
      return `<link rel="stylesheet" href="../assets/${name}"${s.media ? ` media="${encode(s.media)}"` : ""}>`;
    })
    .join("\n");
  html = html.replace('<style data-kanvas-css=""></style>', () => links);
  return fill(html, "../assets/");
}

/** snap the config's scenes at its devices and write the frames and the manifest */
export async function snap(o: SnapOptions): Promise<{ manifest: Manifest; done: FrameRecord[]; failed: FrameRecord[] }> {
  const { config } = o;
  const log = o.log ?? (() => {});
  const out = resolve(o.root, config.out ?? "kanvas");
  mkdirSync(out, { recursive: true });
  let scenes = scenesOf(config, o.boards);
  if (o.scenes?.length) scenes = scenes.filter((s) => o.scenes!.includes(s.id));
  const jobs = scenes.flatMap((s) =>
    config.devices.filter((d) => (!s.devices || s.devices.includes(d.id)) && (!o.devices?.length || o.devices.includes(d.id))).map((d) => ({ scene: s, device: d })),
  );
  log(`${jobs.length} frame${jobs.length === 1 ? "" : "s"}: ${scenes.length} scene${scenes.length === 1 ? "" : "s"} at ${[...new Set(jobs.map((j) => j.device.id))].join(", ")}`);

  // what's there already: a frame whose page is the same keeps its pictures
  const was = readManifest(out);
  const browser = await launch(o.browser);
  const assets = new Assets(join(out, "assets"));
  const done: FrameRecord[] = [];
  const failed: FrameRecord[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const id = frameId(job.scene.id, job.device.id);
      const t0 = Date.now();
      try {
        const rec = await snapOne(browser, config, job.scene, job.device, out, assets, was?.frames[id]);
        done.push(rec);
        if (rec.error) failed.push(rec);
        const note = rec.error ? `  ✗ ${rec.error}` : rec.fallback ? `  (shown as its picture: ${rec.fallback.join(", ")})` : "";
        log(`${rec.error ? "✗" : "✓"} ${id}  ${((Date.now() - t0) / 1000).toFixed(1)}s${note}`);
      } catch (e) {
        log(`✗ ${id}  ${(e as Error).message.split("\n")[0]}`);
        failed.push({ scene: job.scene.id, device: job.device.id, view: viewKind(job.scene.view), width: job.device.width, height: job.device.height, html: "", png: "", htmlHash: "", pngHash: "", error: (e as Error).message.split("\n")[0] });
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 4) }, worker));
  } finally {
    await assets.close();
    await browser.close();
  }

  // what this run didn't snap stays as it was, while its scene is still in the config
  const shape = describe(config);
  const frames: Record<string, FrameRecord> = {};
  for (const [k, f] of Object.entries(was?.frames ?? {})) if (shape.scenes[f.scene]) frames[k] = f;
  for (const f of done) frames[frameId(f.scene, f.device)] = f;
  const manifest: Manifest = { kanvas: 1, baseUrl: config.baseUrl, clock: config.clock, ...(config.site ? { site: config.site } : {}), ...(config.live ? { live: config.live } : {}), devices: config.devices, ...shape, frames };
  writeManifest(out, manifest);
  return { manifest, done, failed };
}
