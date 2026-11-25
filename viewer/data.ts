import type { ChangeEntry, Changelog, FrameRecord, Manifest } from "../src/types";

export type { ChangeEntry, FrameRecord, Manifest };
export type Board = Manifest["boards"][number];
export type Lane = Board["lanes"][number];
export type Row = Lane["rows"][number];
export type Cell = Row["cells"][number];
export type Kind = Row["kind"] | "gap";

export interface Data {
  manifest: Manifest;
  changes: ChangeEntry[];
  /** served by `kanvas view`: "Open live" opens the scene in a browser on this machine */
  live: boolean;
}

/** everything the board needs, from beside the page: the manifest, the changelog if there is one */
export async function load(): Promise<Data> {
  const res = await fetch("manifest.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("There's no manifest.json beside this page. Run kanvas snap, then kanvas view or kanvas build.");
  const manifest = (await res.json()) as Manifest;
  const changelog = await fetch("changelog.json", { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<Changelog>) : null))
    .catch(() => null);
  const live = await fetch("api/live", { cache: "no-cache" })
    .then((r) => r.ok)
    .catch(() => false);
  return { manifest, changes: changelog?.entries ?? [], live };
}

export const isGap = (c: Cell): c is Extract<Cell, { gap: unknown }> => "gap" in c;
export const cellId = (c: Cell): string => (isGap(c) ? c.gap.id : c.scene);
export const frameOf = (m: Manifest, scene: string, device: string): FrameRecord | undefined => m.frames[`${scene}@${device}`];

/** the words a kind is told by, beside its mark: a state isn't told by colour alone */
export const KIND_LABEL: Record<Kind, string> = { positive: "Positive", negative: "Negative", edge: "Edge", gap: "Not built" };

/* ---------------------------------------------------------------- the route */

/** `#/<board>@<device>`, `#/<board>/<scene>@<device>`, or `#/<board>/lane:<lane>@<device>` */
export interface Route {
  board?: string;
  device?: string;
  scene?: string;
  lane?: string;
}

export function readRoute(hash = location.hash, search = location.search): Route {
  if (hash && !hash.startsWith("#/")) {
    // a link from before kanvas: `?board=<id>`, with the scene it was at as the hash
    const q = new URLSearchParams(search);
    return { board: q.get("board") ?? undefined, scene: decodeURIComponent(hash.slice(1)) || undefined, device: q.get("device") ?? undefined };
  }
  if (!hash) {
    const q = new URLSearchParams(search);
    if (q.get("board")) return { board: q.get("board")!, device: q.get("device") ?? undefined };
  }
  const [path = "", device] = hash.replace(/^#\/?/, "").split("@");
  const [board, pick] = path.split("/").map(decodeURIComponent);
  if (!pick) return { board: board || undefined, device };
  return pick.startsWith("lane:") ? { board, device, lane: pick.slice(5) } : { board, device, scene: pick };
}

export function routeHash(r: Route): string {
  const pick = r.scene ? `/${encodeURIComponent(r.scene)}` : r.lane ? `/lane:${encodeURIComponent(r.lane)}` : "";
  return `#/${encodeURIComponent(r.board ?? "")}${pick}${r.device ? `@${r.device}` : ""}`;
}

/* ------------------------------------------------------------ the app's pages */

/** a page of the app, from the board: on this machine (kanvas view) at the running app, else where the config says it's deployed */
export const pageUrl = (m: Manifest, live: boolean, path: string) => `${live ? m.baseUrl : (m.site ?? "")}${path}`;

/** a scene opened by the deployed app itself, when it can (KanvasConfig.live) */
export const liveUrl = (m: Manifest, path: string, scene: string) =>
  m.live ? `${m.site ?? ""}${path}${path.includes("?") ? "&" : "?"}${m.live.query}=${encodeURIComponent(scene)}` : undefined;

/* -------------------------------------------------------------- the changes */

/** what changed in a scene, and what changed across its board, newest first */
export function changesOf(all: ChangeEntry[], o: { scene?: string; scenes?: string[]; board: string }): (ChangeEntry & { wide: boolean })[] {
  const mine = new Set(o.scenes ?? (o.scene ? [o.scene] : []));
  return all
    .filter((e) => e.scenes?.some((s) => mine.has(s)) || (!e.scenes?.length && e.boards?.includes(o.board)))
    .map((e) => ({ ...e, wide: !e.scenes?.length }));
}

export const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
