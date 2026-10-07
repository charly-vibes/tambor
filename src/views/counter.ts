// Purpose: the example.counter view — the tracer app built only from
//   view primitives.
// Responsibilities: counter(num) lays out the "more!" button beside the
//   decimal label of num (counter_layout); counterCounter(nums) stacks
//   the "Add Counter" button above one counter per entry, in order
//   (stack_layout).
// Rationale: specs/example-counter.md is the design authority, porting
//   membrane's example/counter.cljc. Only the view structure lives here
//   in T1 — event handling, state paths and effect application are the
//   T2/T3/T4 tickets. No behavior beyond the corpus.

import { label as decimalString } from "../label.ts";
import { horizontalLayout, verticalLayout } from "./layout.ts";
import { button, label as labelNode, type Elem } from "./model.ts";

// A "more!" button beside label(num), in that order (counter_layout).
export function counter(num: number): readonly Elem[] {
  // two children never yield nil (layout_empty_nil)
  return horizontalLayout([button("more!"), labelNode(decimalString(num))])!;
}

// An "Add Counter" button on top of one counter per entry of nums, in
// order (stack_layout).
export function counterCounter(nums: readonly number[]): readonly Elem[] | null {
  return verticalLayout([button("Add Counter"), ...nums.map(counter)]);
}
