// Purpose: executable contract tests for the state-paths spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: openspec/specs/state-paths/spec.md is the design authority; each
//   predicate here mirrors a Properties row of that spec.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  ALL,
  END,
  FIRST,
  LAST,
  MAP_VALS,
  deletePath,
  select,
  setPath,
  updatePath,
  type Path,
} from "../src/effects/paths.ts";

// Navigators are typed data: [name, arg]. Special navigators are the
// bare symbols ALL, FIRST, LAST, MAP-VALS, END and META.
const keyGen = fc
  .string({ minLength: 1, maxLength: 4 })
  // JS objects order integer-like keys first, which would break map
  // entry ordering; the corpus's keys are keywords, never numeric
  .filter(
    (k) =>
      !/^[0-9]/.test(k) &&
      !["ALL", "FIRST", "LAST", "MAP-VALS", "END", "META"].includes(k),
  );

// A chain of keys plus a state containing that exact chain (with noise
// siblings at every level), so direct indexing and select can agree.
const chainState = fc
  .array(keyGen, { minLength: 1, maxLength: 3 })
  .chain((keys) => {
    const build = (depth: number, leaf: unknown): Record<string, unknown> => {
      if (depth >= keys.length) return { leaf };
      return { [keys[depth] as string]: build(depth + 1, leaf), noise: { n: depth } };
    };
    return fc.integer().map((leaf) => ({ keys, state: build(0, leaf) }));
  });

// p_select — derives_from: state.paths.keypath_select
// generator: random nested state — predicate: select matches direct indexing
it("p_select: select matches direct indexing", () => {
  // direct indexing along a keypath, and undefined when a step is absent
  const obj: Record<string, unknown> = { a: { b: 5 } };
  expect(select(obj, [["keypath", "a"], ["keypath", "b"]])).toBe(5);
  expect(select(obj, [["keypath", "a"], ["keypath", "missing"]])).toBeUndefined();

  fc.assert(
    fc.property(chainState, ({ keys, state }) => {
      const path: Path = keys.map((k) => ["keypath", k]);
      let expected: unknown = state;
      for (const k of keys) expected = (expected as Record<string, unknown>)[k];
      expect(select(state, path)).toEqual(expected);
      // any absent step makes the whole select undefined
      expect(select(state, [...path, ["keypath", "zz-absent"]])).toBeUndefined();
    }),
  );
});

// p_immut — derives_from: state.paths.immutable_update
// generator: random updates — predicate: input deep-equals its prior snapshot
it("p_immut: input deep-equals its prior snapshot", () => {
  fc.assert(
    fc.property(chainState, fc.integer(), fc.integer({ min: 0, max: 2 }), ({ keys, state }, v, kind) => {
      const snapshot = JSON.parse(JSON.stringify(state)) as typeof state;
      const path: Path = keys.map((k) => ["keypath", k]);
      if (kind === 0) setPath(state, path, v);
      else if (kind === 1) updatePath(state, path, (old) => ((old as number) ?? 0) + v);
      else deletePath(state, path);
      expect(state).toEqual(snapshot);
    }),
  );
});

// p_share — derives_from: state.paths.structural_sharing
// generator: random updates — predicate: sibling branches are reference-equal
it("p_share: sibling branches are reference-equal", () => {
  fc.assert(
    fc.property(chainState, fc.integer(), ({ keys, state }, v) => {
      const path: Path = keys.map((k) => ["keypath", k]);
      const out = setPath(state, path, v);
      // the changed branch is a new object, every sibling keeps its reference
      expect(out).not.toBe(state);
      expect((out as Record<string, unknown>)["noise"]).toBe((state as Record<string, unknown>)["noise"]);
      // deep inside: the last parent changed, its sibling did not
      expect(out).toEqual({ ...state, [keys[0] as string]: expect.anything() });
    }),
  );
});

// p_nth — derives_from: state.paths.nth_navigator
// generator: maps and vectors — predicate: map entries written back keep a map
it("p_nth: map entries written back keep a map", () => {
  // vector: nth(i) selects element i
  expect(select([10, 20, 30], [["nth", 1]])).toBe(20);
  // map: seq-nth(i) selects the i-th entry as a pair that keeps its map
  // shape when written back
  const m: Record<string, number> = { a: 1, b: 2 };
  const out = updatePath(m, [["seq-nth", 0], ["nth", 1]], (v) => (v as number) + 10);
  expect(out).toEqual({ a: 11, b: 2 });
  // still a plain map with the same key order
  expect(Object.keys(out as Record<string, number>)).toEqual(["a", "b"]);

  fc.assert(
    fc.property(
      fc.dictionary(keyGen, fc.integer(), { minKeys: 1, maxKeys: 4 }),
      fc.integer({ min: 0, max: 3 }),
      (dict, i) => {
        const entries = Object.entries(dict);
        if (i >= entries.length) return;
        const [k] = entries[i] as [string, number];
        const res = updatePath(dict, [["seq-nth", i], ["nth", 1]], (v) => (v as number) * 2);
        // a map, same keys in order, only the i-th value changed
        expect(Object.keys(res as Record<string, number>)).toEqual(Object.keys(dict));
        expect((res as Record<string, number>)[k]).toBe(dict[k]! * 2);
      },
    ),
  );
});

// p_entry — derives_from: state.paths.entry_key_value
// generator: map obj with a and b
// predicate: nth(0) of the first entry selects the key and nth(1) the value
it("p_entry: nth(0) of the first entry selects the key and nth(1) the value", () => {
  const obj = { a: 1, b: 2 };
  expect(select(obj, [["seq-nth", 0], ["nth", 0]])).toBe("a");
  expect(select(obj, [["seq-nth", 0], ["nth", 1]])).toBe(1);
});

// p_filter_select — derives_from: state.paths.filter_selects_subseq
// generator: todos with mixed complete flags
// predicate: the active filter selects exactly the incomplete todos
it("p_filter_select: the active filter selects exactly the incomplete todos", () => {
  const todos = [
    { text: "a", done: true },
    { text: "b", done: false },
    { text: "c", done: false },
  ];
  const active = (t: { done?: boolean }) => !t.done;
  expect(select(todos, [["filter", active]])).toEqual([
    { text: "b", done: false },
    { text: "c", done: false },
  ]);
  // a keyword predicate means truthiness of that field
  expect(select(todos, [["filter", "done"]])).toEqual([{ text: "a", done: true }]);

  fc.assert(
    fc.property(fc.array(fc.boolean(), { maxLength: 6 }), (flags) => {
      const ts = flags.map((done, i) => ({ text: String(i), done }));
      const res = select(ts, [["filter", active]]) as readonly { text: string }[];
      expect(res).toEqual(ts.filter((t) => !t.done));
    }),
  );
});

// p_filter_merge — derives_from: state.paths.filter_merges_back
// generator: todos first second third with third complete
// predicate: updating the second visible active todo changes original index 1
it("p_filter_merge: updating the second visible active todo changes original index 1", () => {
  const todos = [{ text: "first" }, { text: "second" }, { text: "third", complete: true }];
  const active = (t: { complete?: boolean }) => !t.complete;
  const out = updatePath(todos, [["filter", active], ["seq-nth", 1], ["keypath", "text"]], () => "SECOND");
  expect((out as { text: string }[]).map((t) => t.text)).toEqual(["first", "SECOND", "third"]);

  fc.assert(
    fc.property(fc.array(fc.boolean(), { minLength: 2, maxLength: 6 }), (flags) => {
      const ts = flags.map((complete, i) => ({ text: String(i), complete }));
      const visible = ts.map((t, i) => ({ t, i })).filter(({ t }) => !t.complete);
      if (visible.length < 2) return;
      const second = visible[1]!.i;
      const res = updatePath(ts, [["filter", active], ["seq-nth", 1], ["keypath", "text"]], () => "X");
      for (const [i, t] of (res as { text: string }[]).entries()) {
        if (i === second) expect(t.text).toBe("X");
        else expect(t.text).toBe(String(i));
      }
    }),
  );
});

// p_filter_delete — derives_from: state.paths.filter_delete_removes
// generator: the same todos
// predicate: deleting the second visible active todo leaves first and third
it("p_filter_delete: deleting the second visible active todo leaves first and third", () => {
  const todos = [{ text: "first" }, { text: "second" }, { text: "third", complete: true }];
  const active = (t: { complete?: boolean }) => !t.complete;
  const out = deletePath(todos, [["filter", active], ["seq-nth", 1]]);
  expect(out).toEqual([{ text: "first" }, { text: "third", complete: true }]);
});

// p_take_drop — derives_from: state.paths.take_drop_ranges
// generator: random n and sequences
// predicate: take and drop address disjoint covering ranges
it("p_take_drop: take and drop address disjoint covering ranges", () => {
  fc.assert(
    fc.property(fc.array(fc.integer(), { maxLength: 8 }), fc.integer({ min: 0, max: 10 }), (xs, n) => {
      const take = select(xs, [["take", n]]) as readonly number[];
      const drop = select(xs, [["drop", n]]) as readonly number[];
      expect(take).toEqual(xs.slice(0, Math.min(n, xs.length)));
      expect(drop).toEqual(xs.slice(n));
      expect([...take, ...drop]).toEqual(xs);
      // both writable
      const bumped = take.map((v) => v + 1);
      expect((setPath(xs, [["take", n]], bumped) as number[]).slice(0, take.length)).toEqual(bumped);
      const droppedBumped = drop.map((v) => v + 1);
      expect(setPath(xs, [["drop", n]], droppedBumped)).toEqual(
        [...xs.slice(0, Math.min(n, xs.length)), ...droppedBumped],
      );
    }),
  );
});

// p_nil_val — derives_from: state.paths.nil_to_val
// generator: nil leaves — predicate: reads return the default
it("p_nil_val: reads return the default", () => {
  const state: Record<string, unknown> = { a: null, b: { c: undefined } };
  expect(select(state, [["keypath", "a"], ["nil-to-val", 42]])).toBe(42);
  expect(select(state, [["keypath", "b"], ["keypath", "c"], ["nil-to-val", 7]])).toBe(7);
  // writes through unchanged otherwise
  expect(updatePath({ a: 5 }, [["keypath", "a"], ["nil-to-val", 42]], (v) => (v as number) + 1)).toEqual({ a: 6 });
  // a nil leaf reads as the default even for update
  expect(updatePath({ a: null }, [["keypath", "a"], ["nil-to-val", 41]], (v) => (v as number) + 1)).toEqual({ a: 42 });
});

// p_keypath_list — derives_from: state.paths.keypath_list
// generator: random key lists — predicate: equals nested keypath steps
it("p_keypath_list: equals nested keypath steps", () => {
  fc.assert(
    fc.property(chainState, ({ keys, state }) => {
      const flat: Path = keys.map((k) => ["keypath", k]);
      expect(select(state, [["keypath-list", keys]])).toEqual(select(state, flat));
      expect(setPath(state, [["keypath-list", keys]], 9)).toEqual(setPath(state, flat, 9));
    }),
  );
});

// p_collect — derives_from: state.paths.collect_one
// generator: cursor and select-cursor and text paths
// predicate: the function is called with cursor, select-cursor, text in that order
it("p_collect: the function is called with cursor, select-cursor, text in that order", () => {
  const state = { cursor: 3, "select-cursor": 7, text: "hi" };
  const path: Path = [
    ["collect-one", [["keypath", "cursor"]]],
    ["collect-one", [["keypath", "select-cursor"]]],
    ["keypath", "text"],
  ];
  const calls: unknown[][] = [];
  const out = updatePath(state, path, (...args: unknown[]) => {
    calls.push(args);
    return (args[2] as string) + "!";
  });
  expect(calls).toEqual([[3, 7, "hi"]]);
  expect(out).toEqual({ cursor: 3, "select-cursor": 7, text: "hi!" });
});

// p_flatten — derives_from: state.paths.nested_paths_flatten
// generator: random nested paths — predicate: selects equal the flat path
it("p_flatten: selects equal the flat path", () => {
  fc.assert(
    fc.property(chainState, fc.integer({ min: 0, max: 2 }), ({ keys, state }, split) => {
      const flat: Path = keys.map((k) => ["keypath", k]);
      // nest the flat path into random chunks
      const mid = Math.max(1, Math.min(keys.length - 1, split));
      const nested: Path = [flat.slice(0, mid), flat.slice(mid)] as unknown as Path;
      if (flat.length === 1) return; // cannot nest a single step
      expect(select(state, nested)).toEqual(select(state, flat));
      expect(setPath(state, nested, 9)).toEqual(setPath(state, flat, 9));
    }),
  );
});

// p_rest_args — derives_from: state.paths.rest_args_map
// generator: key-value lists — predicate: round-trip is lossless
it("p_rest_args: round-trip is lossless", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(keyGen, { minLength: 1, maxLength: 4 }).chain((ks) =>
        fc.array(fc.integer(), { minLength: ks.length, maxLength: ks.length }).map((vs) => ({ ks, vs })),
      ),
      ({ ks, vs }) => {
        const flat: unknown[] = [];
        for (const [i, k] of ks.entries()) flat.push(k, vs[i]);
        const state = { props: flat };
        // a flat key-value list is viewed as a map
        const view = select(state, [["keypath", "props"], ["rest-args-map"]]);
        expect(view).toEqual(Object.fromEntries(ks.map((k, i) => [k, vs[i]])));
        // and writes back as a flat list, losslessly
        const out = setPath(state, [["keypath", "props"], ["rest-args-map"]], view);
        expect(out).toEqual(state);
      },
    ),
  );
});

// p_delete — derives_from: state.paths.delete_removes
// generator: random keys and indices
// predicate: key is absent or element is spliced
it("p_delete: key is absent or element is spliced", () => {
  fc.assert(
    fc.property(
      fc.dictionary(keyGen, fc.integer(), { minKeys: 1, maxKeys: 4 }),
      fc.array(fc.integer(), { maxLength: 6 }),
      fc.integer({ min: 0, max: 5 }),
      (obj, arr, i) => {
        // deleting at a map key removes the key
        const k = Object.keys(obj)[0]!;
        const withoutKey = deletePath(obj, [["keypath", k]]);
        expect(Object.keys(withoutKey as Record<string, unknown>)).not.toContain(k);
        // deleting at a sequence index splices the element
        if (arr.length > 0) {
          const idx = i % arr.length;
          const spliced = deletePath(arr, [["nth", idx]]);
          expect(spliced).toEqual(arr.filter((_, j) => j !== idx));
        }
      },
    ),
  );
});

// p_special — derives_from: state.paths.special_navigators
// generator: ALL, FIRST, LAST, MAP_VALS, END
// predicate: each addresses its documented location
it("p_special: each addresses its documented location", () => {
  const xs = [1, 2, 3];
  // ALL visits every element
  expect(select(xs, [ALL])).toEqual([1, 2, 3]);
  expect(setPath(xs, [ALL], 0)).toEqual([0, 0, 0]);
  // FIRST and LAST address the ends
  expect(select(xs, [FIRST])).toBe(1);
  expect(select(xs, [LAST])).toBe(3);
  // MAP_VALS visits map values
  const m = { a: 1, b: 2 };
  expect(select(m, [MAP_VALS])).toEqual([1, 2]);
  expect(setPath(m, [MAP_VALS], 9)).toEqual({ a: 9, b: 9 });
  // END addresses the insertion point after the last element
  expect(select(xs, [END])).toBeUndefined();
  expect(setPath(xs, [END], 4)).toEqual([1, 2, 3, 4]);
});

// p_ser — derives_from: state.paths.path_serialisable
// generator: random paths
// predicate: JSON round-trip is lossless for paths without a function
// predicate, and a keyword-style filter round-trips
it("p_ser: JSON round-trip is lossless for paths without a function predicate", () => {
  const randomPath: fc.Arbitrary<Path> = fc
    .array(keyGen, { minLength: 1, maxLength: 4 })
    .chain((ks) => fc.integer({ min: 0, max: 1 }).map((withNth) => {
      const steps: unknown[] = ks.map((k) => ["keypath", k]);
      if (withNth === 1) steps.push(["nth", 0], ["take", 2], ["nil-to-val", 5]);
      return steps as Path;
    }));
  fc.assert(
    fc.property(randomPath, (p) => {
      const rt = JSON.parse(JSON.stringify(p));
      expect(rt).toEqual(p);
      expect(select({ todos: [{ n: 1 }] }, rt)).toEqual(select({ todos: [{ n: 1 }] }, p));
    }),
  );
  // a keyword-style filter round-trips
  const keywordPath: Path = [["keypath", "todos"], ["filter", "done"]];
  expect(JSON.parse(JSON.stringify(keywordPath))).toEqual(keywordPath);
});

// p_unknown — derives_from: state.paths.unknown_navigator_throws
// generator: a bogus navigator — predicate: an error naming it is raised
it("p_unknown: an error naming the bogus navigator is raised", () => {
  expect(() => select({}, [["bogus", 1]])).toThrowError(/bogus/);
  expect(() => select({}, [["keypath", "a"], ["nope", 2]])).toThrowError(/nope/);
});