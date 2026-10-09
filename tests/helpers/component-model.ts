// Purpose: shared render/props helpers for the component-model contract
//   tests.
// Responsibilities: propsBody is a props-like component body that renders
//   its props map back out so tests can observe exactly what the
//   component received; renderOf renders a call and reads the body output
//   back as the props map.
// Rationale: openspec/specs/component-model/spec.md is the design authority;
//   tambor-272 redistributes the former monolithic
//   tests/component-model.test.ts into topic files, and both helpers are
//   used by two or more of the resulting files, so they live here instead
//   of being duplicated.

import { render, type ComponentCall, type Props } from "../../src/model/component.ts";

// A props-like body: returns the props map as its render output so the
// tests can observe exactly what the component received (the corpus
// scenarios read the props through a data intent, e.g. [:data a b c m]).
export const propsBody = (props: Props): unknown => props;

// Render a call and read back the body output as the props map.
export function renderOf(c: ComponentCall): Props {
  return render(c) as Props;
}