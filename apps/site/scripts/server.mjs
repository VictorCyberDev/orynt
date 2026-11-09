// Minimal static file server for dist/ (no dependencies). Directory URLs serve index.html; unknown paths serve 404.html with status 404.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8", ".json": "application/json",
};

export function startServer(port = 4173, { leads } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (leads && req.method === "POST" && url.pathname === "/v1/public/leads") return leads(req, res);
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403).end("forbidden"); return; }
    try {
      const s = await stat(file);
      if (s.isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      const body = await readFile(join(root, "404.html")).catch(() => Buffer.from("not found"));
      res.writeHead(404, { "content-type": MIME[".html"] }).end(body);
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
