/**
 * Run on its own (by load.ts) to read a config's clock and time zone when
 * they aren't written in the config file itself (a clock imported from
 * elsewhere): the config is then loaded for real at that clock, so whatever
 * it works out as it loads (a date "in forty days") is the same every time.
 * Prints them as JSON on its last line.
 */
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const file = process.argv[2];
if (!file) process.exit(2);
const mod = (await tsImport(pathToFileURL(file).href, import.meta.url)) as { default?: { clock?: string; timezone?: string; default?: { clock?: string; timezone?: string } } };
const c = mod.default && "default" in mod.default ? mod.default.default : mod.default;
process.stdout.write(`\n${JSON.stringify({ clock: c?.clock, timezone: c?.timezone })}\n`);
process.exit(0);
