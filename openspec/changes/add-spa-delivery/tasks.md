# Tasks: add-spa-delivery

## 1. Minify

- [x] 1.1 Red: build test — `build:spa` output is minified (no
      whitespace-only lines; gzip size floor assertion).
      tests/spa-delivery.test.ts (p_minify_flag_lands).
- [x] 1.2 Green: the esbuild invocation minifies —
      `scripts/build-spa.mjs` (esbuild JS API; `package.json` build:spa
      now runs it).

## 2. Lazy demos

- [x] 2.1 Red→Green: the demo registry resolves each example through a
      dynamic `import()`; the initial chunk imports no example module
      transitively (esbuild metafile assertion,
      p_examples_split_out_of_initial_chunk). Implementation note:
      `DemoDef.create` became `DemoDef.load(): Promise<App>`;
      mount.ts's own static `todoApp` import moved to src/spa/todo-spa.ts
      (it alone would have pinned the todo example into every initial
      chunk via the npm ./spa subpath).
- [x] 2.2 Gallery e2e green against the chunked load (click-through:
      counter for DOM, notebook for canvas/worker paths). navTo waits
      for the drawn root (drive.ts) — callers cannot race the mount.

## 3. PWA shell

- [x] 3.1 Emit a web manifest (name, icons, display, theme) from the
      build into `demo-dist/`; smoke test asserts it is valid JSON
      there and absent from the npm tarball (`npm pack --dry-run`,
      p_pwa_artifacts_present). Also emitted: icon.svg,
      asset-manifest.json (SW precache list), shell index.html.
- [x] 3.2 Red→Green: `src/spa/sw.ts` — cache-first for hashed assets,
      network-first for navigation, content-hash versioned cache name;
      unit-tested against fake cache/network doubles
      (p_cache_versioned_by_content, p_offline_shell_serves_navigation).
      The version hash reads demo-dist/asset-manifest.json at install
      (no compile-time injection); built as an ESM module worker
      (register { type: "module" }).
- [x] 3.3 Register the SW from the browser entry (`src/spa/main.ts`,
      not mount.ts — the mount is shared demo plumbing also run under
      jsdom), dev-safe: skip on non-secure origins and under automation
      (navigator.webdriver) with an explicit `?sw=1` opt-in; e2e
      offline reload serves the shell (tests/e2e/sw.spec.ts).

## 4. Verification

- [x] 4.1 Bundle numbers recorded (before/after): monolithic
      unminified 217.0 kB raw / 56 kB gzip → minified + chunked
      122.1 kB raw / 52.1 kB gzip total across 36 shipped js files
      (initial chunk carries no example code); npm tarball 312 → 305
      files (demo artifacts no longer ride dist/). e2e smoke green
      (playwright 86 passed).
- [x] 4.2 `ah check` (759 passed, 0 findings) and
      `openspec validate add-spa-delivery --strict` green before
      archive.

## Implementation deviations (recorded)

- Demo artifacts live in `demo-dist/` (not `dist/`): `files: ["dist"]`
  would otherwise ship the PWA shell in the npm tarball; the build
  script also prunes the pre-change bundle leftovers from dist/.
- Workers keep stable entry names (spa.js/worker.js/...): index.html,
  the worker clients and the e2e fixture reference them; the cache
  version hash (over the asset manifest) invalidates stale generations,
  and chunks carry the content hashes.
