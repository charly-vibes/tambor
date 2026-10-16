# tambor — what the latest archive adds (supersedes parts of earlier insight files)

Full table in `docs/benchmarks-and-findings.md` §3.1. Headlines:

- Packaging done upstream: barrel + `core`/`spa`/`dom` subpaths, `private:false`, emit config with `rewriteRelativeImportExtensions`, emit/pack/core-split check scripts. **T:** emit verified here (89 JS + 89 `.d.ts`, TypeScript 6.0.3).
- Logo world rebuilt on the real library (`src/examples/logo/`). **T:** emitted interpreter matches the demo's trace counts.
- `EVALUATION.md` re-run against the built library: squint/cherry/macro/`:advanced` all recorded; two seam findings (path materialisation, vector `dissoc`); `:advanced` caveats (`aget`, `#js`). **O (doc), not re-run.**
- Board: epic `tambor-y9d`; `.y9d.2` in progress (demos on real library), `.y9d.4` open (browser tests).
- Not verified here: vitest suite, the repo's pinned TypeScript version, `pack-probe.sh` (needs npm/network).
- Code observations: render cache exists (`model/component-cache.ts`); `bounds()` unmemoised.
