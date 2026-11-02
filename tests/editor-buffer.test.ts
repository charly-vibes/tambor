// Purpose: executable contract tests for the editor-buffer spec — the
//   RED phase of tasks 1.1/1.2 (pure buffer state, index range and
//   grapheme boundary invariants).
// Responsibilities: encode the editor-buffer RED properties as
//   vitest + fast-check properties against the headless buffer
//   (src/components/textarea/buffer.ts).
// Rationale: openspec/specs/editor-buffer/spec.md is the design authority; each
//   predicate here mirrors a Requirements row (pure state, grapheme snapping).
//   Task 1.1 RED: operations never mutate the input; indices stay in 0..len; no
//   index ever rests inside a grapheme cluster (generators include combining
//   marks, ZWJ sequences and regional-indicator flags).

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  clusterBoundaries,
  deleteByCluster,
  deleteForward,
  initialEditorBuffer,
  moveByCluster,
  type EditorBufferState,
} from "../src/components/textarea/buffer.ts";

const clone = (s: EditorBufferState): EditorBufferState => ({ ...s });

// p_editor_buffer — Requirement: Pure buffer state
// generator: generated text + generated move sequence
// predicate: operations never mutate the input and keep indices in 0..len
it("p_buffer_pure: operations never mutate the input and keep indices in 0..len", () => {
  fc.assert(
    fc.property(fc.string({ minLength: 0, maxLength: 8 }), (text) => {
      let s = initialEditorBuffer(text.length > 0 ? text : null, 0);
      for (let i = 0; i < 3; i += 1) {
        const snapshot = clone(s);
        const dir = i % 2 === 0 ? (1 as -1 | 1) : (-1 as -1 | 1);
        const moved = moveByCluster(s, dir);
        expect(s).toEqual(snapshot);
        const len = moved.text?.length ?? 0;
        expect(moved.anchor).toBeGreaterThanOrEqual(0);
        expect(moved.head).toBeGreaterThanOrEqual(0);
        expect(moved.anchor).toBeLessThanOrEqual(len);
        expect(moved.head).toBeLessThanOrEqual(len);
        s = moved;
      }
      const snapDel = clone(s);
      const del = deleteByCluster(s);
      expect(s).toEqual(snapDel);
      const delLen = del.text?.length ?? 0;
      expect(del.head).toBeGreaterThanOrEqual(0);
      expect(del.head).toBeLessThanOrEqual(delLen);
    }),
  );
});

// Task 8.1 Red→Green — delete forward removes the cluster after the
// cursor as a whole cluster, does nothing at the end of the text, and
// deletes the selection when there is one.
it("p_forward_delete: delete forward removes the whole cluster after the cursor", () => {
  // a ZWJ family is one cluster: the delete takes the whole family
  const family = "👨‍👩‍👧";
  const s = initialEditorBuffer(family + "x", 0);
  const del = deleteForward(s);
  expect(del.text).toBe("x");
  expect(del.head).toBe(0);

  // at the end of the text nothing changes
  const atEnd = deleteForward(initialEditorBuffer("abc", 3));
  expect(atEnd.text).toBe("abc");
  expect(atEnd.head).toBe(3);

  // with a selection the selection is deleted whole
  const selected = deleteForward({ ...initialEditorBuffer("abcdef", 1), anchor: 3 });
  expect(selected.text).toBe("adef");
  expect(selected.head).toBe(1);
});

// p_editor_buffer — Requirement: Grapheme boundary snapping
// generator: generated text over cluster-hostile characters (combining
// marks, ZWJ sequences, flags, newlines)
// predicate: moves and deletes never leave an index inside a cluster
it("p_grapheme_snapping: moves and deletes never leave an index inside a grapheme cluster", () => {
  const graphemeText = fc
    .array(
      fc.constantFrom(
        "a",
        "b",
        "\n",
        "z",
        "é",
        "é",
        "x",
        "ñ",
        "👨‍👩‍👧",
        "🇺🇸",
      ),
      { minLength: 0, maxLength: 6 },
    )
    .map((arr) => arr.join(""));

  fc.assert(
    fc.property(graphemeText, (text) => {
      const t = text.length > 0 ? text : null;
      let s = initialEditorBuffer(t, 0);
      const bounds = clusterBoundaries(t ?? "");
      for (let i = 0; i < 3; i += 1) {
        const moved = moveByCluster(s, 1);
        expect(moved.head).toBeGreaterThanOrEqual(0);
        expect(moved.head).toBeLessThanOrEqual(moved.text?.length ?? 0);
        expect(bounds).toContain(moved.head);
        s = moved;
      }
      const snap = clone(s);
      const del = deleteByCluster(s);
      expect(s).toEqual(snap);
      expect(del.head).toBeGreaterThanOrEqual(0);
      expect(del.head).toBeLessThanOrEqual(del.text?.length ?? 0);
      expect(bounds).toContain(del.head);
    }),
  );
});
