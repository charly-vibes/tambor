// Purpose: the counter demo's expected-pass properties — the numeric
//   component only moves by -1, 0 or +1 between captured states, and every
//   interactive target in its stage clears the 44x44 touch floor (design
//   D2: properties ship green at HEAD, so a red run is a new finding).
// Responsibilities: extract the counter value (`__tambor.state().num`
//   projected to a number, falling back to the drawn label text) and
//   assert the closure form from tasks.md 3.2 over consecutive states;
//   assert the visual floor `undersizedTargets === 0` from lib/visual.ts
//   while the stage is mounted; export the shared stage actions and
//   safety properties.
// Rationale: the value comes from the model snapshot, not DOM text alone
//   (design D5), but the text fallback keeps the property meaningful when
//   the debug handle is absent. The drawn -/+ buttons are the demo's only
//   targets, so the touch floor is the counter's whole reachability
//   contract. Actions are stage-scoped: the counter properties are only
//   meaningful while `?demo=counter`'s stage is mounted, and before the
//   mount the visual extractor's zeroed counts pass vacuously.

import { always, next, now } from "@antithesishq/bombadil";
import { extract } from "@antithesishq/bombadil/browser";
import { counterValue } from "./lib/model.ts";
import { visualFacts } from "./lib/visual.ts";

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

// Visual floor (lib/visual.ts): the -/+ buttons are drawn at the corpus
// button_bounds (label + 12, floored at 44/axis), so a smaller box in a
// captured state is a regression in the emitted DOM, not a style choice.
// Gated on mount: the pre-mount placeholder has no stage and the
// extractor's zeroed counts must not fail the property.
export const touchTargets = always(
  now(() => {
    const facts = visualFacts.current;
    return !facts.stagePresent || facts.undersizedTargets === 0;
  }),
);