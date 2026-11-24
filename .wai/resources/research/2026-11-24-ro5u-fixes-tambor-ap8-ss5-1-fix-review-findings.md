# RO5U-FIXES tambor-ap8 ss5.1 — fix-review findings

Review verdict: pass — no code fixes required.

Findings checked against the landed code (src/render/dom-reuse.ts):
1. Keyed plan array opacity — keyedPlan treats a nested array child as an
   opaque draw; the §2.2 cross-container gate passes (8/8 sim tests).
2. Identity sweep — orphan removal is identity-based over placed ∪
   keptContainers; §5.1 kept-container donation survives nested keyed
   subtrees (mount-built shared element survives across container
   membership changes, verified in tests/keyed-reconciliation-render.test.ts).
3. domsim/domhost move-mirror parity — both backends implement
   drop-old-slot-before-append; the same sim suite exercises the contract.
4. E2E premise — press-blur re-focus moved post-draw (Chrome ignores
   same-task focus() after untrusted pointerdown); identity assertions
   unchanged; stability 5/5 desktop; full e2e 124/124; suite 961/961.
