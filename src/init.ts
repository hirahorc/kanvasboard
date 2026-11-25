/**
 * `kanvas init`: a starting kanvas.config.ts for the app in this folder (its
 * pages as they first open, found from its routes) and a block in the coding
 * agent's instructions that keeps the board true from then on.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** what a framework is called, where its dev server answers, and how its routes are files */
interface Kind {
  dep: string;
  name: string;
  port: number;
  routes?: (root: string) => string[];
}

const MAX_PAGES = 12;

/** the folder's files under `dir`, as paths relative to it with "/" */
function walk(dir: string, rel = ""): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, r));
    else out.push(r);
  }
  return out;
}

/** a route from folder segments: route groups dropped, anything dynamic or private refused */
function route(segments: string[]): string | undefined {
  const kept: string[] = [];
  for (const s of segments) {
    if (/^\(.*\)$/.test(s)) continue; // (group)
    if (s.startsWith("[") || s.startsWith("_") || s.startsWith("@") || s.startsWith("-")) return undefined;
    kept.push(s);
  }
  return `/${kept.join("/")}`;
}

const inFirst = (root: string, dirs: string[]) => dirs.map((d) => join(root, d)).find((d) => existsSync(d));

function nextRoutes(root: string): string[] {
  const app = inFirst(root, ["app", "src/app"]);
  const found: string[] = [];
  if (app)
    for (const f of walk(app)) {
      const m = f.match(/^(?:(.*)\/)?page\.(?:tsx|jsx|ts|js|mdx)$/);
      const r = m && route(m[1] ? m[1].split("/") : []);
      if (r) found.push(r);
    }
  const pages = inFirst(root, ["pages", "src/pages"]);
  if (pages)
    for (const f of walk(pages)) {
      const m = f.match(/^(.*)\.(?:tsx|jsx|ts|js|mdx)$/);
      if (!m?.[1] || m[1].startsWith("api/") || /(^|\/)_/.test(m[1])) continue;
      const r = route(m[1].split("/").filter((s, i, all) => !(s === "index" && i === all.length - 1)));
      if (r) found.push(r);
    }
  return found;
}

const fileRoutes = (dirs: string[], file: RegExp) => (root: string) => {
  const dir = inFirst(root, dirs);
  if (!dir) return [];
  return walk(dir).flatMap((f) => {
    const m = f.match(file);
    if (!m) return [];
    const segs = (m[1] ?? "").split("/").filter(Boolean);
    if (segs.at(-1) === "index") segs.pop();
    const r = route(segs);
    return r ? [r] : [];
  });
};

/**
 * For an app whose routes aren't files (a Vite or React Router app): the
 * paths its code links to or routes, written out as strings.
 */
function linkedRoutes(root: string): string[] {
  const found = new Set<string>();
  for (const dir of ["src", "app"].map((d) => join(root, d)).filter((d) => existsSync(d)))
    for (const f of walk(dir)) {
      if (!/\.(?:jsx?|tsx?|vue|svelte)$/.test(f)) continue;
      const text = readFileSync(join(dir, f), "utf8");
      for (const m of text.matchAll(/\b(?:href|to|path)\s*[=:]\s*\{?\s*["'`](\/[^"'`\s]*)["'`]/g)) {
        const p = m[1]!.replace(/\/+$/, "") || "/";
        if (p.length < 60 && !/[:*?#{}\[\].]/.test(p) && !p.startsWith("/api") && !p.startsWith("//")) found.add(p);
      }
    }
  return [...found];
}

const KINDS: Kind[] = [
  { dep: "next", name: "Next.js", port: 3000, routes: nextRoutes },
  { dep: "nuxt", name: "Nuxt", port: 3000, routes: fileRoutes(["pages", "app/pages"], /^(.*)\.vue$/) },
  { dep: "astro", name: "Astro", port: 4321, routes: fileRoutes(["src/pages"], /^(.*)\.(?:astro|md|mdx)$/) },
  { dep: "@sveltejs/kit", name: "SvelteKit", port: 5173, routes: fileRoutes(["src/routes"], /^(?:(.*)\/)?\+page\.svelte$/) },
  { dep: "@remix-run/dev", name: "Remix", port: 5173 },
  { dep: "@react-router/dev", name: "React Router", port: 5173 },
  { dep: "@angular/core", name: "Angular", port: 4200 },
  { dep: "react-scripts", name: "Create React App", port: 3000 },
  { dep: "vite", name: "Vite", port: 5173 },
];

export interface App {
  name: string;
  framework?: string;
  port: number;
  routes: string[];
}

/** what this folder's app is, as far as its package.json and its files say */
export function detect(root: string): App {
  const pkgFile = join(root, "package.json");
  const pkg = existsSync(pkgFile) ? (JSON.parse(readFileSync(pkgFile, "utf8")) as { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }) : {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const kind = KINDS.find((k) => k.dep in deps);
  const dev = pkg.scripts?.dev ?? pkg.scripts?.start ?? "";
  // a port said in the dev script, else in a vite config, else the framework's own
  const viteConfig = ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.mts"].map((f) => join(root, f)).find((f) => existsSync(f));
  const port =
    Number(dev.match(/(?:--port|-p)[\s=]+(\d{2,5})/)?.[1]) ||
    Number(viteConfig && readFileSync(viteConfig, "utf8").match(/\bport\s*:\s*(\d{2,5})/)?.[1]) ||
    kind?.port ||
    3000;
  const routes = [...new Set(kind?.routes ? kind.routes(root) : linkedRoutes(root))].sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
  return { name: pkg.name ?? basename(root), framework: kind?.name, port, routes: routes.length ? routes : ["/"] };
}

const idOf = (r: string) => (r === "/" ? "home" : r.slice(1).replace(/[^a-z0-9]+/gi, "-").toLowerCase());
const titleOf = (r: string) => {
  if (r === "/") return "Home";
  const words = r.slice(1).replace(/[-_/]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** today at 10:00 here, with this machine's offset: a clock that reads like a real morning */
function morning(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T10:00:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

export function configFor(app: App, now = new Date()): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const shown = app.routes.slice(0, MAX_PAGES);
  const more = app.routes.length - shown.length;
  const scenes = shown.map((r) => `                { id: ${JSON.stringify(idOf(r))}, title: ${JSON.stringify(titleOf(r))}, path: ${JSON.stringify(r)}, from: null },`).join("\n");
  return `/**
 * Every state of this app on a board, for kanvas: https://github.com/hirahorc/kanvasboard
 *
 * A board per page or flow, a lane per story, a row per kind of state
 * (positive, negative, edge), a scene per state. A scene says how to reach
 * its state: the path, what the browser holds first (seed), what to do on the
 * page (steps), and what the frame shows (view).
 *
 *   npx kanvas snap     every scene, frozen into kanvas/
 *   npx kanvas view     the board
 */
import type { KanvasConfig } from "kanvasboard";

const config = {
  // where the app answers while kanvas snaps it: start it first
  baseUrl: "http://localhost:${app.port}",
  // the "now" every scene runs at, so a date on a page doesn't change between snapshots
  clock: "${morning(now)}",
  timezone: "${timezone}",
  locale: "en-US",
  devices: [
    { id: "desktop", label: "Desktop", width: 1280, height: 800 },
    { id: "mobile", label: "Mobile", width: 390, height: 844, mobile: true },
  ],
  // CSS selectors never part of a state: a dev badge, a cookie banner
  hide: [],
  boards: [
    {
      id: "pages",
      title: "Pages",
      lead: "Every page as it first opens.",
      lanes: [
        {
          id: "first-look",
          title: "First look",
          rows: [
            {
              kind: "positive",
              scenes: [
${scenes}
              ],
            },
          ],
        },
      ],
    },
  ],
} satisfies KanvasConfig;
${more > 0 ? `\n// ${more} more page${more === 1 ? "" : "s"} not listed yet: add the ones that matter\n` : ""}
export default config;
`;
}

const START = "<!-- kanvas:start -->";
const END = "<!-- kanvas:end -->";

/** the block for AGENTS.md / CLAUDE.md: what keeps the board a true map of the app */
export const INSTRUCTIONS = `${START}
## kanvas: every state on a board

\`kanvas.config.ts\` lists this app's states (scenes) on boards; \`kanvas/\` holds each one frozen as a static frame, with its rules and its changelog, and is committed. Keep the board a true map of the app:

- **A change that adds a state adds a scene**: a page, a dialog or sheet, an error, an empty list, a step of a flow. Put it on the board and lane it belongs to, in the row for its kind (\`positive\`, \`negative\`, \`edge\`). A scene says how to reach its state:
  - \`path\`, and a \`seed\` (\`localStorage\`, \`sessionStorage\`, \`cookies\`) that puts the app in that state before it loads;
  - a seed may be a function: it runs at the config's \`clock\`, so \`Date.now() - 9 * DAY\` is nine days before the board's "now" (for states that come with time: overdue, expired, thirsty);
  - \`steps\`, done in order: \`{ click }\`, \`{ fill, text }\`, \`{ select, option }\` (a \`<select>\`), \`{ leave }\`, \`{ see }\`, \`{ show }\`, \`{ press }\`, \`{ top: true }\`, \`{ wait }\`, \`{ hold }\` (before what shows a toast, so it stays). A target is the words on a button or link, or \`{ role, name }\`, \`{ label }\`, \`{ text }\`, \`{ placeholder }\`, \`{ css }\`, with \`contains: true\` to match part of the words, \`within\` (a CSS selector) and \`nth\`;
  - \`view\`: \`"page"\` (the whole page), \`"screen"\` (a dialog, sheet or toast pinned to the screen), or \`{ section: target }\` (one part of a long page);
  - \`from\` (the scene it follows, on any lane or board: an arrow), \`via\` (the action that leads here, on the arrow; for a state that comes with time, say so, e.g. "Nine days later"), \`rules\` and \`note\` (for its drawer), \`devices\` (only some screen sizes).
  - Without \`from\`, a scene follows the one before it in its row; give \`from: null\` to a state that doesn't follow anything.
- A state that's asked for but not built yet is a gap: \`{ id, title, gap: true }\`.
- A change that renames or removes what a scene's steps use updates that scene. \`npx kanvas check\` says which scenes can't be reached.
- **After a commit to main that changes what a page shows**, with the app running: \`npx kanvas check\`, \`npx kanvas snap\`, \`npx kanvas log\` (and \`npx kanvas build\` when the board is served from the app's own files), then commit \`kanvas/\` on its own ("chore(kanvas): frames for …"). Fix a scene the change broke; add one for each state it added. \`snap\` exits 1 when a scene can't be reached: fix it before committing.
- Put who asked for a change in its commit as a \`Source:\` trailer (or name its ticket), so the changelog says it.
- Scene titles, notes and arrow labels are in English: they travel into pasted pictures.
${END}`;

/**
 * Where the instructions go: AGENTS.md (Codex, Cursor and most agents read it),
 * or CLAUDE.md when that's the only one. A CLAUDE.md that doesn't already pull
 * AGENTS.md in gets the block too, and one that doesn't exist yet is made to
 * pull it in (\`@AGENTS.md\`), so Claude Code reads it as well.
 */
export function agentFiles(root: string): { write: string[]; importer?: string } {
  const agents = join(root, "AGENTS.md");
  const claude = join(root, "CLAUDE.md");
  const hasAgents = existsSync(agents);
  const hasClaude = existsSync(claude);
  if (!hasAgents && hasClaude) return { write: [claude] };
  if (!hasClaude) return { write: [agents], importer: claude };
  return /@AGENTS\.md\b/.test(readFileSync(claude, "utf8")) ? { write: [agents] } : { write: [agents, claude] };
}

/** the block written into the agent's file: replaced if it's there, added at the end if not */
export function withInstructions(text: string): string {
  const at = text.indexOf(START);
  const end = text.indexOf(END);
  if (at !== -1 && end > at) return text.slice(0, at) + INSTRUCTIONS + text.slice(end + END.length);
  return `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${INSTRUCTIONS}\n`;
}

export interface InitResult {
  app: App;
  config?: string;
  /** the files the instructions were written into, and a CLAUDE.md made to read AGENTS.md */
  agents: string[];
  importer?: string;
  installed: boolean;
}

export function init(o: { root: string; force?: boolean }): InitResult {
  const app = detect(o.root);
  const configFile = join(o.root, "kanvas.config.ts");
  const exists = ["kanvas.config.ts", "kanvas.config.mts", "kanvas.config.js", "kanvas.config.mjs"].some((f) => existsSync(join(o.root, f)));
  let config: string | undefined;
  if (!exists || o.force) {
    writeFileSync(configFile, configFor(app));
    config = configFile;
  }
  const { write, importer } = agentFiles(o.root);
  for (const f of write) writeFileSync(f, withInstructions(existsSync(f) ? readFileSync(f, "utf8") : ""));
  if (importer) writeFileSync(importer, "@AGENTS.md\n");
  const pkgFile = join(o.root, "package.json");
  const pkg = existsSync(pkgFile) ? (JSON.parse(readFileSync(pkgFile, "utf8")) as { dependencies?: object; devDependencies?: object }) : {};
  const installed = "kanvasboard" in { ...pkg.dependencies, ...pkg.devDependencies };
  return { app, config, agents: write, ...(importer ? { importer } : {}), installed };
}
