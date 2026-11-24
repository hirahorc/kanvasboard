import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
};

/** answers a request itself (true), or leaves it to the files (false) */
export type Api = (req: IncomingMessage, res: ServerResponse, path: string) => boolean | Promise<boolean>;

/**
 * Folders served as they are, on a local port: a path is looked for in each
 * folder in turn, so the board's data and its viewer can live apart.
 */
export function serve(dirs: string | string[], o: { port?: number; api?: Api } = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const roots = (Array.isArray(dirs) ? dirs : [dirs]).map((d) => resolve(d));
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    try {
      if (o.api && (await o.api(req, res, path))) return;
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" }).end((e as Error).message);
      return;
    }
    for (const root of roots) {
      let file = normalize(join(root, path));
      if (!file.startsWith(root)) break;
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) continue;
      res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
      createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((done) =>
    server.listen(o.port ?? 0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise((ok) => server.close(() => ok())) });
    }),
  );
}
