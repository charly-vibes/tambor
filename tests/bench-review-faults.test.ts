// Purpose: the scoring suite for the review-faults bench app (tambor-x43
//   B8) — a review/approval workflow over plain data must survive
//   injected faults (duplicate acks, stale acks, lost acks) by
//   construction: typed discriminated unions plus pure handlers, the
//   tambor claim against Elm's framework-runtime answer.
// Responsibilities: pin (a) submitAll moves all 200 drafts exactly once
//   (a second submit is never double-billed), (b) a duplicate ack
//   (echoed id already applied) leaves the queue unchanged and logs a
//   typed duplicate-ack entry, (c) a stale ack (superseded session)
//   likewise, (d) a lost ack re-submits exactly one item exactly once
//   (fresh session stamp, phase untouched) and the honest ack then
//   applies at the new session, (e) final counts are consistent — no
//   item in two states, the fault log fully typed — and (f) the same
//   guarantees hold through the app's ordinary ["update", …] dispatcher
//   wire (the registry-aware path the gallery demo uses).
// Rationale: the correctness bar is assertion-scored, not eyeballed:
//   each fault's "state unchanged" is a deep equality against a
//   snapshot, the exactly-once property is a count, and the summary
//   lines the e2e scenarios guard on are the same derived functions the
//   unit tests check.

import { describe, it, expect } from "vitest";
import {
  ITEM_COUNT,
  REVIEW_PATH,
  ackNext,
  countsLine,
  createReviewFaultsApp,
  faultCounts,
  faultLabel,
  faultLine,
  injectDuplicateAck,
  injectLostAck,
  injectStaleAck,
  phaseCounts,
  rejectNext,
  reviewFaultsState,
  submitAll,
  type FaultKind,
  type ReviewFaultsState,
  type ReviewState,
} from "../src/examples/bench/review-faults.ts";

const FAULT_KINDS: readonly FaultKind[] = [
  "duplicate-ack",
  "stale-ack",
  "lost-ack",
];

function freshState(): ReviewState {
  return reviewFaultsState().review;
}

function countOf(s: ReviewState): number {
  const c = phaseCounts(s.items);
  return c.draft + c.submitted + c.acked + c.rejected;
}

describe("review-faults bench app", () => {
  it("seeds 200 distinct draft items", () => {
    const s = freshState();
    expect(s.items.length).toBe(ITEM_COUNT);
    expect(new Set(s.items.map((i) => i.id)).size).toBe(ITEM_COUNT);
    expect(s.session).toBe(0);
    expect(s.faults).toEqual([]);
    expect(phaseCounts(s.items)).toEqual({
      draft: ITEM_COUNT,
      submitted: 0,
      acked: 0,
      rejected: 0,
    });
  });

  it("submit all moves every draft exactly once", () => {
    const once = submitAll(freshState());
    expect(phaseCounts(once.items)).toEqual({
      draft: 0,
      submitted: ITEM_COUNT,
      acked: 0,
      rejected: 0,
    });
    expect(once.session).toBe(1);
    expect(once.items.every((i) => i.session === 1)).toBe(true);

    // a second submit is never double-billed: phases and stamps hold
    const twice = submitAll(once);
    expect(phaseCounts(twice.items)).toEqual(phaseCounts(once.items));
    expect(twice.items.every((i) => i.session === 1)).toBe(true);
    expect(twice.session).toBe(2);
  });

  it("a duplicate ack leaves the queue unchanged and is logged typed", () => {
    const acked = ackNext(submitAll(freshState()));
    const snapshot = acked.items;
    const after = injectDuplicateAck(acked);
    expect(after.items).toEqual(snapshot);
    expect(after.session).toBe(acked.session);
    expect(after.faults.length).toBe(1);
    expect(after.faults[0]?.kind).toBe("duplicate-ack");
    expect(after.faults[0]?.id).toBe(0);
  });

  it("a stale ack leaves the queue unchanged and is logged typed", () => {
    const submitted = submitAll(freshState());
    const snapshot = submitted.items;
    const after = injectStaleAck(submitted);
    expect(after.items).toEqual(snapshot);
    expect(after.session).toBe(submitted.session);
    expect(after.faults.length).toBe(1);
    expect(after.faults[0]?.kind).toBe("stale-ack");
    // the echo carried the superseded session (one round behind)
    expect(after.faults[0]?.session).toBe(0);
  });

  it("a lost ack re-submits exactly one item exactly once", () => {
    const submitted = submitAll(freshState());
    const after = injectLostAck(submitted);

    // exactly one fresh-stamped item, phase untouched, one log entry
    expect(after.faults.length).toBe(1);
    expect(after.faults[0]?.kind).toBe("lost-ack");
    expect(after.items.filter((i) => i.session === 2).length).toBe(1);
    expect(phaseCounts(after.items)).toEqual(phaseCounts(submitted.items));
    expect(after.items[0]?.phase).toBe("submitted");
    expect(after.session).toBe(2);

    // the re-submitted item's honest ack applies at the new session
    const acked = ackNext(after);
    expect(acked.items[0]?.phase).toBe("acked");
    expect(acked.faults.length).toBe(1);
  });

  it("final counts stay consistent across a mixed fault session", () => {
    let s = submitAll(freshState());
    s = ackNext(s);
    s = ackNext(s);
    s = rejectNext(s);
    s = injectDuplicateAck(s);
    s = injectStaleAck(s);
    s = injectLostAck(s);
    s = ackNext(s);

    const c = phaseCounts(s.items);
    expect(c.draft + c.submitted + c.acked + c.rejected).toBe(ITEM_COUNT);
    // the two count derivations agree item by item (no item in two states)
    expect(c.acked).toBe(s.items.filter((i) => i.phase === "acked").length);
    expect(c.submitted).toBe(
      s.items.filter((i) => i.phase === "submitted").length,
    );
    expect(c.rejected).toBe(s.items.filter((i) => i.phase === "rejected").length);

    // the fault log is fully typed and self-consistent
    expect(s.faults.length).toBe(3);
    expect(s.faults.every((f) => FAULT_KINDS.includes(f.kind))).toBe(true);
    const fc = faultCounts(s.faults);
    expect(fc["duplicate-ack"] + fc["stale-ack"] + fc["lost-ack"]).toBe(3);

    // the derived summary lines agree with the state
    expect(countsLine(s)).toContain("acked 3");
    expect(countsLine(s)).toContain("rejected 1");
    expect(faultLine(s)).toBe("fault log 3 — duplicate 1 · stale 1 · lost 1");
    expect(faultLabel(s.faults[2] as NonNullable<typeof s.faults[2]>)).toBe(
      "lost ack resubmitted — item 3 (session 2)",
    );
  });

  it("the ordinary update intents through the app survive the faults", () => {
    const app = createReviewFaultsApp();
    const apply = (op: (s: ReviewState) => ReviewState): ReviewState => {
      app.dispatch(["update", REVIEW_PATH, op]);
      return (app.getState() as ReviewFaultsState).review;
    };

    let s = apply(submitAll);
    s = apply(injectLostAck);
    s = apply(ackNext);
    s = apply(injectDuplicateAck);
    s = apply(injectStaleAck);

    expect(countsLine(s)).toContain("submitted 199");
    expect(countsLine(s)).toContain("acked 1");
    expect(countsLine(s)).toContain("session 2");
    expect(countOf(s)).toBe(ITEM_COUNT);
    expect(faultLine(s)).toBe("fault log 3 — duplicate 1 · stale 1 · lost 1");
    expect(s.faults.every((f) => FAULT_KINDS.includes(f.kind))).toBe(true);
  });
});
