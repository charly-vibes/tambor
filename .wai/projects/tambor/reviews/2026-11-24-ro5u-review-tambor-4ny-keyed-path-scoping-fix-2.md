---
reviews: 2026-11-24-ro5u-review-tambor-4ny-keyed-path-scoping-fix.md
verdict: pass
tags: [pipeline-run:tdd-ro5-2026-11-24-tambor-4ny-todo-rows, pipeline-step:fix-review]
---

# RO5U review — tambor-4ny keyed path scoping fix

Correctness: keyedPath mutates only inside withKeyedSegment (push/pop brackets every visitor descent); array paths = wrapper segments + the array's own enter index, so distinct arrays cannot derive one container path. The collision case is pinned by the 5.1 gated-flip regression (10 svg = unkeyed shape).

Edges: sibling enter indexes are unique so duplicate paths are impossible; splice donation is keyed by inner identity (path scoping cannot shadow it); no throw can interleave push/pop (visitors return values; an exception aborts the whole build, matching the throw-isolation precedent).

Consistency: the oracle fix mirrors tools/gates/testaruda-exec.sh's capture-then-tolerance pattern; the vacuous pass is said out loud per tambor-cpd.

Evidence: full suite 973/973 (exit 0), testaruda vacuous green, ah check 813 passed / 0 execution findings, live-browser flip screenshot (5 rows, all stroked). Bundle +34 B recorded in the budget-seam history.

Verdict: pass — no findings.

