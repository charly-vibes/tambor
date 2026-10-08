// Purpose: shared harness for the components-textarea contract tests —
//   state construction, props assembly, rendering, and routed-event
//   dispatch for the textarea component (the basic_components.cljc
//   port).
// Responsibilities: harnessState builds the app state (text and focus
//   as top-level keys, per text_state_split) with the textarea-state
//   extra map initialized from overrides; propsOf assembles the
//   TextareaProps, injecting an opaque font handle and a monospace-ish
//   indexForPosition stub (backend.render.backend_contract is a
//   backend service, so the tests inject a stub with one cell per
//   character like the text backend's default measure); render wraps
//   propsOf into the textarea component; send dispatches one TamborEvent
//   into the rendered tree and applies the returned intents through the
//   textarea's interpreter, returning the tree, the intents, the
//   applied state and the external intents (request-focus, clipboard
//   effects).
// Rationale: specs/components-textarea.md is the design authority;
//   tambor-272 redistributes the former monolithic
//   tests/components-textarea.test.ts into topic files, and every one
//   of these helpers is used by two or more of the resulting files, so
//   they live here instead of being duplicated.

import {
  applyTextareaIntents,
  initialTextareaExtra,
  type TextareaExtra,
} from "../../src/components/textarea/edit.ts";
import { textarea, type TextareaProps } from "../../src/components/textarea/textarea.ts";
import type { Path } from "../../src/effects/paths.ts";
import type { IntentList } from "../../src/events/bubble.ts";
import { dispatch } from "../../src/events/dispatch.ts";
import type { TamborEvent } from "../../src/events/event.ts";

// text and focus are app state (text_state_split); textarea-state is
// the extra map.
export const TEXT_PATH: Path = [["keypath", "text"]];
export const EXTRA_PATH: Path = [["keypath", "textarea-state"]];

// An opaque font handle: indexForPosition is a backend service
// (backend.render.backend_contract), so the tests inject a stub with
// monospace-ish metrics (one cell per character, like the text
// backend's default measure).
export const FONT = { family: "test" };
export const stubIndex = (_font: unknown, text: string, x: number, _y: number): number =>
  Math.max(0, Math.min(text.length, Math.round(x)));

export type HarnessState = {
  text: string | null;
  focus: unknown;
  "textarea-state": TextareaExtra;
};

export function harnessState(
  text: string | null,
  extra: Partial<TextareaExtra> = {},
  focus: unknown = null,
): HarnessState {
  return { text, focus, "textarea-state": initialTextareaExtra(extra) };
}

export type PropsOverrides = Partial<TextareaProps>;

export function propsOf(state: HarnessState, overrides: PropsOverrides = {}): TextareaProps {
  return {
    text: state.text,
    textPath: TEXT_PATH,
    extraPath: EXTRA_PATH,
    focus: state.focus,
    state: state["textarea-state"],
    font: FONT,
    indexForPosition: stubIndex,
    ...overrides,
  };
}

export function render(state: HarnessState, overrides: PropsOverrides = {}) {
  return textarea(propsOf(state, overrides));
}

// One routed event: dispatch into the rendered tree, then apply the
// returned intents through the textarea's interpreter. The external
// intents (request-focus, clipboard effects) come back separately.
export function send(state: HarnessState, event: TamborEvent, overrides: PropsOverrides = {}) {
  const tree = render(state, overrides);
  const intents: IntentList = dispatch(tree, event);
  const applied = applyTextareaIntents(state, intents);
  return { tree, intents, state: applied.state, external: applied.external };
}
