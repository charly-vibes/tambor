# Tasks: add-docs-site

## 1. Content generator

- [ ] 1.1 Red: generator tests — one page module per corpus spec with
      verbatim embedded content (byte-diff against
      `openspec/specs/<name>/spec.md`), provenance preamble carries
      the source path, registry module lists every page with id,
      title, statement and one-line description, and a missing corpus
      exits non-zero naming the path. tests/docs-content-generator.test.ts
- [ ] 1.2 Green: `tools/gen_docs_content.py` emits
      `src/docs/content/generated/` TS data modules (page per spec +
      registry); wire as a build step in `scripts/build-spa.mjs`
      ahead of esbuild.

## 2. Docs shell

- [ ] 2.1 Red: docs mount test — shell renders journey-grouped
      navigation (getting started / guides / reference / examples,
      quadrant-ordered) and a content pane; selecting a section
      renders its page and marks it current; a module declaring no
      group fails the content check. tests/docs-shell.test.ts (jsdom,
      DomBackend wire as in gallery tests).
- [ ] 2.2 Green: `src/docs/main.ts` entry + shell view over
      makeApp/dispatch; page views render generated data modules as
      tambor elems; extract shared host/registry helpers with
      `src/spa/` (imported, not moved).
- [ ] 2.3 Refactor: page-view renderer shared by generated and guide
      modules (same Elem shape), nav registry typed once.

## 3. Keyboard and focus

- [ ] 3.1 Red: keyboard tests — nav reachable and operable by keyboard
      alone (real-DOM controls receive focus), and completing a page
      change moves DOM focus to the content pane heading.
      tests/docs-keyboard.test.ts
- [ ] 3.2 Green: focus effect on navigation (effect-dispatch seam —
      state path + host hook), heading focus target per page.

## 4. Live container sizing

- [ ] 4.1 Red: host test — ResizeObserver callback routes the observed
      size through DomBackend.resize and the re-derived view differs
      at 320 vs 900 px container width. tests/docs-host-sizing.test.ts
      (mock ResizeObserver in jsdom).
- [ ] 4.2 Green: `src/docs/host.ts` — observe the mount container,
      call backend.resize, re-derive; gallery untouched.

## 5. Theme fidelity

- [ ] 5.1 Red: token-audit test — no literal color outside
      `src/docs/theme.ts` (source scan) and contrast ratios computed
      from `ui/theme.ts` token values ≥ 4.5:1 for body-text pairs in
      both schemes. tests/docs-theme.test.ts
- [ ] 5.2 Green: `src/docs/theme.ts` maps docs roles (nav, heading,
      body, code) to existing tokens via colorSchemePref's injected
      matcher; shell views consume only mapped roles.

## 6. Responsive breakpoints

- [ ] 6.1 Red: breakpoint tests — below 600 px the nav renders the
      top-bar dropdown variant (components-select), demo embeds stack
      above prose, and the rendered root at 320 px width fits the
      container with no horizontal overflow. tests/docs-responsive.test.ts
- [ ] 6.2 Green: shell view branches on container width (pure
      re-derivation); breakpoint constant lives in one module.

## 7. Demo embeds

- [ ] 7.1 Red: embed test — a page declaring a demo resolves it
      through the gallery registry behind dynamic import; metafile
      assertion: no example module in the initial docs chunk.
      tests/docs-embeds.test.ts
- [ ] 7.2 Green: embed view reuses the gallery mount pattern;
      registry imported read-only.

## 8. Scrollytelling showcase

- [ ] 8.1 Red: showcase tests — at ≥ 600 px the embedded demo holds a
      constant viewport position while its section scrolls and
      releases at the section end in the same frame with no rendered
      discontinuity (pin activation formula asserted at boundary
      offsets); below 600 px no activation at any offset.
      tests/docs-showcase.test.ts + e2e screenshot pass.
- [ ] 8.2 Green: showcase layout composes scrollview + the
      scrollytelling pin (src/scrollytelling/pin.ts) inside the
      content pane; stacked branch is the pin's inactive flow.

## 9. Curated guides

- [ ] 9.1 Red: content-check test — guide modules resolve every typed
      page id against registry + guides, declare a journey group, and
      external http(s) URLs are extracted: malformed URL fails the
      build naming the page; well-formed URLs land in a link
      inventory for CI verification. tests/docs-guide-links.test.ts
- [ ] 9.2 Green: `tools/check_docs_content.mjs` wired into the build +
      a CI step verifying inventory URLs resolve.
- [ ] 9.3 Red: guide substance test — quickstart module's snippets
      resolve to compiled TS sample modules (type-checked by the
      build); how-to pages declare their named task and verifiable
      outcome. tests/docs-guide-substance.test.ts
- [ ] 9.4 Green: author the starter pages — quickstart (tutorial:
      working todo result, < 15 min, compiled snippets), 2–3 how-tos
      (compose a form; wire drag-scroll; keyboard focus across
      components), core model + when-not-to-use (explanations with
      prerequisites stated); sample modules extracted as real TS.

## 10. Build and delivery

- [ ] 10.1 Red: build test — second esbuild entry emits
      `demo-dist/docs/` with relative chunk paths, initial-shell gzip
      size recorded and asserted, Pages artifact serves `/docs/`
      (serve smoke against demo-dist). tests/docs-delivery.test.ts
- [ ] 10.2 Green: `scripts/build-spa.mjs` gains the docs entry +
      generator step; measure and record the baseline; confirm
      deploy-pages.yml needs no change (publishes demo-dist
      wholesale).
- [ ] 10.3 HITL: visual acceptance pass — screenshots at 320 / 600 /
      900 px in both schemes reviewed against the look-fine bar;
      findings folded back as view fixes (no spec change expected).

## 11. Gates and archive prep

- [ ] 11.1 Full quality gates green: `just test`, `ah check
      --run-tests`, lint, build.
- [ ] 11.2 On approval → apply stage: implement corpus spec
      `openspec/specs/docs-site/` (specodelic dual-format), `ah sync`
      contracts, archive the change per openspec workflow.
