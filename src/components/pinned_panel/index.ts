// Purpose: the pinned_panel component — the components.pinned_panel spec,
//   a plain component that reads the ambient scrollview offset as a
//   contextual prop and pins its body within its activation range.
// Responsibilities: define the component (props `activation-range`
//   ([start, end] in content-space y, required), `body` (required), an
//   optional `z` for stacking order, and the contextual `scroll` offset
//   read from context.scroll exactly the way `focus` is contextual for
//   textarea — a call-site literal cannot override it); render the
//   always-present slot spacer of the body's full authored extent
//   (activation-range.end − activation-range.start in y, the body's width
//   in x) plus the body placed per the activation branch.
// Rationale: specs/components-pinned_panel.md is the design authority.
//   activation_range_formula: active iff start ≤ offset.y ≤ end.
//   spacer_matches_body_extent: the spacer is present in untranslated
//   content flow at all times, active or not, so the ambient scrollview's
//   own range_formula total height is unaffected by activation state.
//   release_continuous: at offset.y == activation-range.end the active
//   branch's screen position equals the inactive (normally-translated)
//   branch's — together with the fixed position this pins the active body
//   at its release-boundary screen position, emitted inside the ambient
//   scrollview frame (components.scrollview.content_translated, body drawn
//   translated by [-ox, -oy]) as translate([0, offset.y − end], body): the
//   composition holds the body's screen position constant across the whole
//   range and merges it into normal flow exactly at the boundary, with no
//   discontinuity at release. nested_panel_priority: painting order is
//   tree order, so a later panel paints on top; the `z` prop is declared
//   for explicit stacking order but sibling reordering is a compositor
//   concern outside this component's view output. render_pure: activation,
//   screen position and spacer height are computed solely from offset,
//   activation-range and body, fresh on every render.

import { defineComponent, type Component, type Props } from "../../model/component.ts";
import { spacer, translate, width, type Elem, type Vec2 } from "../../views/model.ts";

function isVec2(value: unknown): value is Vec2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

// The component body: pure over (offset, activation-range, body).
function pinnedPanelBody(props: Props): Elem {
  const offset = props["scroll"];
  if (!isVec2(offset)) {
    throw new Error("pinned_panel needs an ambient scrollview offset (context.scroll)");
  }
  const range = props["activation-range"];
  if (!isVec2(range)) {
    throw new Error("pinned_panel needs an activation-range [start, end]");
  }
  const body = props["body"] as Elem;
  if (body === undefined) {
    throw new Error("pinned_panel needs a body");
  }

  const [ox, oy] = offset;
  const [start, end] = range;
  const active = start <= oy && oy <= end;

  // the slot spacer: the body's full authored extent, in untranslated
  // content flow at all times (spacer_matches_body_extent)
  const reserved = spacer(width(body), end - start);

  // active: the body is pinned at the release-boundary screen position —
  // emitted as translate [0, oy − end] so the ambient [−ox, −oy] frame
  // (content_translated) holds its screen position fixed and merges it
  // into normal flow exactly at offset.y == end (release_continuous)
  const placed: Elem = active ? translate(0, oy - end, body) : body;

  return [reserved, placed];
}

export const pinnedPanel: Component = defineComponent(
  "pinned_panel",
  [
    {
      keys: ["activation-range", "body", "z", { key: "scroll", contextual: true }],
    },
  ],
  pinnedPanelBody,
);
