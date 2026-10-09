// Purpose: the orientation layer of the corpus — rotating the device
//   relayouts without losing state.
// Responsibilities: rotatedSize maps a container size to the size the
//   same container reports after a quarter-turn rotation.
// Rationale: openspec/specs/ui-mobile/spec.md orientation_supported is the design
//   authority: "rotating the device relayouts without losing state".
//   The relayout is the app's own render path — the root view is built
//   from the container size (viewport_responsive), so a rotation is a
//   container-size change and the app re-renders; the state is never
//   touched by the rotation, which is what the deep-equality property
//   pins. This module supplies the size mapping only. No behavior
//   beyond the corpus.

import type { Vec2 } from "../views/model.ts";

// The size after a quarter-turn rotation: width and height swap.
export function rotatedSize(size: Vec2): Vec2 {
  return [size[1], size[0]];
}
