// Purpose: the by-key state-path navigator tests (add-keyed-dom-
//   reconciliation §3) — `["by-key", field, value]` addressing of the
//   unique element of a sequence whose field equals the value
//   (Object.is), exactly-one in select and write alike.
// Responsibilities: pin (3.0) select through a by-key step, keyed-
//   not-found (absent id, non-sequence target) and keyed-ambiguous
//   (duplicate ids, select and write alike) carrying the field and the
//   value; (3.2) handler stability — the same by-key path lands on the
//   same logical message after an insert above, sequence shape
//   preserved, other messages structurally shared; (3.3) delete splices
//   the matched element, a by-key path at a removed id throws
//   keyed-not-found instead of writing elsewhere, Object.is matching.
// Rationale: openspec/changes/add-keyed-dom-reconciliation/specs/
//   state-paths/spec.md is the contract authority; the loud exactly-one
//   failure mode mirrors seq-nth's loud out-of-range (never a silent
//   empty select, never a write elsewhere). Separate file: the
//   state-paths.test.ts contract file sits near the 400-line gate.
//   Static test titles only.
import { describe, expect, it } from "vitest";

import {
  deletePath,
  select,
  setPath,
  updatePath,
  type Path,
} from "../src/effects/paths.ts";

type Msgs = { messages: readonly { id: string; text: string; meta: { likes: number } }[] };

const messages = [
  { id: "m-1", text: "first", meta: { likes: 1 } },
  { id: "m-2", text: "second", meta: { likes: 2 } },
  { id: "m-3", text: "third", meta: { likes: 3 } },
];

const keyedTextPath: Path = [
  ["keypath", "messages"],
  ["by-key", "id", "m-2"],
  ["keypath", "text"],
];

const keyedElementPath: Path = [["keypath", "messages"], ["by-key", "id", "m-2"]];

describe("state-paths — by-key navigator (add-keyed-dom-reconciliation §3)", () => {
  it("3.0 select by key returns the matched element's field", () => {
    expect(select({ messages }, keyedTextPath)).toBe("second");
  });

  it("3.0 zero matches throw keyed-not-found carrying the field and the value", () => {
    const state = { messages };
    const path: Path = [
      ["keypath", "messages"],
      ["by-key", "id", "m-9"],
      ["keypath", "text"],
    ];
    expect(() => select(state, path)).toThrowError(/keyed-not-found/);
    expect(() => select(state, path)).toThrowError(/id/);
    expect(() => select(state, path)).toThrowError(/m-9/);
  });

  it("3.0 a non-sequence target throws keyed-not-found", () => {
    expect(() =>
      select({ messages: 42 }, keyedElementPath),
    ).toThrowError(/keyed-not-found/);
  });

  it("3.0 duplicate matches throw keyed-ambiguous in select and write alike", () => {
    const dup = [...messages, { id: "m-2", text: "dupe", meta: { likes: 9 } }];
    expect(() => select({ messages: dup }, keyedTextPath)).toThrowError(
      /keyed-ambiguous/,
    );
    expect(() =>
      updatePath({ messages: dup }, keyedTextPath, () => "x"),
    ).toThrowError(/keyed-ambiguous/);
    expect(() => setPath({ messages: dup }, keyedTextPath, "x")).toThrowError(
      /keyed-ambiguous/,
    );
    expect(() => deletePath({ messages: dup }, keyedElementPath)).toThrowError(
      /keyed-ambiguous/,
    );
  });

  it("3.2 the same by-key update path lands on the same logical message after an insert above", () => {
    const inserted = [{ id: "m-0", text: "zero" }, ...messages];
    const next = updatePath(
      { messages: inserted },
      keyedTextPath,
      () => "second!",
    ) as Msgs;
    expect(select(next, keyedTextPath)).toBe("second!");
    // the update landed on m-2 at its NEW index (2, shifted by the insert)
    expect((next.messages[2] as { text: string }).text).toBe("second!");
    expect((next.messages[2] as { id: string }).id).toBe("m-2");
    // sequence shape preserved; every other message structurally shared
    expect(next.messages.length).toBe(4);
    expect(next.messages[0]).toBe(inserted[0]);
    expect(next.messages[1]).toBe(inserted[1]);
    expect(next.messages[3]).toBe(inserted[3]);
  });

  it("3.2 setPath writes through the matched element preserving position and untouched keys", () => {
    const next = setPath({ messages }, keyedTextPath, "replaced") as Msgs;
    const written = next.messages[1] as { id: string; text: string; meta: object };
    expect(written.text).toBe("replaced");
    expect(written.id).toBe("m-2");
    expect(written.meta).toBe(messages[1]!.meta);
    expect(next.messages[0]).toBe(messages[0]);
    expect(next.messages[2]).toBe(messages[2]);
  });

  it("3.3 delete through by-key splices the matched element and keeps the rest", () => {
    const next = deletePath({ messages }, keyedElementPath) as Msgs;
    expect(
      (next.messages as readonly { id: string }[]).map((m) => m.id),
    ).toEqual(["m-1", "m-3"]);
    expect(next.messages[0]).toBe(messages[0]);
    expect(next.messages[1]).toBe(messages[2]);
  });

  it("3.3 a by-key path at a removed id throws keyed-not-found instead of writing elsewhere", () => {
    const removed = { messages: [messages[0], messages[2]] };
    expect(() =>
      updatePath(removed, keyedTextPath, () => "x"),
    ).toThrowError(/keyed-not-found/);
    expect(() => setPath(removed, keyedTextPath, "x")).toThrowError(
      /keyed-not-found/,
    );
    expect(() => deletePath(removed, keyedElementPath)).toThrowError(
      /keyed-not-found/,
    );
    // the state was not touched by the failed writes
    expect(removed.messages.length).toBe(2);
  });

  it("3.3 by-key matches with Object.is: 0 and -0 are distinct keys", () => {
    const rows = [
      { id: 0, v: "zero" },
      { id: -0, v: "negzero" },
    ];
    expect(
      select({ rows }, [["keypath", "rows"], ["by-key", "id", 0], ["keypath", "v"]]),
    ).toBe("zero");
    expect(
      select({ rows }, [["keypath", "rows"], ["by-key", "id", -0], ["keypath", "v"]]),
    ).toBe("negzero");
  });
});
