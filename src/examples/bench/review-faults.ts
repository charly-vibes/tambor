// Purpose: the review-faults benchmark app (tambor-x43 B8) — a review
//   session over 200 plain-data items moving draft → submitted →
//   acked/rejected via intents, with deliberate fault injection:
//   duplicate acks, stale acks and lost acks are ordinary intents the
//   typed state machine survives by construction. Mounted as an ordinary
//   gallery demo through the same makeApp/SPA mount path as every other
//   bench app.
// Responsibilities: Phase/ReviewItem/FaultEntry/ReviewState (plain data,
//   discriminated unions only), reviewFaultsState (200 seeded drafts),
//   REVIEW_PATH, applyAck (the echoed-(id, session) guard — applies only
//   a still-submitted item at its own session), ackNext/rejectNext (the
//   honest deliveries), submitAll, the three injections —
//   injectDuplicateAck / injectStaleAck / injectLostAck — phaseCounts,
//   countsLine/faultLine/faultLabel, reviewFaultsView (two stacked
//   control rows, the two summary lines and every fault-log row as
//   fitted labels, all inside the drawn stage) and
//   createReviewFaultsApp.
// Rationale: the tambor claim this bench scores: a typed discriminated
//   union in plain state plus pure handlers gives Elm-grade correctness
//   without a framework runtime — a duplicate or stale ack changes
//   nothing it must not (the echo guard rejects it and the fault log
//   records why), a lost ack re-submits exactly once (fresh session
//   stamp, phase untouched), and no item can occupy two states because
//   phase is one field on one row. Every fault is an ordinary
//   ["update", …] intent through the registry-aware dispatcher — the
//   fault machinery is the app, not a benchmark side door; the vitest
//   suite (tests/bench-review-faults.test.ts) is the scoring harness.
//   Fault-log rows are state-derived, so their text is as long as the
//   echo they record; every drawn line therefore goes through
//   fittedLabels against the live measure — a state the suite never
//   mounts still cannot push a label box across the stage edge.

import { button, spacer, type Elem } from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import { fittedLabels } from "../../views/fit.ts";

// The queue size the bench holds (200 review items).
export const ITEM_COUNT = 200;

// The fault log's cap: newest entries kept, oldest dropped — the log
// can never grow without bound under a fault-storm scenario.
export const MAX_FAULTS = 24;

// The review lifecycle as typed state — one phase field per item, so
// no item can ever occupy two states at once.
export type Phase = "draft" | "submitted" | "acked" | "rejected";

export interface ReviewItem {
  readonly id: number;
  readonly label: string;
  readonly phase: Phase;
  // The submission round that last (re)submitted this item — the
  // session an honest ack echoes back.
  readonly session: number;
}

// The three injected fault kinds, typed — every logged fault names why
// the message was rejected (or, for a lost ack, that it timed out).
export type FaultKind = "duplicate-ack" | "stale-ack" | "lost-ack";

export interface FaultEntry {
  readonly kind: FaultKind;
  readonly id: number;
  readonly session: number;
}

// The machine's state: the queue, the current submission round, and
// the capped fault log. Plain data throughout.
export interface ReviewState {
  readonly items: readonly ReviewItem[];
  readonly session: number;
  readonly faults: readonly FaultEntry[];
}

// The app state root: one keypath holds the whole machine, so every
// op — honest or faulting — is a plain ReviewState → ReviewState
// function applied by the dispatcher.
export interface ReviewFaultsState {
  readonly review: ReviewState;
}

export const REVIEW_PATH: Path = [["keypath", "review"]];

export function reviewItem(id: number): ReviewItem {
  return { id, label: `doc ${id}`, phase: "draft", session: 0 };
}

// The demo's initial state: 200 seeded drafts, session 0, empty log —
// submitting them is the untimed setup op (scenario review-build).
export function reviewFaultsState(): ReviewFaultsState {
  const items = Array.from({ length: ITEM_COUNT }, (_, i) => reviewItem(i));
  return { review: { items, session: 0, faults: [] } };
}

function withFault(s: ReviewState, fault: FaultEntry): ReviewState {
  const faults = [...s.faults, fault].slice(-MAX_FAULTS);
  return { ...s, faults };
}

export interface AckResult {
  readonly state: ReviewState;
  readonly fault: FaultEntry | null;
}

// One ack message carrying its echoed (id, session): it applies iff the
// item is still submitted at exactly that session. Already-handled ids
// are duplicate acks; live items at a superseded session are stale
// acks — both ignored, both typed.
export function applyAck(s: ReviewState, id: number, session: number): AckResult {
  const it = s.items.find((i) => i.id === id);
  if (it === undefined || it.phase !== "submitted") {
    return { state: s, fault: { kind: "duplicate-ack", id, session } };
  }
  if (it.session !== session) {
    return { state: s, fault: { kind: "stale-ack", id, session } };
  }
  const items = s.items.map((i) =>
    i.id === id ? { ...i, phase: "acked" as Phase } : i,
  );
  return { state: { ...s, items }, fault: null };
}

// The oldest still-submitted item (queue order = review order).
function firstSubmitted(items: readonly ReviewItem[]): ReviewItem | undefined {
  return items.find((i) => i.phase === "submitted");
}

// Honest ack: the reviewer's answer for the oldest submitted item
// arrives, echoing that item's own session — always applies.
export function ackNext(s: ReviewState): ReviewState {
  const it = firstSubmitted(s.items);
  return it === undefined ? s : applyAck(s, it.id, it.session).state;
}

// Honest denial: the reviewer rejects the oldest submitted item.
export function rejectNext(s: ReviewState): ReviewState {
  const it = firstSubmitted(s.items);
  if (it === undefined) return s;
  const items = s.items.map((i) =>
    i.id === it.id ? { ...i, phase: "rejected" as Phase } : i,
  );
  return { ...s, items };
}

// Submit every draft into a fresh session round. Already-submitted
// items keep their own session stamp — a submit is never double-billed.
export function submitAll(s: ReviewState): ReviewState {
  const session = s.session + 1;
  const items = s.items.map((i) =>
    i.phase === "draft" ? { ...i, phase: "submitted" as Phase, session } : i,
  );
  return { ...s, session, items };
}

// Duplicate ack: replay the ack of an item that already left
// `submitted` (first acked, else first rejected). The echoed id is
// already applied — the guard ignores the message, the log records it.
export function injectDuplicateAck(s: ReviewState): ReviewState {
  const it =
    s.items.find((i) => i.phase === "acked") ??
    s.items.find((i) => i.phase === "rejected");
  if (it === undefined) return s;
  const r = applyAck(s, it.id, it.session);
  return r.fault === null ? s : withFault(r.state, r.fault);
}

// Stale ack: an ack for the oldest submitted item carrying a session
// one round behind its stamp — the echoed-session guard ignores it.
export function injectStaleAck(s: ReviewState): ReviewState {
  const it = firstSubmitted(s.items);
  if (it === undefined) return s;
  const r = applyAck(s, it.id, it.session - 1);
  return r.fault === null ? s : withFault(r.state, r.fault);
}

// Lost ack: the oldest submitted item's ack times out — the item
// re-submits into a fresh session (stamp bumped, phase untouched) and
// the timeout lands in the fault log. Exactly one item moves.
export function injectLostAck(s: ReviewState): ReviewState {
  const it = firstSubmitted(s.items);
  if (it === undefined) return s;
  const session = s.session + 1;
  const items = s.items.map((i) => (i.id === it.id ? { ...i, session } : i));
  return withFault({ ...s, session, items }, {
    kind: "lost-ack",
    id: it.id,
    session,
  });
}

export interface PhaseCounts {
  readonly draft: number;
  readonly submitted: number;
  readonly acked: number;
  readonly rejected: number;
}

// Counts per phase — the queue summary the view draws and the
// consistency check sums (every item counted exactly once).
export function phaseCounts(items: readonly ReviewItem[]): PhaseCounts {
  const c: Record<Phase, number> = { draft: 0, submitted: 0, acked: 0, rejected: 0 };
  for (const i of items) c[i.phase] += 1;
  return c;
}

export function faultCounts(faults: readonly FaultEntry[]): Record<FaultKind, number> {
  const c: Record<FaultKind, number> = {
    "duplicate-ack": 0,
    "stale-ack": 0,
    "lost-ack": 0,
  };
  for (const f of faults) c[f.kind] += 1;
  return c;
}

// The queue summary line: counts per state + the submission round.
export function countsLine(s: ReviewState): string {
  const c = phaseCounts(s.items);
  return `draft ${c.draft} · submitted ${c.submitted} · acked ${c.acked} · rejected ${c.rejected} · session ${s.session}`;
}

// The fault-log summary line: total + per-kind counts.
export function faultLine(s: ReviewState): string {
  const f = faultCounts(s.faults);
  return `fault log ${s.faults.length} — duplicate ${f["duplicate-ack"]} · stale ${f["stale-ack"]} · lost ${f["lost-ack"]}`;
}

const FAULT_TEXT: Record<FaultKind, string> = {
  "duplicate-ack": "duplicate ack ignored",
  "stale-ack": "stale ack ignored",
  "lost-ack": "lost ack resubmitted",
};

// One drawn fault entry: typed kind, echoed id, echoed session.
export function faultLabel(e: FaultEntry): string {
  return `${FAULT_TEXT[e.kind]} — item ${e.id} (session ${e.session})`;
}

// One op button: an ordinary handler returning its plain-data update.
function opButton(text: string, op: (s: ReviewState) => ReviewState): Elem {
  return button(text, (): IntentList => [["update", REVIEW_PATH, op]]);
}

// The view: two stacked control rows (one row of six measures 579 px
// after the 44 px button floor), the queue summary, the fault summary,
// then the newest fault entries. The two summary lines and every
// state-derived fault row run through fittedLabels so a long line
// becomes several single-line labels instead of a box crossing the
// stage edge; rows and their order are untouched. Pure view — every
// number is derived from the plain state, nothing cached.
export function reviewFaultsView(state: ReviewFaultsState): Elem {
  const s = state.review;
  const controls = verticalLayout(
    [
      horizontalLayout([
        opButton("Submit all", submitAll),
        spacer(5, 0),
        opButton("Ack next", ackNext),
        spacer(5, 0),
        opButton("Reject next", rejectNext),
      ]) as Elem,
      horizontalLayout([
        opButton("Duplicate ack", injectDuplicateAck),
        spacer(5, 0),
        opButton("Stale ack", injectStaleAck),
        spacer(5, 0),
        opButton("Drop ack", injectLostAck),
      ]) as Elem,
    ],
    6,
  ) as Elem;
  const log = s.faults.slice(-8).flatMap((e) => fittedLabels(faultLabel(e)));
  const body = [
    controls,
    spacer(0, 10),
    ...fittedLabels(countsLine(s)),
    ...fittedLabels(faultLine(s)),
    ...log,
  ] as readonly Elem[];
  return (verticalLayout(body) ?? controls) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createReviewFaultsApp(): App {
  return makeApp({
    view: (state) => reviewFaultsView(state as ReviewFaultsState),
    state: reviewFaultsState(),
    backend: { containerSize: VIEWPORT },
  });
}
