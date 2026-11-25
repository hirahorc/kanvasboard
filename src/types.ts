/**
 * What kanvas writes, as types only: the manifest, its frames, the changelog.
 * The viewer reads these in the browser, so nothing here touches Node.
 */
import type { Device } from "./config.js";

export type ViewKind = "page" | "screen" | "section";

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
  /** paths under the output folder: the frozen page, its picture, and a small one (about 360 wide) for a board seen from far */
  html: string;
  png: string;
  thumb?: string;
  htmlHash: string;
  pngHash: string;
  /** what couldn't be frozen faithfully: the frame is shown as its picture */
  fallback?: string[];
  /** a step that couldn't be played: the frame shows where the scene stopped */
  error?: string;
}

export type Cell = { scene: string; from: string | null } | { gap: { id: string; title: string; note?: string; via?: string }; from: string | null };

/** the board as written: everything the viewer needs, nothing it would run */
export interface Manifest {
  kanvas: 1;
  baseUrl: string;
  clock: string;
  /** where the app's pages are for the built board's links (KanvasConfig.site) */
  site?: string;
  /** how the deployed app opens a scene by itself (KanvasConfig.live) */
  live?: { query: string };
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

/** one change, as `kanvas log` writes it (changelog.json) and the drawers show it */
export interface ChangeEntry {
  /** ISO date of the commit */
  date: string;
  /** the newest commit it answers to */
  commit?: string;
  /** every commit since the frames were last written, newest first, when there's more than one */
  commits?: string[];
  /** one line on what changed */
  summary: string;
  /** who asked for it: the PM, marketing, a ticket */
  source?: string;
  /** the scenes it changed; absent with `boards`, a change across a whole board */
  scenes?: string[];
  boards?: string[];
  /** a rule changed, not only the page */
  rule?: boolean;
  /** the scenes are new on the board */
  added?: boolean;
}

export interface Changelog {
  kanvas: 1;
  /** newest first */
  entries: ChangeEntry[];
}
