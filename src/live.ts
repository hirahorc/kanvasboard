import { existsSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KanvasConfig, Scene } from "./config.js";
import { scenesOf } from "./load.js";
import { serve } from "./serve.js";
import { launch, openScene } from "./snap.js";

/**
 * A scene opened for a person to use: a real browser window at the device,
 * in the scene's state (seeded, its steps played), with motion as the page
 * has it. It stays open until its window is closed.
 */
export async function openLive(o: { config: KanvasConfig; scene: string; device?: string; browser?: string; log?: (l: string) => void }) {
  const log = o.log ?? (() => {});
  const scene: Scene | undefined = scenesOf(o.config).find((s) => s.id === o.scene);
  if (!scene) throw new Error(`no scene called "${o.scene}"`);
  const device = o.device ? o.config.devices.find((d) => d.id === o.device) : o.config.devices.find((d) => !scene.devices || scene.devices.includes(d.id));
  if (!device) throw new Error(`no device "${o.device}"`);
  const browser = await launch(o.browser, false);
  const { page, error } = await openScene(browser, o.config, scene, device, true);
  log(error ? `opened ${scene.id} at ${device.id}, but ${error}` : `opened ${scene.id} at ${device.id}: it's yours, close its window when done`);
  await new Promise<void>((done) => page.on("close", () => done()));
  await browser.close();
}

/** where the built viewer is: beside this file once built, under dist from the source */
export function viewerDir(): string {
  for (const rel of ["./viewer/", "../dist/viewer/"]) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  throw new Error("the viewer isn't built: run npm run build in kanvas");
}

/**
 * The board on this machine: the viewer and the frames served together, and
 * "Open live" answered by opening the scene in a real browser here.
 */
export async function view(o: { config: KanvasConfig; out: string; port?: number; browser?: string; log?: (l: string) => void }) {
  const log = o.log ?? (() => {});
  if (!existsSync(join(o.out, "manifest.json"))) throw new Error(`no frames in ${o.out}: run kanvas snap first`);
  const server = await serve([o.out, viewerDir()], {
    port: o.port,
    api: async (req, res, path) => {
      if (path === "/api/live") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ live: true }));
        return true;
      }
      if (path === "/api/open" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { scene, device } = JSON.parse(body || "{}") as { scene?: string; device?: string };
        if (!scene) {
          res.writeHead(400).end("which scene?");
          return true;
        }
        openLive({ config: o.config, scene, device, browser: o.browser, log }).catch((e) => log(`couldn't open ${scene}: ${(e as Error).message}`));
        res.writeHead(202).end();
        return true;
      }
      return false;
    },
  });
  log(`the board is at ${server.url}  (Ctrl+C to stop)`);
  return server;
}

/** the viewer and the frames as one folder, to put on any static host */
export function build(o: { out: string; to: string }) {
  if (!existsSync(join(o.out, "manifest.json"))) throw new Error(`no frames in ${o.out}: run kanvas snap first`);
  mkdirSync(o.to, { recursive: true });
  const viewer = viewerDir();
  for (const name of readdirSync(viewer)) cpSync(join(viewer, name), join(o.to, name), { recursive: true });
  if (o.to !== o.out) {
    for (const name of ["manifest.json", "changelog.json", "frames", "assets"]) {
      if (existsSync(join(o.out, name))) cpSync(join(o.out, name), join(o.to, name), { recursive: true });
    }
  }
}
