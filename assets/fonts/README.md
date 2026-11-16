# Demo-shell font

`inter-latin.woff2` is the latin subset of Inter (variable weight), the
font the demo shell declares as `"Tambor UI"`. It makes view layout and
rendered glyphs agree across machines: `domMeasure` reads the host's
computed font (`src/spa/mount.ts`) and the browser entries await
`document.fonts.load` before building any view.

- Source: Google Fonts, Inter v20 latin subset (`U+0000-00FF` + Latin
  Extended punctuation), fetched 2026-11-16.
- License: SIL Open Font License 1.1 — see `LICENSE-Inter.txt`.
- Build: `scripts/build-spa.mjs` copies it to `demo-dist/fonts/` and the
  generated demo/docs shells reference it relative to their own tree.
