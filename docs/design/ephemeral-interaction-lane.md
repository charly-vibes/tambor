# Ephemeral interaction lane (tambor-54j.3)

Design note for I13 — recorded 2026-10-20, revised after a Rule-of-5 review
(2 CRITICAL findings TypeSafe-verified at 0.97/0.92, 1 HIGH at 0.93).

## Constraint

Corpus (chat-repo cold read, benchmarks-and-findings.md §Constraints): *"ephemeral
lane for 60 Hz interaction state (pan, drag, scroll) — membrane keeps these in
app state, which is a gap to avoid."* Pan offsets, drag positions and scroll
must live OUTSIDE persistent state so 60 Hz pointer streams (a) never enter
history and (b) never trigger full re-derivation or full re-draw per event.

Acceptance (ticket): a replay test proves drag does not enter the persistent
history; a 60 Hz pointer-move benchmark shows flat derive counts.

## Ground truth the first draft got wrong (verified in code)

1. **The 8xm no-op skip does not apply to lane effects.** The skip in
   `src/spa/mount.ts` `wireSurface` fires only when `intents.length === 0`;
   lane effects ARE intents, so a lane batch falls through to
   `backend.draw(full drawn tree)` per event, and `app.dispatch` schedules one
   rAF per dispatch (`src/effects/dispatch.ts`). Reusing event_pure is not a
   mechanism — the lane needs its own draw boundary.
2. **The event model already delivers pointer moves.** `mouse-move` and
   `mouse-move-global` exist with first-match / visit-all delivery rules
   (`openspec/specs/event-model/spec.md`, `src/events/dispatch.ts`); a
   headless `send(mouse-move)` reaches handlers today. `tapEvents` returning
   `[]` for drags (`src/events/event.ts`) concerns only synthetic tap
   down/up pairs, not move delivery.
3. **Move delivery already exists end-to-end.** The DOM/canvas backends
   forward `pointermove` as `mouse-move` (`src/render/dom.ts:141`,
   `src/render/canvas.ts:222` — `normalizeDOMEvent` → `deliver` → router),
   and the SPA mount attaches that wiring (`mount.ts:177 backend.attach`).
   The existing test "pointermove carries the button-down state (drag vs
   hover)" proves the 60 Hz move stream is delivered and routed in the
   mounted demo. `surface-input.ts`'s own `pointermove` listener only
   tracks `lastPos` for the synthetic mouse-up on cancel — the two
   listeners coexist, they do not conflict. Correction 2026-10-20: the
   first draft of this note claimed the surface swallowed moves; that was
   wrong — Phase 0 is already satisfied by prior art (tambor-hyw's
   button-state forwarding), and the remaining work starts at Phase 1.
4. **The effect registry is global** (`src/effects/dispatch.ts`):
   `defeffect` handlers receive `(dispatch, ...args)` only, so a per-app lane
   store is unreachable through the registry and two apps would collide on
   the type name. The per-app channel is the existing `EffectContext`
   extra-keys seam (`[key: string]: unknown`), populated per app by makeApp.

## Design

### Phase 0 — (DONE by prior art) move delivery

`mouse-move` streams are already forwarded and routed (see ground truth 3).
No work; recorded so the plan doesn't re-invent it.

### Phase 1 — lane store + lane effect (corpus)

- **State shape**: per-app ephemeral cell, structurally an atom-like `Cell`
  but not the app state: `{ pan?: {x,y}, drag?: {id, from, to} | null,
  scroll?: {x,y} }`. Owned by makeApp, invisible to `getState()`, single
  mutable slot (latest-wins; queue depth never grows).
- **Write path**: handlers keep returning intents. New registered effect kind
  `["lane", key, updateFn]` mirrors `["update", ...]` semantics but applies to
  the app's lane store, never persistent state. The lane store reaches the
  effect through the per-app `EffectContext` (extra-keys seam) — the global
  registry stays name-collision-free and app-agnostic.
- **Repaint semantics**: a batch whose lane effects changed the lane but whose
  persistent state is unchanged does NOT invalidate the 8xm view cache
  (identity unchanged) and does NOT go through `backend.draw(tree)`.

### Phase 2 — lane-aware draw boundary (corpus, transform first) — LANDED

New surface: a lane-only batch invokes a transform draw — the already-derived
(cached) tree re-drawn under the lane's pan/scroll transform, at cost ∝ moved
pixels, not tree size. This is the BZ2 "pan-as-transform" verdict promoted to
a corpus seam. Landed: `laneTransform` + the `wrap` seam in `src/spa/mount.ts`
(route path skips the re-derive for lane-only batches and draws the cached
tree under the transform; the wireRerender async path wraps every draw, so a
state change mid-interaction keeps the lane's position — lane wins on
position, state wins on structure). Spec: `lane_draw_no_derive` +
`lane_transform_drawn` in the interaction-lane spec (draw-boundary
constraints live there, not backend-render — the boundary is SPA-wire
plumbing; the backend port is unchanged). Tests: tests/spa-lane-draw.test.ts
(4 contracts). Drag overlay (cached tree + dragged shape re-drawn on top) is
Phase 4.

### Phase 3 — replay test + 60 Hz benchmark — LANDED

- Replay (LANDED, tests/lane-replay.test.ts, `p_lane_replay` in the
  interaction-lane spec): a scripted drag (mouse-down starts the lane,
  mouse-move streams lane updates, mouse-up commits the final position as
  the only state-writing event) routed through the wire's dispatch shape;
  the log minus `lane`-typed effects replays onto a fresh app reproducing
  the committed state exactly, with the replay's lane empty. The committed
  output is drawn from state alone (the shape's translate carries the
  committed x/y).
- Benchmark (LANDED, tests/lane-60hz-bench.test.ts, standalone per the
  ticket note — not the 54j.4 harness): 60 synthetic pointer-move events
  over the mounted wire; derive count FLAT across the stream (primary,
  machine-independent), one draw per event, every draw re-using the same
  cached tree object; state identity unchanged. Paired meter (interleaved
  arms, fresh mount per sample, printed unasserted per findings-kit J8):
  lane arm vs state arm (each move commits state — the pre-lane membrane
  shape); on a 400-label tree the lane arm's median sits below the state
  arm's (both pay the same draw walk — the gap is the derivation).

### Phase 4 (child ticket) — drag overlay + spatial index — LANDED

Overlay lane (dragged shape re-drawn from lane position) wired to
`src/model/spatial-index.ts` (54j.10 — whose "revisit after 8xm" trigger is
satisfied). Single-drag scope v1; multi-pointer keyed by pointer id is
explicitly out of scope until a user needs it.

Landed (2026-10-20): (1) the drag overlay seam — a lane entry carries an
overlay renderer `(entry) => Elem`, and `drawWire` in `src/spa/mount.ts`
renders it ON TOP of the lane-transformed tree on every wire draw
(lane-only, state re-derive and async re-render alike); draw-only, so
routing semantics are untouched. Spec: `lane_overlay_drawn` +
`p_lane_overlay_drawn` in interaction-lane; tests/spa-lane-overlay.test.ts
red→green 3/3. (2) the spatial-index router wiring — `dispatchPointerGroup`
(src/events/group-index.ts, split out for the pretender 400-line floor)
serves pointer delivery over groups of ≥64 children from the index
(`hitCandidates`: containing candidates in original-position order, the
exact reverse-walk trial order) with the synthesis carve-out: a subtree
containing a bubble or wrap node keeps the linear walk, because those apply
a function to the child results and may synthesize intents from empty ones
(on_bubble_raw, wrap_on_middleware) — which no bounds containment justifies.
The index is cached on the group's identity (the same trust 8xm's view
cache holds). Spec: `pointer_group_index` + `p_pointer_index_equiv` /
`p_pointer_index_bubble` in event-model; tests/dispatch-hit-index.test.ts.
MEASURED paired: pointer-move over a 10k-child interactive group 2.065 ms
(linear baseline) → 0.084 ms median (~25×) after the wiring. The test
oracle caught its own scene bug pre-wiring: a bubble applies its function
to EVERY event, so a synthesizer later in the array wins a mouse-down that
hits an earlier real child — the topmost-first ordering matters.

## Edge-case rulings

- **Mid-drag state change** (async apply, logo precedent): the state change
  forces one full derive + draw; the lane wins on position, state wins on
  structure; the overlay then resumes against the fresh tree.
- **rAF starvation / hidden tab**: latest-wins per frame; the lane is a single
  mutable slot, so the stream never queues.
- **Commit**: pointer-up emits a normal intent (e.g.
  `["update", :shapes, move-to-final]`) — the only event entering history.
- **Hover reconciliation**: hover (`components-hover`) already consumes
  mouse-move; it stays separate (it is view-scoped ephemeral display state,
  not interaction geometry) — recorded here to prevent drift toward two lane
  mechanisms.

## Acceptance mapping

| Ticket criterion | Phase |
|---|---|
| drag does not enter persistent history (replay test) | 1 + 3 |
| 60 Hz benchmark shows no per-event full re-derivation | 1 + 2 + 3 |
| design note recorded in docs | this file |
