---
id: distribution.packaging
kind: intent
statement: "WHEN the repository is released as an npm artifact THE package SHALL pack, install and import cleanly from a pristine consumer project at 0.x semver, so that the DOM-free core is separable from the DOM and SPA parts."
---

# distribution.packaging

Constraints derived from the interop spec's `esm_named_exports` invariant and
the tambor-y9d.1 brief: at HEAD the package was `"private": true` with no
exports map and no emitted declarations, so nothing could consume the library
outside the repo even though every invariant the corpus demands of a package
(named exports, exports map, no top-level side effects, shipped types) was
already satisfied by the source. The emitted artifact must keep those
invariants and add only packaging.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| packable_metadata | invariant | package.json declares the package non-private at 0.x, carries a files allowlist limited to dist plus package metadata, and npm pack produces a charly-vibes-tambor-0.1.0 tarball containing only those files | [[distribution.packaging]] |
| declarations_emitted | invariant | tsc emit via the build config produces JavaScript and declaration files for the whole src tree, deriving solely from emit-side options, with every strict flag of the dev config inherited untouched and zero new build dependencies | [[distribution.packaging]] |
| clean_esm_import | invariant | installing the packed tarball into a pristine project resolves the root ESM entry and yields at least five named exports with no top-level side effects run at import | [[distribution.packaging]] |
| core_subpath_split | invariant | the exports map separates the DOM-free core subpath exporting model, paths, effect dispatch, events and layout from the spa and dom subpaths, and the core barrel imports no DOM-dependent module transitively | [[distribution.packaging]] |
| corpus_lint_current | invariant | the specodelic corpus linter exits zero on the deployed specs directory after the packaging change lands | [[distribution.packaging]] |

## Model

### States

- `unpacked`
- `packed`
- `published`
- `imported`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_pack | unpacked | packed | [[distribution.packaging.packable_metadata]] and [[distribution.packaging.declarations_emitted]] |
| t_publish | packed | published | [[distribution.packaging.corpus_lint_current]] |
| t_import | packed | imported | [[distribution.packaging.clean_esm_import]] and [[distribution.packaging.core_subpath_split]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_packable | unit | [[distribution.packaging.packable_metadata]] | npm pack in the repo root | the probe packs a charly-vibes-tambor-0.1.0 tarball and the clean project installs it |
| p_declarations | unit | [[distribution.packaging.declarations_emitted]] | the build config | npx tsc emits 83-plus js and 83-plus d.ts files and exits zero without flag changes |
| p_clean_import | unit | [[distribution.packaging.clean_esm_import]] | a pristine project importing the tarball | import of the root entry resolves with at least five named exports |
| p_core_split | unit | [[distribution.packaging.core_subpath_split]] | a pristine project importing the core subpath | the core entry resolves and exports more than the root gate floor while the dom subpath stays out of the core barrel |
| p_lint_green | unit | [[distribution.packaging.corpus_lint_current]] | the deployed specs corpus | the corpus linter exits zero |

## Requirements

### Requirement: Packaging gate mirror

Every property row is verified by exactly one dedicated runnable gate;
contract TOMLs bind each VERIFIES link to its command.

#### Scenario: p_packable

- **WHEN** npm pack runs in the repo root
- **THEN** the probe packs a tambor-0.1.0 tarball and the clean project installs it
- **VERIFIES** [[distribution.packaging.p_packable]]

#### Scenario: p_declarations

- **WHEN** the build config runs
- **THEN** npx tsc emits 83-plus js and 83-plus d.ts files and exits zero without flag changes
- **VERIFIES** [[distribution.packaging.p_declarations]]

#### Scenario: p_clean_import

- **WHEN** a pristine project imports the tarball
- **THEN** import of the root entry resolves with at least five named exports
- **VERIFIES** [[distribution.packaging.p_clean_import]]

#### Scenario: p_core_split

- **WHEN** a pristine project imports the core subpath
- **THEN** the core entry resolves and exports more than the root gate floor while the dom subpath stays out of the core barrel
- **VERIFIES** [[distribution.packaging.p_core_split]]

#### Scenario: p_lint_green

- **WHEN** the deployed specs corpus is linted
- **THEN** the corpus linter exits zero
- **VERIFIES** [[distribution.packaging.p_lint_green]]
