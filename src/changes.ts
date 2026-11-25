import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { commitAt, commitsSince, fileAt, repoOf, type Commit } from "./git.js";
import { readManifest } from "./manifest.js";
import { looksDifferent } from "./pixels.js";
import type { ChangeEntry, Changelog, Manifest } from "./types.js";

/** a board counts as changed as a whole when this share of its states changed, and at least this many */
const WIDE_SHARE = 0.6;
const WIDE_MIN = 5;

export interface Diff {
  /** scenes whose page looks different */
  changed: string[];
  /** scenes new since the frames were last committed */
  added: string[];
  /** scenes gone from the config */
  removed: string[];
  /** scenes whose rules (or their lane's) changed */
  rules: string[];
  /** scenes whose frozen page was written differently but looks the same: no entry, the files are updated */
  rewritten: string[];
  /** scenes the last snapshot couldn't reach: no entry until they can be */
  failed: string[];
}

interface Where {
  repo: string;
  /** the output folder from the repository's root, with forward slashes */
  path: string;
}

function where(out: string): Where {
  const repo = repoOf(out);
  if (!repo) throw new Error(`${out} isn't in a git repository: the changelog is made from commits`);
  return { repo, path: relative(repo, out).split(sep).join("/") };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const unescape = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** the words a frozen page shows, field values and placeholders included: a copy change is a change, however small */
function wordsOf(html: string): string {
  const body = html.slice(Math.max(0, html.indexOf("<body")));
  const said = [...body.matchAll(/\s(?:value|placeholder|alt)="([^"]*)"/gi)].map((m) => m[1]);
  const text = body.replace(/<(style|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  return unescape(`${text} ${said.join(" ")}`).replace(/\s+/g, " ").trim();
}

/** a frozen page without the ids a framework hands out in order (they move when anything before them does) */
const skeletonOf = (html: string) =>
  html.replace(/\s(?:id|for|aria-(?:controls|labelledby|describedby|owns|activedescendant)|data-radix-[\w-]+)="[^"]*"/g, "");

/**
 * The frames as snapped now, against the frames as committed at `ref` (by
 * default the last commit, which the fresh snapshot hasn't joined yet). A
 * scene changed when its frozen page is written differently and either its
 * words changed (copy, however small) or, past the ids a framework hands out,
 * its picture looks different. A picture that differs by a few pixels of
 * rendering, with the page the same, never counts.
 */
export function diff(o: { out: string; ref?: string }): { diff: Diff; before: Manifest | null; now: Manifest; at: Where } {
  const now = readManifest(o.out);
  if (!now) throw new Error(`no frames in ${o.out}: run kanvas snap first`);
  const at = where(o.out);
  const ref = o.ref ?? "HEAD";
  const raw = fileAt(at.repo, ref, `${at.path}/manifest.json`);
  const before = raw ? (JSON.parse(raw.toString()) as Manifest) : null;
  const d: Diff = { changed: [], added: [], removed: [], rules: [], rewritten: [], failed: [] };
  const reached = (id: string) => !Object.values(now.frames).some((f) => f.scene === id && f.error);
  d.failed = Object.keys(now.scenes).filter((id) => !reached(id));
  if (!before) {
    d.added = Object.keys(now.scenes).filter(reached);
    return { diff: d, before, now, at };
  }
  for (const id of Object.keys(now.scenes)) {
    if (!reached(id)) continue;
    if (!before.scenes[id]) {
      d.added.push(id);
      continue;
    }
    if (!same(before.scenes[id]!.rules, now.scenes[id]!.rules)) d.rules.push(id);
    let looks = false;
    let written = false;
    for (const f of Object.values(now.frames).filter((f) => f.scene === id)) {
      const was = before.frames[`${f.scene}@${f.device}`];
      if (!was || !was.png) {
        looks = true;
        continue;
      }
      if (was.htmlHash === f.htmlHash && same(was.error, f.error)) continue;
      written = true;
      // its words changed (or the scene now stops somewhere else): that's a change, whatever the pixels say
      const oldHtml = fileAt(at.repo, ref, `${at.path}/${was.html}`)?.toString() ?? "";
      const newHtml = existsSync(join(o.out, f.html)) ? readFileSync(join(o.out, f.html), "utf8") : "";
      if (!same(was.error, f.error) || wordsOf(oldHtml) !== wordsOf(newHtml)) {
        looks = true;
        continue;
      }
      // only ids moved
      if (skeletonOf(oldHtml) === skeletonOf(newHtml)) continue;
      // something else in the markup: the picture decides
      const oldPng = fileAt(at.repo, ref, `${at.path}/${was.png}`);
      const newPath = join(o.out, f.png);
      if (!oldPng || !existsSync(newPath) || looksDifferent(oldPng, readFileSync(newPath))) looks = true;
    }
    if (looks) d.changed.push(id);
    else if (written) d.rewritten.push(id);
  }
  d.removed = Object.keys(before.scenes).filter((id) => !now.scenes[id]);
  // a lane's rules hold for its states, so they changed for each of them
  for (const b of now.boards)
    for (const l of b.lanes) {
      const was = before.boards.find((x) => x.id === b.id)?.lanes.find((x) => x.id === l.id);
      if (!was || same(was.rules, l.rules)) continue;
      for (const r of l.rows) for (const c of r.cells) if ("scene" in c && !d.rules.includes(c.scene) && !d.added.includes(c.scene) && !d.failed.includes(c.scene)) d.rules.push(c.scene);
    }
  return { diff: d, before, now, at };
}

/** a commit's subject as a sentence: "feat(checkout): Q2 in marketing's words" → "Q2 in marketing's words" */
const plain = (subject: string) => {
  const s = subject.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** what the commits say changed, in a line */
export function summarize(commits: Commit[]): string {
  const subjects = [...new Set(commits.map((c) => plain(c.subject)).filter(Boolean))];
  if (!subjects.length) return "Changed";
  if (subjects.length <= 3) return subjects.join("; ");
  return `${subjects.slice(0, 3).join("; ")}; and ${subjects.length - 3} more`;
}

/** who asked: a `Source:`, `Asked-by:` or `Requested-by:` trailer, or failing that the tickets the commits name */
export function sourceOf(commits: Commit[]): string | undefined {
  const said = new Set<string>();
  for (const c of commits) for (const m of c.body.matchAll(/^(?:Source|Asked-by|Requested-by):\s*(.+)$/gim)) said.add(m[1]!.trim());
  if (said.size) return [...said].join(", ");
  const tickets = new Set<string>();
  for (const c of commits) for (const m of `${c.subject}\n${c.body}`.matchAll(/\b[A-Z][A-Z0-9]+-\d+\b/g)) tickets.add(m[0]);
  return tickets.size ? [...tickets].join(", ") : undefined;
}

export function readChangelog(out: string): Changelog {
  const file = join(out, "changelog.json");
  if (!existsSync(file)) return { kanvas: 1, entries: [] };
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Changelog;
  } catch {
    return { kanvas: 1, entries: [] };
  }
}

/**
 * The changelog's entries for a fresh snapshot, from the commits since the
 * frames were last committed: what looks different, by scene, or by board
 * when most of a board changed at once (a shared header, a colour); what's
 * new; whose rules changed. They go on top of the changelog as committed, so
 * running it again (for the same commit, or after committing the code it
 * answers to) replaces what an earlier run wrote instead of adding to it.
 */
export function log(o: { out: string; ref?: string; summary?: string; source?: string }): { entries: ChangeEntry[]; diff: Diff } {
  const { diff: d, before, now, at } = diff(o);
  const ref = o.ref ?? "HEAD";
  const since = commitsSince(at.repo, `${at.path}/manifest.json`, ref);
  const head = since?.[0] ?? commitAt(at.repo, ref);
  const commits = since?.length ? since : head ? [head] : [];
  const base: Omit<ChangeEntry, "summary"> = {
    date: head?.date ?? new Date().toISOString(),
    ...(head ? { commit: head.hash } : {}),
    ...(commits.length > 1 ? { commits: commits.map((c) => c.hash) } : {}),
  };
  const summary = o.summary ?? summarize(commits);
  const source = o.source ?? sourceOf(commits);
  const said = { summary, ...(source ? { source } : {}) };
  const entries: ChangeEntry[] = [];

  if (!before) {
    entries.push({ ...base, summary: o.summary ?? "The board's first frames", boards: now.boards.map((b) => b.id), ...(source ? { source } : {}) });
  } else {
    // a board most of whose states changed at once is one entry on the board
    const scenesOn = (b: Manifest["boards"][number]) => [...new Set(b.lanes.flatMap((l) => l.rows.flatMap((r) => r.cells.flatMap((c) => ("scene" in c ? [c.scene] : [])))))];
    const wide = now.boards.filter((b) => {
      const all = scenesOn(b);
      const n = all.filter((s) => d.changed.includes(s)).length;
      return n >= WIDE_MIN && n / all.length >= WIDE_SHARE;
    });
    const covered = new Set(wide.flatMap(scenesOn));
    const own = d.changed.filter((s) => !covered.has(s));
    if (wide.length) entries.push({ ...base, ...said, boards: wide.map((b) => b.id) });
    if (own.length) entries.push({ ...base, ...said, scenes: own });
    if (d.added.length) entries.push({ ...base, ...said, scenes: d.added, added: true });
    if (d.rules.length) entries.push({ ...base, ...said, scenes: d.rules, rule: true });
  }

  // on top of the changelog as committed, not as it lies here: what an earlier run left
  // uncommitted (for a commit since amended, or before the code it answers to was committed) goes
  const committed = fileAt(at.repo, ref, `${at.path}/changelog.json`);
  const changelog = committed ? (JSON.parse(committed.toString()) as Changelog) : { kanvas: 1 as const, entries: [] };
  const mine = head?.hash;
  const kept = mine ? changelog.entries.filter((e) => e.commit !== mine) : changelog.entries;
  writeFileSync(join(o.out, "changelog.json"), `${JSON.stringify({ kanvas: 1, entries: [...entries, ...kept] }, null, 2)}\n`);
  return { entries, diff: d };
}
