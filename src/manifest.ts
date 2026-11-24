import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isGap, type Device, type KanvasConfig, type View } from "./config.js";

export type ViewKind = "page" | "screen" | "section";
export const viewKind = (v: View | undefined): ViewKind => (!v || v === "page" ? "page" : v === "screen" ? "screen" : "section");

/** one scene at one device, as written */
export interface FrameRecord {
  scene: string;
  device: string;
  view: ViewKind;
  /** the frame's size in CSS pixels */
  width: number;
  height: number;
  /** where its document is scrolled to show it (a screen, a section) */
  scroll?: { x: number; y: number };
  /** paths under the output folder */
  html: string;
  png: string;
  htmlHash: string;
  pngHash: string;
  /** what couldn't be frozen faithfully: the frame is shown as its picture */
  fallback?: string[];
  /** a step that couldn't be played: the frame shows where the scene stopped */
  error?: string;
}

type Cell = { scene: string; from: string | null } | { gap: { id: string; title: string; note?: string; via?: string }; from: string | null };

/** the board as written: everything the viewer needs, nothing it would run */
export interface Manifest {
  kanvas: 1;
  baseUrl: string;
  clock: string;
  devices: Device[];
  boards: {
    id: string;
    title: string;
    path?: string;
    lead?: string;
    lanes: {
      id: string;
      title: string;
      ticket?: string;
      story?: string;
      rules?: string[];
      lists?: { title: string; items: string[] }[];
      rows: { kind: "positive" | "negative" | "edge"; cells: Cell[] }[];
    }[];
  }[];
  scenes: Record<string, { title: string; path: string; via?: string; note?: string; rules?: string[]; view: ViewKind; devices: string[] }>;
  frames: Record<string, FrameRecord>;
}

export const frameId = (scene: string, device: string) => `${scene}@${device}`;

/** the config's boards as the manifest keeps them, with each cell's arrow worked out */
export function describe(config: KanvasConfig): Pick<Manifest, "boards" | "scenes"> {
  const scenes: Manifest["scenes"] = {};
  const boards = config.boards.map((b) => ({
    id: b.id,
    title: b.title,
    path: b.path,
    lead: b.lead,
    lanes: b.lanes.map((l) => ({
      id: l.id,
      title: l.title,
      ticket: l.ticket,
      story: l.story,
      rules: l.rules,
      lists: l.lists,
      rows: l.rows.map((r) => {
        let before: string | null = null;
        const cells: Cell[] = r.scenes.map((s) => {
          // absent: the one before it in the row; null: it stands alone
          const from = s.from === undefined ? before : s.from;
          before = s.id;
          if (isGap(s)) return { gap: { id: s.id, title: s.title, note: s.note, via: s.via }, from };
          scenes[s.id] ??= {
            title: s.title,
            path: s.path,
            via: s.via,
            note: s.note,
            rules: s.rules,
            view: viewKind(s.view),
            devices: s.devices ?? config.devices.map((d) => d.id),
          };
          return { scene: s.id, from };
        });
        return { kind: r.kind, cells };
      }),
    })),
  }));
  return { boards, scenes };
}

export function readManifest(out: string): Manifest | null {
  const file = join(out, "manifest.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

/** written with its frames in a stable order, so a commit's diff shows only what changed */
export function writeManifest(out: string, m: Manifest) {
  const frames: Record<string, FrameRecord> = {};
  for (const k of Object.keys(m.frames).sort()) frames[k] = m.frames[k]!;
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify({ ...m, frames }, null, 2)}\n`);
}
