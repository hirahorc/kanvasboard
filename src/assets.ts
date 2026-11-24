import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { request, type APIRequestContext } from "playwright-core";

const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "font/woff2": ".woff2",
  "font/woff": ".woff",
  "font/ttf": ".ttf",
  "font/otf": ".otf",
  "application/font-woff2": ".woff2",
  "application/font-woff": ".woff",
  "text/css": ".css",
  "video/mp4": ".mp4",
};

/**
 * The files frames use (images, fonts), fetched once per run and kept by
 * their content: the same picture on forty frames is one file.
 */
export class Assets {
  private api: Promise<APIRequestContext>;
  private known = new Map<string, Promise<string | null>>();

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    this.api = request.newContext({ ignoreHTTPSErrors: true });
  }

  /** the file's name under the assets folder, or null when it can't be fetched */
  get(url: string): Promise<string | null> {
    let got = this.known.get(url);
    if (!got) {
      got = this.fetch(url);
      this.known.set(url, got);
    }
    return got;
  }

  /** a file kanvas made (a page's stylesheet), kept by its content like the rest: its name */
  put(content: string, ext: string): string {
    const name = createHash("sha1").update(content).digest("hex").slice(0, 16) + ext;
    const path = join(this.dir, name);
    if (!existsSync(path)) writeFileSync(path, content);
    return name;
  }

  /** a stylesheet's text, for one the page couldn't read (another origin) */
  async text(url: string): Promise<string | null> {
    try {
      const res = await (await this.api).get(url, { timeout: 30000 });
      return res.ok() ? await res.text() : null;
    } catch {
      return null;
    }
  }

  private async fetch(url: string): Promise<string | null> {
    try {
      const res = await (await this.api).get(url, { timeout: 30000 });
      if (!res.ok()) return null;
      const body = await res.body();
      const type = (res.headers()["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      const fromUrl = extname(new URL(url).pathname).toLowerCase();
      const ext = EXT[type] ?? (/^\.[a-z0-9]{2,5}$/.test(fromUrl) ? fromUrl : "");
      const name = createHash("sha1").update(body).digest("hex").slice(0, 16) + ext;
      const path = join(this.dir, name);
      if (!existsSync(path)) writeFileSync(path, body);
      return name;
    } catch {
      return null;
    }
  }

  async close() {
    await (await this.api).dispose();
  }
}
