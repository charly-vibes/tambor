# Distribution — recommendation (D, not build-tested)

> **Updated 2026-10-16:** the latest tambor already implements most of this plan (barrel, subpaths, `private:false`, emit config, check scripts); emit verified here — see `tambor-latest.md`. The wanna recommendation below is unchanged.


**tambor → publish first** as an ESM npm package:
1. add a `src/index.ts` barrel; 2. emit JS + `.d.ts` (tsup/tsc; sources use `.ts` specifiers and `noEmit`); 3. subpath exports separating the DOM-free core from DOM/SPA parts; 4. drop `private`; 5. `0.x` semver with provenance-enabled publish; 6. keep Pages demo + `llms.txt`.

**wanna → hold.** Its own reuse comparison says "narrow" and may halt distribution (`wanna-zbn`). Meanwhile consume as a pinned git dependency via `@wanna/*` aliases. If it proceeds, publish only `composition-shell` + `review-indexeddb` with a semantic-reuse claim and the additive compatibility policy.

**Together** — don't make wanna depend on tambor (wanna's value is being headless). Put integration in a thin `wanna-tambor` adapter package; `artifacts/wanna-on-tambor.html` is a prototype of that adapter's shape.

Not verified: that either package builds as described.
