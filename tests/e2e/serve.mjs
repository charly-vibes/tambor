// Purpose: the Playwright webServer (tambor-y9d.4) — a dependency-free
//   static file server over the repo root so the fixture page loads the
//   esbuild bundle (dist/spa.js) exactly as build:spa produces it.
// Responsibilities: GET-only file serving with .html/.js/.css/.mjs/.svg
//   content types; PORT from the environment (the playwright config
//   passes the fixed test port); 404 for everything else.
// Rationale: vite preview would add a whole dev-server dependency for
//   two static files; ~40 lines of node:http keeps the tooling minimal
//   and reusable by tambor-54j.4 (the overlap note's second Playwright
//   consumer) — the server is only started by the webServer command in
//   playwright.config.ts, never by the vitest suite.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT ?? 4599);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const rel = url.pathname === "/" ? "/tests/e2e/gallery.html" : url.pathname;
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  readFile(file)
    .then((body) => {
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    })
    .catch(() => {
      res.writeHead(404).end("not found");
    });
});

server.listen(PORT, () => {
  console.log(`tambor e2e server on http://localhost:${PORT}`);
});
