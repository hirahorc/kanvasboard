import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { frameId, readManifest } from "./manifest.js";
import { compare } from "./pixels.js";
import { serve } from "./serve.js";
import { launch } from "./snap.js";

export interface Verdict {
  id: string;
  /** share of pixels that differ between the live page's picture and the frozen frame's */
  ratio: number;
  /** "640×2400 vs 640×2380" when the two aren't the same size */
  size?: string;
  error?: string;
}

/**
 * How faithful the frozen frames are: each one rendered from its static file
 * the way it's shown on the board, and compared with the picture taken of the
 * live page. A difference map is written for every frame that differs.
 */
export async function verify(o: { out: string; scenes?: string[]; devices?: string[]; browser?: string; diffDir?: string; log?: (l: string) => void }): Promise<Verdict[]> {
  const log = o.log ?? (() => {});
  const m = readManifest(o.out);
  if (!m) throw new Error(`no manifest in ${o.out}: run kanvas snap first`);
  const frames = Object.values(m.frames).filter(
    (f) => f.html && (!o.scenes?.length || o.scenes.includes(f.scene)) && (!o.devices?.length || o.devices.includes(f.device)),
  );
  const diffDir = o.diffDir ?? join(o.out, ".verify");
  mkdirSync(diffDir, { recursive: true });
  const server = await serve(o.out);
  const browser = await launch(o.browser);
  const verdicts: Verdict[] = [];
  try {
    for (const f of frames) {
      const id = frameId(f.scene, f.device);
      const device = m.devices.find((d) => d.id === f.device)!;
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.scale ?? 1,
        isMobile: !!device.mobile,
        hasTouch: !!device.mobile,
      });
      try {
        const page = await context.newPage();
        await page.goto(`${server.url}/${f.html}`, { waitUntil: "load" });
        // as the board shows it: every image in, scrolled to what it frames
        await page.evaluate(`(async () => {
          for (const img of document.images) img.loading = "eager";
          await Promise.race([Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 8000))]);
          try { await document.fonts.ready; } catch {}
          await Promise.race([Promise.all([...document.images].map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 8000))]);
          for (const el of document.querySelectorAll("[data-kanvas-scroll]")) { const [x, y] = el.getAttribute("data-kanvas-scroll").split(",").map(Number); el.scrollTo({ left: x, top: y, behavior: "instant" }); }
          scrollTo({ left: ${f.scroll?.x ?? 0}, top: ${f.scroll?.y ?? 0}, behavior: "instant" });
        })()`);
        const shot = { animations: "disabled" as const, caret: "hide" as const };
        const png =
          f.view === "screen"
            ? await page.screenshot(shot)
            : f.view === "section"
              ? await page.screenshot({ ...shot, fullPage: true, clip: { x: 0, y: f.scroll?.y ?? 0, width: f.width, height: f.height } })
              : await page.screenshot({ ...shot, fullPage: true });
        const a = PNG.sync.read(readFileSync(join(o.out, f.png)));
        const b = PNG.sync.read(png);
        const { ratio, diff } = compare(a, b);
        const n = Math.round(ratio * diff.width * diff.height);
        const size = a.width !== b.width || a.height !== b.height ? `${a.width}×${a.height} live vs ${b.width}×${b.height} frozen` : undefined;
        if (n > 0) writeFileSync(join(diffDir, `${id}.png`), PNG.sync.write(diff));
        if (n > 0 || size) writeFileSync(join(diffDir, `${id}.frozen.png`), png);
        verdicts.push({ id, ratio, ...(size ? { size } : {}) });
        log(`${ratio < 0.005 && !size ? "✓" : "≠"} ${id}  ${(ratio * 100).toFixed(2)}% differ${size ? `  (${size})` : ""}`);
      } catch (e) {
        verdicts.push({ id, ratio: 1, error: (e as Error).message.split("\n")[0] });
        log(`✗ ${id}  ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return verdicts;
}
