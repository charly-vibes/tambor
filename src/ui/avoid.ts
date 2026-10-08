// Purpose: the keyboard-avoidance scroll of the corpus — when the soft
//   keyboard opens, the focused textarea is scrolled into the visible
//   viewport.
// Responsibilities: avoidScroll computes the scroll that brings a
//   focused textarea's rect fully inside the area above the keyboard.
// Rationale: specs/ui-mobile.md keyboard_avoidance is the design
//   authority: "when the soft keyboard opens, the focused textarea is
//   scrolled into the visible viewport". The visible viewport is the
//   area above the keyboard, i.e. [0, keyboardTop); the scroll moves
//   content up by exactly the amount the textarea's bottom would reach
//   past the keyboard, never backwards. Positions are content-space
//   y coordinates of the focused textarea (its absolute origin and
//   height); the caller applies the returned scroll to the scrolling
//   container. No behavior beyond the corpus.

// The scroll that keeps the focused textarea inside the visible area
// above the keyboard: how far the textarea's bottom would reach past
// the keyboard, never less than zero.
export function avoidScroll(
  focusTop: number,
  focusHeight: number,
  viewportHeight: number,
  keyboardTop: number,
): number {
  void viewportHeight; // the visible area is bounded by the keyboard top
  return Math.max(0, focusTop + focusHeight - keyboardTop);
}
