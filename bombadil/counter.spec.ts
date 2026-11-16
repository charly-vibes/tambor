// Purpose: the counter demo's expected-pass property — the numeric
//   component only moves by -1, 0 or +1 between captured states (design
//   D2: properties ship green at HEAD, so a red run is a new finding).
// Responsibilities: extract the counter value (`__tambor.state().num`
//   projected to a number, falling back to the drawn label text) and
//   assert the closure form from tasks.md 3.2 over consecutive states;
//   export the shared stage actions and safety properties.
// Rationale: the value comes from the model snapshot, not DOM text alone
//   (design D5), but the text fallback keeps the property meaningful when
//   the debug handle is absent. Actions are stage-scoped: the counter
//   property is only meaningful while `?demo=counter`'s stage is mounted.

import { always, next, now } from "@antithesishq/bombadil";
import { extract } from "@antithesishq/bombadil/browser";
import { counterValue } from "./lib/model.ts";

// The safety properties (noConsoleErrors, noUncaughtExceptions, ...) and
// the stage-scoped action generators. Default action generators are
// deliberately not exported — they would click the demo nav.
export * from "./lib/actions.ts";

// One observed counter value per captured state; null before mount and
// whenever neither the handle nor a drawn label is available.
const counter = extract<number | null>((state) =>
  counterValue(state.document),
);

// Closure form (tasks.md 3.2): remember the previous value at evaluation
// time, then require the next captured state to stay within one step.
// The null guard covers the pre-mount placeholder and a mid-run unmount.
export const counterTransitions = always(
  now(() => {
    const observed = counter.current;
    if (observed === null) return true;
    const previous: number = observed;
    return next(() => {
      const current = counter.current;
      return current === null || Math.abs(current - previous) <= 1;
    });
  }),
);