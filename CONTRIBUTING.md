# Contributing to tambor

All development flows through the spec corpus. This page collects the
workflow detail that used to live in the README; the README stays focused on
using the library.

## Session / repo workflow tooling

- `bd` (beads) for all task tracking — `bd ready`, `bd show`, `bd update --claim`, `bd close`
- `wai status` to orient; reflections in `.wai/resources/reflections/`
- espectacular: `ah check` / `ah doctor` / `ah explain` (see CLAUDE.md blocks)

## Spec → test correspondence (the core loop)

Single-tree authoring (specodelic Rev 18): the corpus IS the openspec tree
(`openspec/specs/<name>/spec.md`, dual-format: `id: spec`, self-contained,
`## Requirements` mirror with one scenario per property). `ah sync` derives
one contract per property into `.espectacular/<spec>/`; while the port has no
fully executable suite yet, each contract is bound to its proptest scaffold
via `tools/scaffold-check.sh`.

The full loop for a spec change:

    # 1. edit openspec/specs/<name>/spec.md (rows, constraints, properties,
    #    Requirements mirror)
    spk lint openspec/specs && spk graph openspec/specs
    spk compile openspec/specs      # regenerate *_props.rs scaffolds
    ah sync                         # derive/refresh contracts
    # 2. wire any new contract: append [[tests.shell]] scaffold binding
    #    (copy the pattern from an existing .espectacular/<spec>/*.toml)
    ah check --run-tests            # verify all contracts

Edits go straight to `openspec/specs/` — it is the authored corpus; there is
no separate deployed copy (tambor-41q retired the flat `specs/` corpus and
`tools/deploy_specs.py`).

## Gates

All wired as hard gates in `lefthook.yml`, mirrored in `.github/workflows/ci.yml`:

- **pre-commit**: `ah check` (structural lint of the single tree, including
  the spk relay), pretender, testaruda doctor, contract-drift gate
  (`ah sync --check`)
- **pre-push**: `ah check --run-tests`, pretender (full), testaruda exec,
  and the non-blocking scaffold-debt report (`tools/scaffold-debt.sh`)
- **CI**: the same gates plus the docs stamp accuracy gate
  (`tools/stamp-docs.sh` + `git diff --exit-code`) — never hand-edit stamped
  regions in README.md/EVALUATION.md; run `tools/stamp-docs.sh` instead
- **deploy-pages**: builds `dist/spa.js`, generates `ai/` (llms.txt +
  per-spec pages) and deploys the site to GitHub Pages

## Docs

- Generated, never hand-edited: stamped facts (see above), `ai/llms.txt` and
  `ai/specs/*.md` (`tools/gen_ai_docs.py`)
- Hand-written prose lives in README.md (user-facing), TRACEABILITY.md
  (membrane → spec mapping), EVALUATION.md (squint/CLJS research spike)
