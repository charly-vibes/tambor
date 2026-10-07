// Purpose: tambor's pure text rendering helper for label primitives.
// Responsibilities: render a number as its decimal string — the view
//   concern of spec row example.counter.label_shows_number (p_label).
// Rationale: specodelic corpus specs/example-counter.md is the design
//   authority; this is the minimum code to make p_label executable-green,
//   no behavior beyond the corpus.

/** The decimal string of num (spec: example.counter.label_shows_number). */
export function label(num: number): string {
  return num.toString(10);
}
