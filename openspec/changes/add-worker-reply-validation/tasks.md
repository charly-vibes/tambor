# Tasks: add-worker-reply-validation

## 1. Guard

- [ ] 1.1 Red: unit tests — a reply with a non-numeric id, a non-boolean
      ok, or a missing payload fails the guard and delivers a typed
      failure response (`ok: false`) to its pending request.
- [ ] 1.2 Green: implement the type guard in
      `src/components/worker_effect/client.ts` at the message entry
      point, before `pending.deliver`.

## 2. Routing safety

- [ ] 2.1 Red→Green: a malformed reply carrying a foreign id delivers
      nothing — every other pending request keeps waiting (pin against
      the reversed-reply routing property).
- [ ] 2.2 Red→Green: a well-formed reply of an unknown id is dropped
      without delivering to anything, and a null or non-object message
      fails the guard as a typed failure rather than crashing the
      message handler.

## 3. Verification

- [ ] 3.1 Existing worker_effect properties stay green
      (reversed replies, superseded runs, bridge shapes).
- [ ] 3.2 `ah check` and `openspec validate
      add-worker-reply-validation --strict` green before archive.
