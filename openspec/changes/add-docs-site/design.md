# Design: add-docs-site

## Context

The library renders UI as a pure function of state; the docs site is
just another app over that model. Three axes from the session review
bind the design: it must **look fine**, be **responsive**, and carry
**good-quality content**. Each axis maps to existing corpus machinery —
the design question is wiring, not new semantics.

## Decisions

### D1 — Separate SPA entry, shared modules extracted (not moved)

A new `src/docs/` entry rather than growing the gallery. The gallery is
an approved, deployed behavior (tambor-cie.2); docs are a different
surface (content vs. demos). Shared concerns (host wire-up, registry
types) get extracted into modules both import. The docs entry reuses
`makeApp`/`dispatch`/DomBackend exactly like `mount.ts`.

### D2 — Content pipeline: build-time generator → TS data modules

`tools/gen_docs_content.py` reads the corpus and emits typed TS data
modules under `src/docs/content/generated/`:

- one reference page module per corpus spec, embedding `spec.md`
  **verbatim** (string constant, provenance preamble carrying source
  path + corpus id) — the gen_ai_docs rules (EXCL-001/EXCL-002:
  generated, never hand-edited; embedded, never forked) carry over.
- a registry module (ids → titles → statements) consumed by nav and
  link resolution.

Guides are hand-written TS data modules alongside (typed, no new
esbuild loader). Guide→reference links are typed ids; a build-time
content check fails the build on an unresolved id, on a guide id
colliding with a generated id, and on a missing corpus (fail-loud,
matching gen_ai_docs). Verbatim is enforced by a test diffing the
generated string against the corpus file bytes.

Why not markdown-at-runtime: no runtime markdown parser exists in the
corpus, and adding one would fork content rendering away from the
pure-view model. TS data modules render through ordinary tambor views.

### D3 — Responsiveness is view re-derivation, not CSS

The corpus way: `backend.render.resize_redraws` already relayouts on a
new container size. The missing piece is a live size source — the SPA
mount pins a `VIEWPORT` constant. The docs entry adds `src/docs/host.ts`
wiring `ResizeObserver` (container element) → `DomBackend.resize(size)`
and re-deriving the view. The gallery keeps its constant (out of
scope); the helper is written so a later change can adopt it there.

Breakpoints are pure functions of the container width the view already
receives:

- `< 600 px`: single column; nav collapses to a top bar with a
  dropdown (`components-select`); demo embeds stack above prose; the
  pin renders its inactive (native flow) branch — no pinning.
- `≥ 600 px`: sidebar nav + content pane; showcase pages pin the demo
  beside the scrolling narrative via the scrollytelling pin.

Assertions: no horizontal overflow at 320 px (rendered root width ≤
container width), nav collapse renders the dropdown variant, resize
reflow produces a different tree at 320 vs 900 px.

### D4 — Theme fidelity: tokens only, AA checked from token values

Docs chrome consumes `ui/theme.ts` tokens (`background`, `foreground`,
`accent`, `border`, `danger`) resolved per scheme via
`colorSchemePref`'s injected matcher. No literal colors in docs view
code — enforced by a token-audit test. Contrast (WCAG AA, ≥ 4.5:1
body text) is computed from the token values themselves, so the check
breaks the build if a palette change ever breaks readability in either
scheme. Known limitation recorded: embedded gallery demos keep their
current colors until tambor-pz6 lands (components consuming theme
tokens) — the docs chrome around them is compliant either way.

### D5 — Showcase dogfoods the scrollytelling pin

Reference/guide pages that declare a demo embed use the layout:
scrollview pane = Pin boundary containing prose sections; the demo
rides in the Pin body, so it holds viewport-fixed while its section
scrolls and releases at the boundary end (corpus guarantees:
`release_continuous`, `spacer_reserves_height`). This is the library
demonstrating its own headline feature — and doubles as the first
consumer test of `src/scrollytelling/pin.ts` under a real host.
Narrow viewports take the stacked branch (D3), which the pin spec's
stateless activation formula gives us for free.

### D6 — Delivery: `/docs/` under the existing Pages artifact

`build-spa.mjs` gains a second entry emitting to `demo-dist/docs/` with
relative chunk paths; `deploy-pages.yml` is untouched (it publishes
`demo-dist/` wholesale). Page content modules load behind dynamic
imports (add-spa-delivery pattern); a metafile test asserts no content
module rides the initial chunk and the initial docs shell stays within
an explicit gzip budget (baseline recorded at task 9, ceiling = demo
shell's 38.6 KB gzip until measured).

## Risks

- **Corpus text is terse** — reference pages read spec-like, not
  tutorial-like. Mitigation: guides carry the narrative; reference
  pages frame the verbatim spec with the provenance preamble and link
  out to guides.
- **Pin under a real-DOM host is unproven at scale** — the showcase is
  the risk carrier; if pin behavior disappoints, stacked-only shipping
  is a valid fallback (showcase requirement degrades gracefully).
- **Bundle budget** — content modules are strings; measured at task 9
  before any page ships.

## Sequencing

Generator (content exists) → shell (it renders) → host/sizing
(it reflows) → theme (it looks right) → embeds/showcase (it demos) →
guides (it explains) → build/delivery (it ships). Each step is
user-visible on the next.
