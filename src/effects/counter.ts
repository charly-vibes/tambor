// Purpose: the example.counter app views with their effect handlers
//   wired — the tracer example on top of the T3 state paths and effect
//   dispatch.
// Responsibilities: counter(num, $num) lays out the "more!" button
//   beside the decimal label, and the button's pointer-down handler
//   returns exactly one effect, counter-increment with the num path
//   (more_emits_increment); counterCounter(nums, $nums) stacks the Add
//   Counter button above one counter per entry of nums, in order, where
//   each counter's num path is nums plus seq-nth(i)
//   (independent_counters), and the Add Counter button returns
//   add-counter with the nums path (add_appends_zero).
// Rationale: specs/example-counter.md is the design authority. The
//   layout-only reference implementation lives in src/views/counter.ts
//   (T1); this module adds only the handler wiring the effect contracts
//   need. Handlers are pure: they capture their arguments at render
//   time (args_captured_at_render) and return effects as plain data —
//   application is the dispatcher's job.

import { label as decimalString } from "../label.ts";
import { horizontalLayout, verticalLayout } from "../views/layout.ts";
import { button, label as labelNode, type Elem, type Handler } from "../views/model.ts";
import type { Ref } from "./ref.ts";
import type { Effect } from "./dispatch.ts";

// A "more!" button beside label(num), in that order (counter_layout);
// pressing it returns exactly one effect, counter-increment with the
// num path (more_emits_increment).
export function counter(num: number, $num?: Ref<number>): readonly Elem[] {
  const onClick: Handler | undefined = $num
    ? (): Effect[] => [["counter-increment", $num!.path]]
    : undefined;
  return horizontalLayout([button("more!", onClick), labelNode(decimalString(num))])!;
}

// An "Add Counter" button on top of one counter per entry of nums, in
// order (stack_layout). A counter at index i has the path nums then
// seq-nth(i) (independent_counters); pressing Add Counter returns
// add-counter with the nums path (add_appends_zero).
export function counterCounter(nums: readonly number[], $nums?: Ref<readonly number[]>): readonly Elem[] | null {
  const entryRefs = $nums?.each() as readonly Ref<number>[] | undefined;
  const rows = nums.map((n, i) => counter(n, entryRefs?.[i]));
  const onAdd: Handler | undefined = $nums
    ? (): Effect[] => [["add-counter", $nums!.path]]
    : undefined;
  return verticalLayout([button("Add Counter", onAdd), ...rows]);
}