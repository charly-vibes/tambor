// @vitest-environment jsdom
// Purpose: the runtime-invalidation composed-offsets pin (stream-
//   dashboard, RO5U L4) — composed per-ticker wrapper offsets equal the
//   flat verticalLayout offsets on the seeded stream-dashboard state.
// Responsibilities: pin the composed root shape (8 head rows,
//   TICKER_COUNT per-ticker wrappers, 1 tail stack), that every
//   wrapper's offset relative to the first row equals the offset
//   verticalLayout gives the same ticker's first fitted label in one
//   flat stack of all rows' labels, that the first row starts one
//   head-extent below the origin, and that the tail stack (the H1
//   single translated stack) starts exactly one rows-extent below the
//   first row.
// Rationale: openspec/changes/add-runtime-invalidation/spec.md is the
//   contract authority; the pin compares the composed root against the
//   layout module itself (verticalLayout + fittedLabels, gap included)
//   rather than re-deriving the accumulation by hand. Split from
//   tests/runtime-invalidation.test.ts (the 400-line test-file gate);
//   the commit, subscription and render halves live in
//   runtime-invalidation-commits.test.ts and
//   runtime-invalidation-render.test.ts, with the shared mount rig in
//   tests/helpers/runtime-invalidation-rig.ts.

import { describe, expect, it } from "vitest";

import {
  height,
  origin,
  spacer,
  type Elem,
  type TranslateNode,
} from "../src/views/model.ts";
import { verticalLayout } from "../src/views/layout.ts";
import { fittedLabels } from "../src/views/fit.ts";
import {
  build1000History,
  createStreamDashboardApp,
} from "../src/examples/bench/stream-dashboard.ts";
import {
  STATE_PATH,
  TICKER_COUNT,
  tickerLine,
  type StreamState,
} from "../src/examples/bench/stream-tickers.ts";

describe("runtime-invalidation — composed row offsets (stream-dashboard pin)", () => {
  // Translate wrappers are the only offset-carrying Elems; anything
  // else in a position that must carry an offset means the composed
  // root shape drifted — fail loudly instead of reading a wrong y.
  function translateOrThrow(elem: Elem | null | undefined, what: string): TranslateNode {
    if (elem == null || !("type" in elem) || elem.type !== "translate") {
      throw new Error(`${what} is not a translate node`);
    }
    return elem;
  }

  // The composed per-ticker wrappers replicate verticalLayout's flat
  // accumulation by hand (height + origin y + the default gap of 1 —
  // STACK_GAP). This pins the replication against the layout module
  // itself on the seeded 1,000-history state (RO5U L4): every wrapper's
  // offset relative to the first row equals the offset verticalLayout
  // gives the same ticker's first fitted label in one flat stack of all
  // rows' labels, the first row starts one head-extent below the
  // origin, and the tail stack (the H1 single translated stack) starts
  // exactly one rows-extent below the first row.
  it("composed per-ticker wrapper offsets equal the flat verticalLayout offsets", () => {
    const app = createStreamDashboardApp();
    app.dispatch(["update", STATE_PATH, build1000History]);
    const root = app.view() as readonly Elem[];

    // composed root shape: 8 head rows, TICKER_COUNT wrappers, 1 tail
    // stack
    expect(root.length).toBe(8 + TICKER_COUNT + 1);
    const wrappers = root
      .slice(8, 8 + TICKER_COUNT)
      .map((elem) => translateOrThrow(elem, "composed row"));
    const tailStack = translateOrThrow(
      root[8 + TICKER_COUNT]!,
      "tail stack",
    );

    // the flat comparison: the SAME fitted labels of every ticker in
    // row order, laid out by verticalLayout itself — a zero spacer
    // sentinel marks the offset one full rows-extent below the first
    // label (the layout's own accumulation, gap included)
    const state = app.getState() as StreamState;
    const labels = state.tickers.flatMap((t) => fittedLabels(tickerLine(t)));
    const flat = verticalLayout([...labels, spacer(0, 0)]);
    expect(flat).not.toBeNull();
    const flatRows = flat as readonly Elem[];
    expect(flatRows.length).toBe(labels.length + 1);

    // the first row starts one full head-extent below the origin: the
    // head rows ARE verticalLayout's output, so their advances read
    // back off the drawn rows (head row 0 is the unwrapped ops row,
    // rows 1..7 are translates — unwrap and re-run the rule)
    let headExtent = 0;
    for (const row of root.slice(0, 8)) {
      const inner: Elem =
        row != null && "type" in row && row.type === "translate"
          ? row.drawable
          : row;
      headExtent += height(inner) + origin(inner)[1] + 1;
    }
    expect(wrappers[0]!.y).toBe(headExtent);

    // every composed wrapper offset (relative to the first row) equals
    // the flat stack offset of that ticker's first label
    let consumed = 0;
    for (let j = 0; j < TICKER_COUNT; j++) {
      const flatY =
        consumed === 0
          ? 0
          : translateOrThrow(flatRows[consumed]!, "flat row").y;
      expect(wrappers[j]!.y - wrappers[0]!.y).toBeCloseTo(flatY, 9);
      consumed += fittedLabels(tickerLine(state.tickers[j]!)).length;
    }
    expect(consumed).toBe(labels.length);

    // the tail stack starts exactly one rows-extent below the first
    // row — the H1 placement (translate(0, tailY, tailRows))
    const rowsExtent = translateOrThrow(
      flatRows[flatRows.length - 1]!,
      "rows-extent sentinel",
    ).y;
    expect(tailStack.y - wrappers[0]!.y).toBeCloseTo(rowsExtent, 9);
  });
});
