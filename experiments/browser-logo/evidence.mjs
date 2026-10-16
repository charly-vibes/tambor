// Purpose: the evidence runner for the y9d.7 browser-artifact assessment —
//   serves each artifact over a local HTTP server that sets a STRICT CSP
//   (script-src 'self', no 'unsafe-inline', no 'unsafe-eval', default-src
//   'none'), opens it in headless chromium (playwright), waits for the
//   in-browser self-checks to publish window.__results, captures a full-
//   page screenshot per build, and writes evidence/evidence.json.
// Responsibilities: the HTTP server with CSP headers (serving-time CSP,
//   on top of the artifact's <meta> CSP); the chromium run; the pass
//   assertion; the evidence JSON (build, results, CSP scan counts of
//   eval/new Function/import( in the bundles); screenshots.
// Rationale: "runs locally in a browser" must be falsifiable: a strict
//   CSP forbidding eval is exactly the constraint the cherry question
//   is about, so the artifact is run under it rather than described.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8931;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};
// strict CSP on every response — no unsafe-inline, no unsafe-eval
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
  const file = path.join(root, rel === "" ? "artifact-squint/index.html" : rel);
  if (!file.startsWith(root)) {
    res.writeHead(403); res.end("forbidden"); return;
  }
  readFile(file).then(
    (data) => {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Content-Security-Policy": CSP });
      res.end(data);
    },
    () => { res.writeHead(404); res.end("not found"); },
  );
});

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

async function cspScan(bundle) {
  const text = await readFile(path.join(root, bundle), "utf8");
  return {
    eval: countMatches(text, /\beval\(/g),
    newFunction: countMatches(text, /new Function\b/g),
    dynamicImport: countMatches(text, /\bimport\(/g),
    documentWrite: countMatches(text, /document\.write\b/g),
    bytes: Buffer.byteLength(text),
  };
}

await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));

const results = { startedAt: new Date().toISOString(), csp: CSP, builds: {} };
let overall = true;

const browser = await chromium.launch();
try {
  for (const build of ["squint", "cherry"]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1600 } });
    const consoleLines = [];
    page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${PORT}/artifact-${build}/index.html`, { timeout: 15000 });
    await page.waitForFunction(() => window.__results != null, null, { timeout: 15000 });
    // give innerHTML rendering a beat, then screenshot the whole page
    await page.waitForTimeout(500);
    const shot = path.join(root, "evidence", `${build}-browser.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const data = await page.evaluate(() => window.__results);
    results.builds[build] = { ...data, screenshot: `evidence/${build}-browser.png`, console: consoleLines, cspScan: await cspScan(`artifact-${build}/bundle.js`) };
    console.log(`[${build}] pass=${data.pass} checks=${data.checks.length}`);
    if (!data.pass) overall = false;
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

results.overallPass = overall;
results.finishedAt = new Date().toISOString();
await (await import("node:fs/promises")).writeFile(
  path.join(root, "evidence", "evidence.json"),
  JSON.stringify(results, null, 2),
);
console.log(overall ? "EVIDENCE: all builds PASS under strict CSP" : "EVIDENCE: FAILURE");
process.exit(overall ? 0 : 1);
