# Tasks: add-spa-delivery

## 1. Minify

- [ ] 1.1 Red: build test — `build:spa` output is minified (no
      whitespace-only lines; gzip size floor assertion).
- [ ] 1.2 Green: add `--minify` to the esbuild invocation in
      `package.json`.

## 2. Lazy demos

- [ ] 2.1 Red→Green: the demo registry resolves each example through a
      dynamic `import()`; the initial chunk imports no example module
      transitively (esbuild metafile assertion).
- [ ] 2.2 Gallery e2e green against the chunked load (click-through on
      one representative example per backend).

## 3. PWA shell

- [ ] 3.1 Emit a web manifest (name, icons, display, theme) from the
      build; smoke test asserts it is valid JSON in dist.
- [ ] 3.2 Red→Green: `src/spa/sw.ts` — cache-first for hashed assets,
      network-first for navigation, content-hash versioned cache name;
      unit-test the versioning.
- [ ] 3.3 Register the SW from the SPA mount (dev-safe: skip on
      non-secure origins); e2e offline reload serves the shell.

## 4. Verification

- [ ] 4.1 Bundle numbers recorded (before/after) in the change notes;
      e2e smoke green.
- [ ] 4.2 `ah check` and `openspec validate add-spa-delivery --strict`
      green before archive.
