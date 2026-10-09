// Purpose: the Pin — the scrollytelling.pin intent: while the Pin's
//   Boundary is active the target element's viewport-relative position is
//   fixed, equivalent layout space is reserved via the slot spacer, and
//   the element returns to native document flow at the Boundary's end
//   without a visual jump.
// Responsibilities: the pin component — props `duration` (the authored
//   scroll duration d, required), `body` (the target element, required),
//   `start` (the Boundary start in content-space y, default 0), `z` (an
//   optional explicit stacking priority), the stored lifecycle state
//   `pin-state` ("unpinned" | "released", default "unpinned") with its
//   app-state path under `state-path`, and the ambient scrollview offset
//   read contextually (`context.scroll`, exactly like pinned_panel's).
//   Render: the slot spacer of the authored duration plus the target body
//   drawn by the pinned_panel composition; a released pin draws native
//   flow until the scroll returns above the start boundary (unpin). A tab
//   key-press reaching the pin's boundary while active — keyboard focus
//   would move past the last interactive element inside — emits the
//   release instead of trapping focus (focus_releases_pin), stored
//   through the state path so it sticks.
// Rationale: openspec/specs/scrollytelling-pin/spec.md is the design authority. The
//   realization composes components.scrollview (the offset source, wired
//   by the app's view layer into context.scroll) with
//   components.pinned_panel (activation_range_formula,
//   body_drawn_untranslated_when_active, release_continuous,
//   spacer_matches_body_extent) rather than any browser layout. The
//   spec's Model transitions: pin (unpinned → pinned, guard
//   spacer_reserves_height — holds by construction), release (pinned →
//   released at the Boundary end, no discontinuity) and unpin
//   (released → unpinned when the scroll returns above the start
//   boundary). The scroll-past-end release is realized statelessly: past
//   the Boundary the activation formula renders the inactive (native
//   flow) branch, whose position coincides with the pinned branch exactly
//   at the boundary (release_continuous), so the stored lifecycle state
//   only tracks the focus-out release — which must stay released while
//   the scroll is still inside the Boundary. Priority passthrough only:
//   with `z` unset, stacking order is document order (tree order, per
//   components.pinned_panel.nested_panel_priority); sibling reordering by
//   explicit priority is a compositor concern outside the view output.
//   No behavior beyond the corpus.

import { pinnedPanel } from "../components/pinned_panel/index.ts";
import type { Path } from "../effects/paths.ts";
import type { EventElem, IntentList } from "../events/bubble.ts";
import {
  call,
  defineComponent,
  type Component,
  type ComponentCall,
  type Props,
} from "../model/component.ts";
import { on, spacer, width, type Elem, type Vec2 } from "../views/model.ts";

function isVec2(value: unknown): value is Vec2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

// Validated inputs of one pin body render.
interface PinInputs {
  readonly offset: Vec2;
  readonly duration: number;
  readonly start: number;
  readonly end: number;
  readonly oy: number;
  readonly active: boolean;
  readonly released: boolean;
  readonly body: Elem;
}

function pinInputs(props: Props): PinInputs {
  const offset = props["scroll"];
  if (!isVec2(offset)) {
    throw new Error("pin needs an ambient scrollview offset (context.scroll)");
  }
  const duration = props["duration"];
  if (typeof duration !== "number" || duration < 0) {
    throw new Error("pin needs an authored scroll duration");
  }
  const body = props["body"] as Elem;
  if (body === undefined) {
    throw new Error("pin needs a target body");
  }
  const start = typeof props["start"] === "number" ? (props["start"] as number) : 0;
  const end = start + duration;
  const oy = offset[1];
  const active = start <= oy && oy <= end;
  // the stored lifecycle: released stays released until the scroll
  // returns above the start boundary (unpin)
  const stored = props["pin-state"] === "released";
  const released = stored && oy >= start;
  return { offset, duration, start, end, oy, active, released, body };
}

// focus_releases_pin: a tab key-press reaching the pin's boundary while
// the Boundary is active releases the Pin rather than trapping focus;
// the release stores through the app-state path (release_on_focus_out)
function pinTabRelease(props: Props, active: boolean, released: boolean, key: unknown): IntentList {
  if (key !== "tab" || !active || released) return [];
  const $state = props["state-path"] as Path | undefined;
  if ($state === undefined) return [];
  return [["update", $state, () => "released" as const]];
}

// The component body: pure over (offset, duration, start, body,
// pin-state) — recomputed fresh on every render, nothing cached.
function pinBody(props: Props): Elem {
  const p = pinInputs(props);

  // native flow: the spacer reserving the authored scroll duration
  // (spacer_reserves_height: height == d) followed by the target body
  const flow: Elem = [spacer(width(p.body), p.duration), p.body];

  // not yet released: the pinned_panel composition — the body fixed at
  // the release-boundary screen position while the Boundary is active
  // (fixed_during_active) and continuous with native flow exactly at the
  // Boundary's end (release_continuous)
  const panelArgs: Record<string, unknown> = {
    "activation-range": [p.start, p.end],
    body: p.body,
  };
  if (props["z"] !== undefined) panelArgs["z"] = props["z"];
  const pinned: ComponentCall = call(pinnedPanel, panelArgs, {
    context: props.context as Record<string, unknown>,
    $context: props.$context as Path,
  });
  // the body may carry the nested component call: render resolves it
  // before any dispatch walks the tree (recursive_components)
  const content: EventElem | ComponentCall = p.released ? flow : pinned;
  return on("key-press", (key) => pinTabRelease(props, p.active, p.released, key), content as Elem);
}

export const pin: Component = defineComponent(
  "pin",
  [
    {
      keys: [
        "duration",
        "body",
        "start",
        "z",
        "pin-state",
        "state-path",
        { key: "scroll", contextual: true },
      ],
      defaults: { start: 0, "pin-state": "unpinned" },
    },
  ],
  pinBody,
);
