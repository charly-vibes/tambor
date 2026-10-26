// Purpose: executable contract tests for the distribution-packaging spec's
//   property rows — the publishable package packs, installs clean-room, the
//   core subpath stays DOM-free, declarations emit, and the corpus lints
//   green.
// Responsibilities: wrap each row's established shell gate (tools/*.sh,
//   spk lint) as a vitest test so every
//   .espectacular/distribution-packaging/*.toml carries a vitest binding
//   (ticket tambor-4e2); one test per property, named `p_<row>: ...` per
//   the TRACEABILITY naming convention.
// Rationale: openspec/specs/distribution-packaging/spec.md is the design
//   authority; the shell gates are each predicate's single source — these
//   tests execute them rather than re-deriving weaker in-process proxies.

// The Node builtins the gate wrapping needs, typed at the use site —
// @types/node is not a project dependency (same test-local pins as
// tambor-core.test.ts).
// @ts-expect-error node:child_process has no type declarations here
import { execSync } from "node:child_process";
import { expect, it } from "vitest";

// Gate timeouts: npm pack + clean-room install and tsc emit are
// subprocess-heavy (flake ruling: budget generously; bench precedent is
// explicit describe budgets, here per-test).

// p_clean_import — derives_from: distribution.packaging.clean_import
// generator: pack + clean-project install — predicate: the root entry
// resolves with at least five named exports
// 240s: npm pack + pristine npm i (the only honest clean-room check)
it("p_clean_import: import of the root entry resolves with at least five named exports", () => {
  execSync("tools/pack-probe.sh", { stdio: "pipe" });
}, 240_000);

// p_packable — derives_from: distribution.packaging.packable
// generator: pack + clean-project install — predicate: the probe packs a
// charly-vibes-tambor tarball and the clean project installs it
// (same gate as p_clean_import: the probe's pack/install steps ARE the
// packability proof; its import assertion is clean_import's)
it("p_packable: the probe packs a charly-vibes-tambor-0.1.0 tarball and the clean project installs it", () => {
  const out = execSync("tools/pack-probe.sh", { stdio: "pipe" }).toString();
  expect(out).toContain("PASS: clean-project ESM import");
}, 240_000);

// p_core_split — derives_from: distribution.packaging.core_split
// generator: emit the build output — predicate: the core entry resolves and
// exports more than the root gate floor while the dom subpath stays out of
// the core barrel
// 120s: full tsc emit + bare-Node dist/core.js import
it("p_core_split: the core entry resolves and exports past the floor with the dom subpath out of the core barrel", () => {
  execSync("tools/core-split-check.sh", { stdio: "pipe" });
}, 120_000);

// p_declarations — derives_from: distribution.packaging.declarations_emitted
// generator: run the build config's emit — predicate: npx tsc emits 83-plus
// js and 83-plus d.ts files and exits zero without flag changes
// 120s: full declaration emit over the src tree
it("p_declarations: npx tsc emits 83-plus js and 83-plus d.ts files and exits zero without flag changes", () => {
  execSync("tools/emit-check.sh", { stdio: "pipe" });
}, 120_000);

// p_lint_green — derives_from: distribution.packaging.lint_green
// generator: run the corpus linter — predicate: spk lint exits zero
// 30s: 31-file corpus lint, subprocess
it("p_lint_green: the corpus linter exits zero", () => {
  const out = execSync("spk lint openspec/specs", { stdio: "pipe" }).toString();
  const report = JSON.parse(out) as { data: { issues: unknown[] } };
  expect(report.data.issues).toEqual([]);
}, 30_000);
