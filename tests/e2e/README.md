# e2e lane notes

## Screenshot policy (tambor-kd5, updated by tambor-v3s)

`tests/screenshots/` is **gitignored** — captures are local dev artifacts,
not committed baselines.

The original reason (platform `system-ui` metrics made every machine
rewrite 73 of 79 PNGs) is gone: the demo shell now bundles Inter
(`assets/fonts/inter-latin.woff2`), `domMeasure` reads the host's computed
font, and both browser entries await `document.fonts.load` before building
a view. With a pinned Chromium the captures are reproducible. They stay
uncommitted because **no test asserts against them** (`screenshot: "off"`
in the Playwright config; `shot()` in `drive.ts` is a side-effect capture):
a golden with no assertion is churn, not regression protection.

How to use:

- **Generate**: any `npx playwright test --config tests/e2e/playwright.config.ts …`
  run writes named captures via `shot()` (per-demo-per-state, project-prefixed).
- **Review on demand**: inspect the fresh PNGs locally or open the demos in
  a browser. Vision-model review is deliberately on demand, never a gate;
  there is no nightly VLM call and no vision cost on a normal PR.
- **Compare across changes**: capture before/after on the *same* machine and
  diff locally. Committing pixel baselines is still a separate decision
  (start from the canonical subset, not all 80+ captures).

## Real-shell visual audit (tambor-v3s)

`visual-audit.spec.ts` measures the **built `demo-dist/index.html`** (what
GitHub Pages serves), not the coordinate fixture. The fixture pins the stage
and zeroes body margins for scripted pointer coordinates; those CSS choices
hide shell-level layout defects. Appearance assertions therefore use
`openSite()` from `drive.ts`.

    npx playwright test --config tests/e2e/playwright.config.ts \
      visual-audit.spec.ts --project=desktop --reporter=line

It walks every `DEMOS` entry at 320/380/800/1440 and writes
`test-results/visual-audit.json` (`auditDrawnDom` in `audit.ts`).

- **Errors (block)**: page horizontal overflow, a nav that overflows with no
  local scroller, missing nav/drawn root, a drawn root outside the viewport,
  root content spilling past its measured height, and text boxes whose
  rendered width disagrees with the host-font measure by more than 2px (the
  renderer's own oracle). Console/page errors also fail the run.
- **Warnings (tracked, not blocking)**: drawn `<button>` mirrors below the
  corpus 44px `mobile_first` floor (`tambor-8cu`), low-contrast inks
  (`tambor-71u`), and leaf text drawn outside the 300px root (`tambor-flq`).
  They stay warnings until their corpus/example fixes land; the JSON is the
  triage artifact.

A `nav` with `overflow-x: auto` is the designed chip scroller and is not a
finding. The page itself must never scroll sideways.