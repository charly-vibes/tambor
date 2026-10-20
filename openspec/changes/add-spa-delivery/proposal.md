# Add spa delivery optimization

## Why

The shipped SPA bundle is unminified and monolithic: `dist/spa.js` is
217 KB (56 KB gzip) with `--minify` absent from the `build:spa` esbuild
invocation, and the whole demo gallery rides in the first load although
the library core is only ~5 KB gzip. There is also no PWA at all — no
manifest, no service worker — so the mobile-first library ships no
installable/offline story. Measured and grepped in chat-773745b6.

## What Changes

- `build:spa` adds `--minify` (one flag: 112 KB raw / 38.6 KB gzip
  measured on the current bundle).
- Demo gallery examples load behind dynamic `import()` chunks, keeping
  the core on the critical path and splitting per-example code.
- The build emits a web manifest and a minimal service worker (cache
  the app shell + assets, network-first fallback) so the SPA demos are
  installable and offline-capable; source stays TypeScript, esbuild
  emits the artifact.
- Service worker versioning is content-hash based so updates propagate.

## Impact

- Affected specs: `distribution-packaging` (added requirements).
- Affected code: `package.json` build:spa script, `src/spa/main.ts`
  (lazy demo registry), new `src/spa/sw.ts` + manifest template.
- Affected tests: build-output tests (minified size floor, chunk
  split), a smoke check that the manifest and SW are present in dist,
  existing gallery e2e green against lazy chunks.
- The npm artifact is unchanged — the library package still ships
  dist-only files; PWA artifacts are demo/SPA-shell concerns.
