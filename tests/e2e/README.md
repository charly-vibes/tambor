# e2e lane notes

## Screenshot policy (tambor-kd5)

`tests/screenshots/` is **gitignored** — captures are local dev artifacts,
not committed baselines.

Why: the PNGs are rendered with the *viewing machine's* platform fonts
(system-ui text metrics), so any commit of them is a false diff on every
other machine — 73 of 79 silently rewrote on one foreign-machine e2e run
(chat 773745b6). No test asserts against them (`screenshot: "off"` in the
Playwright config; `shot()` in drive.ts is a side-effect capture), so
committed baselines bought zero regression protection and pure churn.

How to use:

- **Generate**: any `npx playwright test --config tests/e2e/playwright.config.ts …`
  run writes named captures via `shot()` (per-demo-per-state, project-prefixed).
- **Review (HITL)**: inspect the fresh PNGs locally after a run, or open the
  demos directly in a browser (`tests/e2e/gallery.html` via the serve script)
  for interactive review.
- **Compare across changes**: capture before/after on the *same* machine and
  diff locally — never rely on git history for visual baselines.

If a future need arises for automated visual regression, that is a *new*
decision (canvas/image-hash assertions tolerant of font metrics) — do not
re-commit platform-font PNGs.
