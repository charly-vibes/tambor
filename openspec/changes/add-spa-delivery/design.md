# Design: add-spa-delivery

## Context

`build:spa` bundles `src/spa/main.ts` (which imports the whole demo
gallery) without `--minify`. The library package itself is lean
(0 runtime dependencies, `sideEffects: false`, tree-shakable `./core`
subpath) — only the demo/SPA shell is heavy. No PWA artifacts exist.

## Goals / Non-Goals

- Goals: minified bundle, lazy demo chunks, installable/offline demos
  via manifest + service worker.
- Non-Goals: no change to the npm artifact or export map; no SSR; no
  new runtime dependencies (esbuild already emits chunks and hashed
  names).

## Decisions

### D1. One esbuild invocation per artifact, minify everywhere

`--minify` applies to spa.js, worker.js and notebook-worker.js alike —
the worker payloads are also demo-shipped code.

### D2. Dynamic import boundaries at the example registry

`src/spa/main.ts` keeps a manifest of examples and resolves each via
`import()` so esbuild splits per-example chunks. The gallery index
loads eagerly (tiny), example modules do not.

*Alternative considered:* a bundler plugin config change. Rejected:
the existing esbuild CLI flow already supports this with zero new
dependencies, honoring the packaging constraint of zero new build
dependencies.

### D3. Network-first navigation, cache-first hashed assets

The service worker serves navigation requests network-first with a
cache fallback (offline shell), and hashed asset requests cache-first.
Cache name embeds the content hash so deploys invalidate cleanly; the
worker activates and prunes old caches on version change. Source stays
TypeScript (`src/spa/sw.ts`) — esbuild emits the JS artifact, keeping
the "we don't hand-write JS" position.

## Risks / Trade-offs

- [SW caching can serve stale shells] → network-first navigation plus
  hash-versioned caches bound staleness to one deploy; e2e offline
  reload test pins the behavior.
- [Lazy chunks flash late on slow mobile] → gallery index renders
  synchronously; example load shows a placeholder. Acceptable for the
  demo shell (the library's own critical path is ~5 KB).
