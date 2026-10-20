# Add worker reply validation

## Why

`src/components/worker_effect/client.ts` resolves pending requests with
`e.data as WorkerEffectResponse` — a blind cast. The worker is
same-origin and the protocol is ours, but a malformed or stale message
today resolves a promise with a wrong-shaped value silently, turning a
protocol regression into an untyped downstream failure. The envelope
contract already promises "never throws across the boundary"; a typed
failure at the boundary is the cheapest way to honor it.

## What Changes

- Add a runtime type guard on every worker message before delivery:
  the reply must be a plain object with a numeric `id`, a boolean `ok`,
  and (per envelope) either a `value` or a typed failure carrying its
  `message`.
- A message failing the guard delivers a typed failure response
  (`ok: false`) to the pending request whose id it echoes — the
  queue resolves every reply, never rejects; an unrouteable message
  is dropped without delivering to any other request.
- No change to the worker side, the envelope encoding, or the
  spawn/effects bridge.

## Impact

- Affected specs: `components-worker_effect` (added requirement).
- Affected code: `src/components/worker_effect/client.ts` (message
  entry point only).
- Affected tests: new fast-check/unit tests for the guard (malformed
  shapes, foreign-id replies, wrong-type id/ok); existing routing and
  supersede properties stay green.
