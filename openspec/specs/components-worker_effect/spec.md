---
id: components.worker_effect
kind: intent
statement: "WHEN an app dispatches a worker-effect spawn THE worker effect SHALL evaluate a pure handler off-thread and SHALL deliver the handler's value or a typed failure as an effect on the host wire, which stays responsive while the compute runs, with terminate as the one optional stop on the spawned worker."
---

# components.worker_effect

The public worker effect (tambor-54j.8.6): the promotion of the
logo/notebook worker boundary precedent (src/examples/logo/
worker-client.ts, tambor-y9d.10; src/examples/notebook/worker-client.ts,
tambor-54j.9) into a kit component — a pure handler evaluated
off-thread whose result (or typed error) comes back to the host as an
effect, with an OPTIONAL terminate on the client's own spawned worker.
The scope decision (BZ6) is followed exactly: no
kill-switch-as-universal-mechanism — the only stop is the one terminate
on the boundary the client itself spawned; a run is a plain-data
envelope (`{id, handler, input}` → `{id, ok, value}` or
`{id, ok, message}`) spoken identically by the app's bundled browser
worker entry and the node worker_threads harness
(tests/helpers/worker-effect-node.ts), and `runWorkerEffect` catches
every failure into the typed failure branch — a worker entry must never
throw across the boundary (the runNotebook rule). Public through the
interop barrel alongside memo and ring_buffer.

The kit piece the examples lacked is the bridge to the component model's
effect system: `workerEffectHandler(client)` is the EffectFn the app
registers with `defeffect("worker-effect", ...)` — a run is dispatched
as plain effect data (the spawn shape `["worker-effect", handler,
input]`), and the off-thread answer lands through the SAME dispatch as a
typed reply (`["worker-effect-reply", id, value]`) or typed error
(`["worker-effect-error", id, message]`) the app merges into state, the
same per-cell flow the notebook app rides, one shape over. No registry
of its own, no new scheduling — the reply rides the dispatch the effect
system already repaints on, and the handler returns before the reply
lands (a real worker takes as long as the compute takes; the app merges
state on the reply effect).

The client is the notebook client minus the notebook semantics: the
structural WorkerLike seam (no lib.dom), per-request id routing so a
superseded run's late reply resolves only its own promise, the
in-thread fallback answering the same Promise contract when the host
has no Worker (graceful degradation all the way down), the
load-failure downgrade (typed failures for in-flight runs, then the
fallback), and the kill as a ROUND TRIP — terminate() answers in-flight
requests with the typed terminated failure and the NEXT run lazily
respawns a fresh worker, so the boundary stays usable after a stop.
The measured claim the component exists to make: a long compute
off-thread keeps the main wire responsive — the same busy-loop that
stalls the wire for its full duration in-thread leaves only
timer-jitter drift when run through the worker
(benchmarks/findings-kit.md §WE).

## Constraints

| id | kind | expr | traces_to | observes |
|----|------|------|-----------|----------|
| typed_envelope | invariant | every run crosses as plain data — a request carries the handler name, its input and an id echoed back verbatim; a response is the handler's value (ok) or a typed failure carrying its message (ok:false) — and the echoed id routes each reply to exactly its own request, so a late reply never cross-resolves | [[components.worker_effect]] |  |
| pure_handler | invariant | worker-side handlers are pure functions of their input only; runWorkerEffect calls the named handler once per request and catches every failure (a thrown error, an unknown handler name) into the typed failure branch — it never throws across the boundary | [[components.worker_effect]] |  |
| spawn_reply_effects | invariant | in the effect-dispatch bridge a run is spawned as plain effect data (["worker-effect", handler, input]) and the answer lands through the same dispatch as a typed reply (["worker-effect-reply", id, value]) or typed error (["worker-effect-error", id, message]) — the reply rides the dispatch the effect system already repaints on, and the handler returns before the reply lands | [[components.worker_effect]] |  |
| wire_responsive | invariant | a long compute evaluated off-thread never blocks the host wire — while the worker spins, the host's timers (and the dispatch they serve) keep their schedule at timer-jitter scale, where the same compute run in-thread stalls the wire for its full duration | [[components.worker_effect]] |  |
| optional_terminate | invariant | the only termination is the client's own optional terminate(): it ends the spawned worker, answers every in-flight request with the typed terminated failure, and the NEXT run lazily respawns a fresh worker so the boundary stays usable — no kill-switch beyond this one boundary (the BZ6 scope decision) | [[components.worker_effect]] |  |
| degrade_typed | invariant | when the host offers no Worker, or the worker asset fails to load, every run still answers the same typed contract — the in-thread fallback (terminate is a no-op there), or the typed load failure for in-flight runs followed by the fallback — never a stuck promise | [[components.worker_effect]] |  |

## Model

### States

- `attached`
- `stopped`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_send | attached | attached | [[components.worker_effect.pure_handler]] |
| t_stop | attached | stopped | [[components.worker_effect.optional_terminate]] |
| t_respawn | stopped | attached | [[components.worker_effect.optional_terminate]] |
| t_downgrade | attached | stopped | [[components.worker_effect.degrade_typed]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_envelope_parity | unit | [[components.worker_effect.typed_envelope]] | ok, throwing and unknown-handler requests against a real worker | each response is the typed value envelope, the typed failure message, or the unknown-handler failure, with the request's id echoed verbatim |
| p_route | unit | [[components.worker_effect.typed_envelope]] | two in-flight requests whose replies are delivered reversed | each promise resolves with its own request's value — the late reply never cross-resolves |
| p_pure | unit | [[components.worker_effect.pure_handler]] | ok, throwing and unknown-handler requests against runWorkerEffect directly | the value is returned, every failure lands in the typed failure branch (message carried), and no throw escapes |
| p_wire | unit | [[components.worker_effect.wire_responsive]] | the same spin compute off-thread and in-thread (a real worker harness) | the in-thread run's main-wire timer drift covers ~the compute's duration while the off-thread run's drift stays at jitter scale — orders of magnitude under, and the wire serves work the whole spin |
| p_terminate | unit | [[components.worker_effect.optional_terminate]] | an in-flight request terminated mid-flight | it resolves typed-failed with the terminated message and the next run posts to a fresh worker instance (the boundary stays usable) |
| p_fallback | unit | [[components.worker_effect.degrade_typed]] | the host-aware constructor on a host without Worker | worker:false, the same Promise contract answered by the in-thread fallback, terminate a no-op |
| p_load_fail | unit | [[components.worker_effect.degrade_typed]] | a worker whose asset fails to load | the in-flight run resolves as a typed load failure and the next run rides the in-thread fallback |
| p_bridge | unit | [[components.worker_effect.spawn_reply_effects]] | spawn effects dispatched through the bridge handler | the reply lands as ["worker-effect-reply", id, value] (or ["worker-effect-error", id, message] for a failing handler) through the same dispatch |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated test;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_envelope_parity

- **WHEN** ok, throwing and unknown-handler requests against a real worker
- **THEN** each response is the typed value envelope, the typed failure message, or the unknown-handler failure, with the request's id echoed verbatim
- **VERIFIES** [[components.worker_effect.p_envelope_parity]]

#### Scenario: p_route

- **WHEN** two in-flight requests whose replies are delivered reversed
- **THEN** each promise resolves with its own request's value — the late reply never cross-resolves
- **VERIFIES** [[components.worker_effect.p_route]]

#### Scenario: p_pure

- **WHEN** ok, throwing and unknown-handler requests against runWorkerEffect directly
- **THEN** the value is returned, every failure lands in the typed failure branch (message carried), and no throw escapes
- **VERIFIES** [[components.worker_effect.p_pure]]

#### Scenario: p_wire

- **WHEN** the same spin compute off-thread and in-thread (a real worker harness)
- **THEN** the in-thread run's main-wire timer drift covers ~the compute's duration while the off-thread run's drift stays at jitter scale — orders of magnitude under, and the wire serves work the whole spin
- **VERIFIES** [[components.worker_effect.p_wire]]

#### Scenario: p_terminate

- **WHEN** an in-flight request terminated mid-flight
- **THEN** it resolves typed-failed with the terminated message and the next run posts to a fresh worker instance (the boundary stays usable)
- **VERIFIES** [[components.worker_effect.p_terminate]]

#### Scenario: p_fallback

- **WHEN** the host-aware constructor on a host without Worker
- **THEN** worker:false, the same Promise contract answered by the in-thread fallback, terminate a no-op
- **VERIFIES** [[components.worker_effect.p_fallback]]

#### Scenario: p_load_fail

- **WHEN** a worker whose asset fails to load
- **THEN** the in-flight run resolves as a typed load failure and the next run rides the in-thread fallback
- **VERIFIES** [[components.worker_effect.p_load_fail]]

#### Scenario: p_bridge

- **WHEN** spawn effects dispatched through the bridge handler
- **THEN** the reply lands as ["worker-effect-reply", id, value] (or ["worker-effect-error", id, message] for a failing handler) through the same dispatch
- **VERIFIES** [[components.worker_effect.p_bridge]]
