import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isGap, type KanvasConfig, type View } from "./config.js";
import type { Cell, FrameRecord, Manifest, ViewKind } from "./types.js";

export type { ChangeEntry, Changelog, FrameRecord, Manifest, ViewKind } from "./types.js";

export const viewKind = (v: View | undefined): ViewKind => (!v || v === "page" ? "page" : v === "screen" ? "screen" : "section");

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
