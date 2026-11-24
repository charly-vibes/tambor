---
tags: [pipeline-run:tdd-ro5u-2026-11-24-tambor-ap8-execute-add-keyed-dom-reconciliation, pipeline-step:ship-close]
---

SHIP tambor-ap8 §1: commits 14a3eb6 (feat(render): keyed() + reconcile + view-model transparency, 13 paths) + 14a2f0c (chore(wai): run artifacts, stamps, beads claim export, 17 paths). Ticket tambor-ap8 deliberately KEPT OPEN (§2-§6 remain); tasks.md 1.0-1.5 ticked; issues.jsonl exported+tracked. Gates at commit: lefthook pre-commit (.beads/hooks shims) — ah check, pretender --staged gate 0 new, testaruda doctor, ah sync --check all green; manual: just test-full 939/939, tsc clean, openspec validate --strict valid, scaffold-debt 0, pretender reconcile() split (cyclomatic 13→keyMatch/positionalMatch helpers) after first gate run flagged it. Push deferred to session close per repo policy (pre-push gate: testaruda exec + ah check --run-tests).
