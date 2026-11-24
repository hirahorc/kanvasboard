#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./load.js";
import { snap } from "./snap.js";
import { verify } from "./verify.js";

const HELP = `kanvas: every state of your app on one board

  kanvas snap [board…]    open each scene at each device and freeze it
  kanvas verify           compare each frozen frame with the live page's picture

options
  --config <file>         the config (default: kanvas.config.ts here)
  --scene <id>            only this scene (repeatable)
  --device <id>           only this device (repeatable)
  --concurrency <n>       pages at once (default 4)
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
