// Static file server with SPA fallback for the characterization suite.
// Serves a production build directory (default: ./build, override with CHAR_BUILD_DIR).
// Every path that is not an existing file answers with index.html, like `serve -s`.
// /api/* is never answered here: the tests mock it in the browser.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.env.CHAR_BUILD_DIR || "build");
const port = Number(process.env.CHAR_PORT || 5071);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

async function fileOrNull(p) {
  try {
    const s = await stat(p);
    return s.isFile() ? p : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("characterization server: /api must be mocked in the browser");
      return;
    }
    let rel = normalize(decodeURIComponent(url.pathname));
    while (rel.startsWith("/") || rel.startsWith("\\")) rel = rel.slice(1);
    let file = join(root, rel);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    file = (await fileOrNull(file)) || join(root, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": types[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(e));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`characterization server: ${root} on http://127.0.0.1:${port}`);
});
