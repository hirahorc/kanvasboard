import { execFileSync } from "node:child_process";

const run = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 29 });

/** the repository a folder is in, or null */
export function repoOf(dir: string): string | null {
  try {
    return run(dir, ["rev-parse", "--show-toplevel"]).toString().trim();
  } catch {
    return null;
  }
}

/** a file as it is at `ref` (a path from the repository's root), or null when it isn't there */
export function fileAt(repo: string, ref: string, path: string): Buffer | null {
  try {
    return run(repo, ["show", `${ref}:${path}`]);
  } catch {
    return null;
  }
}

export interface Commit {
  hash: string;
  subject: string;
  body: string;
  /** ISO, the committer's */
  date: string;
}

const SEP = "\x1f";
const END = "\x1e";

function commits(repo: string, args: string[]): Commit[] {
  let out: string;
  try {
    out = run(repo, ["log", `--format=%H${SEP}%s${SEP}%b${SEP}%cI${END}`, ...args]).toString();
  } catch {
    return [];
  }
  return out
    .split(END)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [hash = "", subject = "", body = "", date = ""] = r.split(SEP);
      return { hash, subject, body: body.trim(), date };
    });
}

/**
 * The commits since `path` was last committed, up to `ref`, newest first:
 * what a fresh snapshot of the frames answers to. Null when `path` was never
 * committed (the board's first frames).
 */
export function commitsSince(repo: string, path: string, ref = "HEAD"): Commit[] | null {
  const last = commits(repo, ["-1", ref, "--", path])[0];
  if (!last) return null;
  return commits(repo, [`${last.hash}..${ref}`]);
}

/** the commit at `ref` */
export const commitAt = (repo: string, ref = "HEAD"): Commit | undefined => commits(repo, ["-1", ref])[0];
