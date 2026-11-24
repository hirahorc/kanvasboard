#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { build, openLive, view } from "./live.js";
import { loadConfig } from "./load.js";
import { snap } from "./snap.js";
import { verify } from "./verify.js";

const HELP = `kanvas: every state of your app on one board

  kanvas snap [board…]    open each scene at each device and freeze it
  kanvas view             the board on this machine, "Open live" included
  kanvas open <scene>     the scene in a real browser, in its state, to use
  kanvas build            the board as a static site (--to <dir>, default: the frames' folder)
  kanvas verify           compare each frozen frame with the live page's picture

options
  --config <file>         the config (default: kanvas.config.ts here)
  --scene <id>            only this scene (repeatable)
  --device <id>           only this device (repeatable)
  --concurrency <n>       pages at once (default 4)
  --port <n>              for view (default: a free one)
  --to <dir>              for build
  --browser <b>           chrome (installed, default), chromium, or a path
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      scene: { type: "string", multiple: true },
      device: { type: "string", multiple: true },
      concurrency: { type: "string" },
      browser: { type: "string" },
      port: { type: "string" },
      to: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...rest] = positionals;
  if (!command || values.help) {
    process.stdout.write(HELP);
    return;
  }
  const { config, file } = await loadConfig(values.config);
  const root = dirname(file);
  const log = (l: string) => process.stdout.write(`${l}\n`);

  if (command === "snap") {
    const t0 = Date.now();
    const { done, failed } = await snap({
      config,
      root,
      boards: rest,
      scenes: values.scene,
      devices: values.device,
      concurrency: values.concurrency ? Number(values.concurrency) : undefined,
      browser: values.browser,
      log,
    });
    log(`\n${done.length - failed.length} of ${done.length + failed.filter((f) => !f.html).length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s${failed.length ? `, ${failed.length} with a problem` : ""}`);
    process.exitCode = failed.length ? 1 : 0;
  } else if (command === "view") {
    const out = resolve(root, config.out ?? "kanvas");
    await view({ config, out, port: values.port ? Number(values.port) : undefined, browser: values.browser, log });
    await new Promise(() => {});
  } else if (command === "open") {
    if (!rest[0]) throw new Error("which scene? kanvas open <scene>");
    await openLive({ config, scene: rest[0], device: values.device?.[0], browser: values.browser, log });
  } else if (command === "build") {
    const out = resolve(root, config.out ?? "kanvas");
    const to = values.to ? resolve(values.to) : out;
    build({ out, to });
    log(`the board is in ${to}: open its index.html from any static host`);
  } else if (command === "verify") {
    const out = resolve(root, config.out ?? "kanvas");
    const verdicts = await verify({ out, scenes: values.scene, devices: values.device, browser: values.browser, log });
    const off = verdicts.filter((v) => v.error || v.size || v.ratio >= 0.005);
    log(`\n${verdicts.length - off.length} of ${verdicts.length} frames match their live page (under 0.5% of pixels differ)`);
    process.exitCode = off.length ? 1 : 0;
  } else {
    process.stdout.write(`no command "${command}"\n\n${HELP}`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`kanvas: ${(e as Error).message}\n`);
  process.exitCode = 2;
});
