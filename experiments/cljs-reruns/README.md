# cljs-reruns — tambor-y9d.9

**Purpose:** re-run the experiments EVALUATION.md records for R1-R4 at the
pinned versions (squint-cljs 0.15.212, cherry-cljs 0.6.38, shadow-cljs 3.5.7),
against the real built library (`../../dist`, emitted by the repo root's
`npm run build`), and capture per-probe logs as committed evidence.

**Responsibilities:** the probe sources (copied 1:1 from the y9d.3 originals
in `experiments/`, require paths adjusted for this directory, the R4 probe
extended with a re-check of the recorded `clj->js` caveat), the pinned npm
project, and `rerun.sh` which runs everything and tees into `logs/`.

**Rationale:** EVALUATION.md's PASS rows were claims from a single session;
committed command transcripts make them verifiable and diffable at future
pins.

## Reproduce

```sh
cd <repo-root> && npm run build          # emit dist/ (probes import it)
cd experiments/cljs-reruns
npm install
./rerun.sh                               # R1-R4, logs into logs/
```

The shadow-cljs `:advanced` build alone: `npx shadow-cljs release probe &&
node probe-advanced.cjs`.
