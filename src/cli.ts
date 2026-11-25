#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { diff, log as writeLog } from "./changes.js";
import { check } from "./check.js";
import { build, openLive, view } from "./live.js";
import { loadConfig } from "./load.js";
import { snap } from "./snap.js";
import { verify } from "./verify.js";

const HELP = `kanvas: every state of your app on one board

  kanvas snap [board…]    open each scene at each device and freeze it
  kanvas view             the board on this machine, "Open live" included
  kanvas open <scene>     the scene in a real browser, in its state, to use
  kanvas build            the board as a static site (--to <dir>, default: the frames' folder)
  kanvas diff             which frames look different from the ones last committed
  kanvas log              the changelog's entries for them, from the commits since
  kanvas check            every scene can still be reached (for CI: fails when one can't)
  kanvas verify           compare each frozen frame with the live page's picture

options
  --config <file>         the config (default: kanvas.config.ts here)
  --scene <id>            only this scene (repeatable)
  --device <id>           only this device (repeatable)
  --concurrency <n>       pages at once (default 4)
  --port <n>              for view (default: a free one)
  --to <dir>              for build
  --ref <ref>             for diff and log: compare with the frames at this commit (default HEAD)
  --summary <text>        for log: say what changed (default: the commits' subjects)
  --source <who>          for log: who asked (default: a Source: trailer, or the tickets named)
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
      ref: { type: "string" },
      summary: { type: "string" },
      source: { type: "string" },
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
  } else if (command === "diff" || command === "log") {
    const out = resolve(root, config.out ?? "kanvas");
    const say = (label: string, ids: string[]) => ids.length && log(`${label} (${ids.length}): ${ids.join(", ")}`);
    if (command === "diff") {
      const { diff: d, before } = diff({ out, ref: values.ref });
      if (!before) log("no frames committed yet: every scene is new");
      say("looks different", d.changed);
      say("new", d.added);
      say("rules changed", d.rules);
      say("gone", d.removed);
      say("written differently, looks the same", d.rewritten);
      if (!d.changed.length && !d.added.length && !d.rules.length && !d.removed.length) log("nothing looks different");
    } else {
      const { entries } = writeLog({ out, ref: values.ref, summary: values.summary, source: values.source });
      if (!entries.length) log("nothing looks different: no entry");
      for (const e of entries) {
        const what = e.boards?.length ? `the whole of ${e.boards.join(", ")}` : `${e.scenes?.length} state${e.scenes?.length === 1 ? "" : "s"}${e.added ? ", new" : ""}${e.rule ? ", rules" : ""}`;
        log(`+ ${what}: ${e.summary}${e.source ? `  (${e.source})` : ""}`);
      }
    }
  } else if (command === "check") {
    const problems = await check({ config, boards: rest, scenes: values.scene, devices: values.device, browser: values.browser, concurrency: values.concurrency ? Number(values.concurrency) : undefined, log });
    log(problems.length ? `\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}` : "\nevery scene can be reached");
    process.exitCode = problems.length ? 1 : 0;
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
