# Orchestrator pattern: pi subagents (tambor projection)

Canon: `~/.wai/resources/patterns/orchestrator-subagents.md` — invariants
live there; on conflict, canon wins. This file carries tambor specifics only.

Established 2026-10-07 (T1/T2/T3 orchestration round). An early ephemeral
`--no-session` spawn was user-corrected; prompts written to /tmp are lost —
briefs go to `.wai/projects/tambor/briefs/` and are committed before spawn.

## Tambor specifics

- **Verify gates**: vitest suite, lefthook commit hooks (green before push).
- **Spawn**:
  `pi -p -n "subagent:<ticket>:<steps>" "$(cat .wai/projects/tambor/briefs/<ticket>.md)" > .wai/projects/tambor/runs/<ticket>.log 2>&1 &`
  then `tail -f` to poke progress; poll rather than blind-block.
- **Parallel tickets**: one git worktree per ticket under `.worktrees/` on its
  own branch, one named session each, reconcile at merge (npm install per
  worktree).
- **Retry**: fresh named session (`-retry` suffix) after checking git state in
  the worktree (zero commits = clean retry; T2 died on a transient provider
  error and re-spawned clean this way).
- **Status**: `bd list --status in_progress` + worktree `git log` until a
  `just epic-status` recipe exists here.
