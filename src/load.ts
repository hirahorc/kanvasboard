import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { atClock } from "./clock.js";
import { isGap, type Board, type KanvasConfig, type Scene } from "./config.js";

const NAMES = ["kanvas.config.ts", "kanvas.config.mts", "kanvas.config.js", "kanvas.config.mjs"];

/** the config's clock, read from its source before it runs, so the config itself loads at it */
function clockOf(source: string): string | undefined {
  return source.match(/clock\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
}

export async function loadConfig(path?: string): Promise<{ config: KanvasConfig; file: string }> {
  const file = path ? resolve(path) : NAMES.map((n) => resolve(n)).find((f) => existsSync(f));
  if (!file || !existsSync(file)) throw new Error(path ? `no config at ${path}` : `no ${NAMES[0]} here`);
  const run = async () => {
    const mod = (await tsImport(pathToFileURL(file).href, import.meta.url)) as { default?: KanvasConfig | { default?: KanvasConfig } };
    // a config outside an ES-module package comes back wrapped once more
    const config = mod.default && "default" in mod.default ? mod.default.default : (mod.default as KanvasConfig | undefined);
    if (!config) throw new Error(`${file} has no default export`);
    return config;
  };
  const source = readFileSync(file, "utf8");
  // seeds work dates out in the pages' time zone, not this machine's
  const zone = source.match(/timezone\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
  if (zone) process.env.TZ = zone;
  const clock = clockOf(source);
  const config = clock ? await atClock(clock, run) : await run();
  if (config.timezone) process.env.TZ = config.timezone;
  check(config);
  return { config, file };
}

function check(c: KanvasConfig) {
  const bad: string[] = [];
  if (!c.baseUrl) bad.push("baseUrl is missing");
  if (!c.clock || Number.isNaN(new Date(c.clock).getTime())) bad.push("clock must be a date");
  if (!c.devices?.length) bad.push("devices is empty");
  const scenes = new Map<string, Scene>();
  for (const b of c.boards ?? [])
    for (const l of b.lanes)
      for (const r of l.rows)
        for (const s of r.scenes) {
          if (isGap(s)) continue;
          const was = scenes.get(s.id);
          if (was && was !== s && was.path !== s.path) bad.push(`two scenes are called "${s.id}"`);
          scenes.set(s.id, s);
        }
  for (const s of scenes.values())
    for (const d of s.devices ?? []) if (!c.devices.some((x) => x.id === d)) bad.push(`${s.id}: no device "${d}"`);
  if (bad.length) throw new Error(`the config isn't right:\n  ${bad.join("\n  ")}`);
}

/** every scene once, with the boards it's on */
export function scenesOf(config: KanvasConfig, boards?: string[]): Scene[] {
  const out = new Map<string, Scene>();
  const picked: Board[] = boards?.length ? config.boards.filter((b) => boards.includes(b.id)) : config.boards;
  if (boards?.length && picked.length !== boards.length) {
    const missing = boards.filter((id) => !config.boards.some((b) => b.id === id));
    throw new Error(`no board called ${missing.map((m) => `"${m}"`).join(", ")}`);
  }
  for (const b of picked) for (const l of b.lanes) for (const r of l.rows) for (const s of r.scenes) if (!isGap(s)) out.set(s.id, s);
  return [...out.values()];
}
