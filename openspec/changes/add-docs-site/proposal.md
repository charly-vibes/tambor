# Add docs site

## Why

tambor's public documentation is currently split between a raw spec corpus
(`openspec/specs/`), a machine-facing index (`ai/llms.txt`), and an
interactive demo gallery with no explanatory text at all
(`src/spa/gallery.ts`). A human evaluating the library has no guides, no
browsable reference, and no place where prose and live demos sit
together. The corpus already proved it can drive generated pages
(`tools/gen_ai_docs.py`), and the library now owns every primitive a
content site needs — scrollview, virtual list, layout combinators, theme
tokens, pinned panel + scrollytelling pin — so the docs site is also the
largest dogfooding surface the project has. Measured in chat-2f5a1c2
session review: no human-facing docs exist.

## What Changes

- New `docs-site` capability: a tambor-rendered documentation SPA
  (`src/docs/`) with a persistent, journey-grouped section nav, a
  scrolling content pane, and four content classes (one per Diátaxis
  quadrant — the documentation-skill audit):
  - **Reference pages** — generated from the corpus at build time, one
    per `openspec/specs/<name>/spec.md`, embedded verbatim under a
    provenance preamble (never hand-edited, never forked — the
    gen_ai_docs EXCL rules carry over); the generator's registry
    carries id, title, statement and a one-line description per page
    (RAG-friendly front matter).
  - **Tutorial** — a quickstart that completes in under 15 minutes to
    a meaningful working result (a running todo app, not hello-world).
  - **How-to** — task-oriented guides ("compose a form", "wire
    drag-scroll") that each lead through one task to a verifiable
    outcome.
  - **Explanation** — core model and when-not-to-use pages.
  All curated guides link into reference pages through typed ids
  validated at build time; external URLs are extracted and checked
  (malformed URLs fail the build, live URLs are verified in CI).
  Where feasible, guide code samples are extracted as compiled TS
  modules so snippets are type-checked and, when they are the demo,
  runnable.
  - **Demo embeds** — interactive demos resolved through the existing
    gallery registry behind the dynamic-import boundary.
- The showcase layout dogfoods the scrollytelling pin: on wide viewports
  a page's demo pins beside the scrolling narrative and releases at
  section end; narrow viewports stack without pinning.
- Responsive delivery the tambor-native way: the docs entry wires a
  live container size (ResizeObserver → `DomBackend.resize`, corpus
  `backend.render.resize_redraws`) and the view re-derives per size —
  nav collapses below a 600 px breakpoint, no horizontal overflow at
  320 px, touch targets lean on the 44 px slop layer.
- Keyboard operability: the site is operable by keyboard alone and a
  page change moves focus to the content pane (SPA focus management —
  audit item; the real-DOM host adapter renders real controls).
- Docs chrome (nav, headings, body, code) consumes only `ui/theme.ts`
  tokens in both `prefers-color-scheme` schemes; both schemes meet WCAG
  AA body-text contrast, checked programmatically from token values.
- Build/delivery: a new esbuild entry emits a chunked docs bundle under
  the Pages artifact at `/docs/`, page content lazy-loaded, initial
  shell within an explicit gzip budget.

## Impact

- Affected specs: `docs-site` (new capability, all requirements ADDED);
  `distribution-packaging` (docs artifact + `/docs/` serving ADDED).
- Affected code: new `src/docs/` (entry, shell view, content views,
  theme module, host wiring), new `tools/gen_docs_content.py` (corpus →
  TS data modules), `scripts/build-spa.mjs` (second entry + content
  check), `.github/workflows/deploy-pages.yml` (unchanged mechanics —
  demo-dist already ships whole-directory), gallery registry reused
  read-only.
- Affected tests: generator unit tests (verbatim, completeness,
  fail-loud), docs mount/e2e tests (nav, resize reflow, breakpoint
  collapse, 320 px overflow, scheme snapshots, pin showcase
  release-no-jump), build metafile test (lazy content chunks, size
  budget).
- Non-goals: re-theming the gallery demos (blocked on tambor-pz6
  component token adoption — follow-up, not this change); search;
  i18n; SEO/SSR (site stays a client-rendered PWA like the demo);
  per-export API reference pages (corpus specs document behavior, not
  the API surface — generating per-symbol pages from the public
  barrels is follow-up tambor-g6z, hosted by the Reference nav group
  this change reserves); usage analytics/TTFS measurement and a
  changelog page (both deferred — recorded here deliberately, not
  silently).
