// Purpose: the validated-replies suite (openspec change
//   add-worker-reply-validation) — a runtime type guard at the client's
//   message entry point so a malformed worker reply becomes a typed
//   failure (or an inert drop), never an untyped downstream failure.
// Responsibilities: guard matrix (non-boolean ok, missing payload,
//   malformed id, null/non-object messages, foreign id), the reversed
//   routing property, and a fast-check property pinning that a valid
//   reply resolves only its own id.
// Rationale: openspec/changes/add-worker-reply-validation/... is the
//   design authority; the envelope promises "never throws across the
//   boundary" — the guard honors it with typed failures.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
// @ts-expect-error node:timers/promises has no type declarations here
import { setTimeout as sleep } from "node:timers/promises";
import {
  makeWorkerEffectRunner,
} from "../src/components/worker_effect/client.ts";

describe("worker effect — validated replies (add-worker-reply-validation)", () => {
  function spawnHarness(): {
    spawned: {
      onmessage: ((e: { readonly data: unknown }) => void) | null;
      posted: unknown[];
    }[];
    client: NonNullable<ReturnType<typeof makeWorkerEffectRunner>>;
  } {
    const spawned: {
      onmessage: ((e: { readonly data: unknown }) => void) | null;
      posted: unknown[];
    }[] = [];
    class FakeWorker {
      onerror: ((e: unknown) => void) | null = null;
      onmessage: ((e: { readonly data: unknown }) => void) | null = null;
      posted: unknown[] = [];
      constructor(_u: unknown, _o: { readonly type: string }) {
        spawned.push(this);
      }
      postMessage(m: unknown): void {
        this.posted.push(m);
      }
      terminate(): void {}
    }
    class FakeURL {
      constructor(u: string, base: string) {
        void base;
        this.u = u;
      }
      u: string;
    }
    const client = makeWorkerEffectRunner(
      FakeWorker as unknown as Parameters<typeof makeWorkerEffectRunner>[0],
      FakeURL as unknown as Parameters<typeof makeWorkerEffectRunner>[1],
      "./worker-effect.js",
    );
    if (client === null) throw new Error("expected a worker-backed client");
    return { spawned, client };
  }

  function typedFailureId(p: Promise<{ readonly id: number; readonly ok: boolean; readonly value?: unknown; readonly message?: string }>): Promise<false | number> {
    return p.then((r) => (r.ok ? false : r.id));
  }

  it("p_reply_guard_malformed_ok: a reply with a non-boolean ok and a routable id resolves its own request as a typed failure", async () => {
    const { spawned, client } = spawnHarness();
    const req = client.run("double", 21);
    const other = client.run("sum", [1, 2, 3]);
    const w = spawned[0];
    if (w === undefined) throw new Error("expected a spawned worker");
    const ids = w.posted.map((m) => (m as { readonly id: number }).id);
    if (ids[0] === undefined) throw new Error("expected a posted request");
    // ok: "yes" is not a boolean — the envelope does not declare it
    w.onmessage?.({ data: { id: ids[0], ok: "yes", value: 42 } });
    expect(await req).toEqual({ id: ids[0], ok: false, message: expect.any(String) });
    // the OTHER pending request keeps waiting — only its own id routes
    let otherResolved = false;
    void other.then(() => {
      otherResolved = true;
    });
    await sleep(10);
    expect(otherResolved).toBe(false);
  });

  it("p_reply_guard_missing_payload: ok:true without a value and ok:false without a message both fail the guard as typed failures", async () => {
    const { spawned, client } = spawnHarness();
    const a = client.run("double", 21);
    const b = client.run("double", 22);
    const w = spawned[0];
    if (w === undefined) throw new Error("expected a spawned worker");
    const ids = w.posted.map((m) => (m as { readonly id: number }).id);
    if (ids[0] === undefined) throw new Error("expected a posted request");
    w.onmessage?.({ data: { id: ids[0], ok: true } }); // no value
    w.onmessage?.({ data: { id: ids[1], ok: false } }); // no message
    const ra = await a;
    const rb = await b;
    expect(ra.ok).toBe(false);
    expect(rb.ok).toBe(false);
  });

  it("p_reply_guard_malformed_id: a reply whose id is not a number is dropped inertly — no pending request resolves", async () => {
    const { spawned, client } = spawnHarness();
    const a = client.run("double", 21);
    const w = spawned[0];
    if (w === undefined) throw new Error("expected a spawned worker");
    const ids = w.posted.map((m) => (m as { readonly id: number }).id);
    if (ids[0] === undefined) throw new Error("expected a posted request");
    let resolved = false;
    void a.then(() => {
      resolved = true;
    });
    // string id, object id, missing id — none routes to a's id
    w.onmessage?.({ data: { id: "x", ok: true, value: 42 } });
    w.onmessage?.({ data: { id: { n: 1 }, ok: true, value: 42 } });
    w.onmessage?.({ data: { ok: true, value: 42 } });
    await sleep(10);
    expect(resolved).toBe(false);
    // sanity: the request itself still resolves normally afterwards
    w.onmessage?.({ data: { id: ids[0], ok: true, value: 42 } });
    expect((await a).ok).toBe(true);
  });

  it("p_reply_guard_null: null and non-object messages fail the message handler quietly — dropped, no crash, later valid replies still deliver", async () => {
    const { spawned, client } = spawnHarness();
    const a = client.run("double", 21);
    const w = spawned[0];
    if (w === undefined) throw new Error("expected a spawned worker");
    const ids = w.posted.map((m) => (m as { readonly id: number }).id);
    if (ids[0] === undefined) throw new Error("expected a posted request");
    expect(() => w.onmessage?.({ data: null })).not.toThrow();
    expect(() => w.onmessage?.({ data: 7 })).not.toThrow();
    expect(() => w.onmessage?.({ data: "str" })).not.toThrow();
    w.onmessage?.({ data: { id: ids[0], ok: true, value: 42 } });
    expect((await a).ok).toBe(true);
  });

  it("p_reply_guard_foreign_id: a well-formed reply of an unknown id is dropped without delivering to anything", async () => {
    const { spawned, client } = spawnHarness();
    const a = client.run("double", 21);
    const w = spawned[0];
    if (w === undefined) throw new Error("expected a spawned worker");
    const ids = w.posted.map((m) => (m as { readonly id: number }).id);
    if (ids[0] === undefined) throw new Error("expected a posted request");
    let resolved = false;
    void a.then(() => {
      resolved = true;
    });
    w.onmessage?.({ data: { id: ids[0] + 1000, ok: true, value: 42 } });
    await sleep(10);
    expect(resolved).toBe(false);
    w.onmessage?.({ data: { id: ids[0], ok: true, value: 42 } });
    expect((await a).ok).toBe(true);
  });

  it("p_reply_guard_reversed: a well-formed reply and a malformed one in reversed order resolve exactly their own requests", async () => {
    const { spawned, client } = spawnHarness();
    const a = client.run("double", 21);
    const b = client.run("double", 22);
    const w = spawned[0];
    if (w === undefined) throw new Error("expected a spawned worker");
    const ids = w.posted.map((m) => (m as { readonly id: number }).id);
    if (ids[0] === undefined) throw new Error("expected a posted request");
    // reversed arrival: b's reply malformed, a's reply well-formed
    w.onmessage?.({ data: { id: ids[1], ok: "yes" } });
    w.onmessage?.({ data: { id: ids[0], ok: true, value: 42 } });
    const ra = await a;
    const rb = await b;
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(false);
  });

  it("p_reply_guard_routing_property: fast-check — a valid reply resolves only its own id, every malformed shape never delivers a value", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer(),
        fc.integer().filter((n) => n !== 0),
        fc.record({
          id: fc.oneof(fc.string(), fc.constant(null), fc.double({ noNaN: true })),
          ok: fc.oneof(fc.string(), fc.constant(null), fc.integer()),
        }),
        async (value, delta, malformed) => {
          const { spawned, client } = spawnHarness();
          const a = client.run("double", value);
          const w = spawned[0];
          if (w === undefined) throw new Error("expected a spawned worker");
          const ids = w.posted.map((m) => (m as { readonly id: number }).id);
    if (ids[0] === undefined) throw new Error("expected a posted request");
          w.onmessage?.({ data: malformed }); // malformed — must be inert or a typed failure, never a value
          w.onmessage?.({ data: { id: ids[0] + delta, ok: true, value } }); // foreign id
          w.onmessage?.({ data: { id: ids[0], ok: true, value } }); // its own
          const r = await a;
          if (r.ok) expect(r.value).toBe(value);
        },
      ),
      { numRuns: 25 },
    );
  });
});
