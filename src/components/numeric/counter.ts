// Purpose: the numeric counter component of components.numeric — the
//   "-" / centred label / "+" row with its dec and inc effects.
// Responsibilities: the counter declares num (defaulting to 0) with
//   optional min and max; it renders a minus basic button, a centred
//   label and a plus basic button (counter_buttons); the label is
//   padded on both sides so the centred area is at least 20 wide
//   (counter_label_width); a click on the minus returns the dec effect
//   with the path and the limit, and a click on the plus the inc effect
//   (counter_buttons); applying dec updates num to max(min, num - 1)
//   when min is given and to num - 1 otherwise (counter_dec_rule), and
//   inc is min(max, num + 1) / num + 1 (counter_inc_rule).
// Rationale: specs/components-numeric.md is the design authority —
//   never improvise semantics beyond its constraint rows. Effects are
//   plain data applied by the dispatcher (effect.dispatch); the dec and
//   inc registrations here are the numeric component's own effect
//   appliers, mirroring how effect.dispatch pre-registers
//   counter-increment. The limit argument is carried on the effect only
//   when a limit is declared — "with the path and the limit".

import { defeffect, type DispatchFn } from "../../effects/dispatch.ts";
import type { Path } from "../../effects/paths.ts";
import { label as decimalString } from "../../label.ts";
import { defineComponent, type Props } from "../../model/component.ts";
import type { IntentList } from "../../events/bubble.ts";
import { horizontalLayout } from "../../views/layout.ts";
import {
  button,
  defaultMeasure,
  label as labelNode,
  type Label,
  type MeasureFn,
} from "../../views/model.ts";

// The centred area's minimum width (counter_label_width).
export const CENTRED_MIN_WIDTH = 20;

// The counter's label padded on both sides so the centred area — the
// padded label's own width — is at least 20 (counter_label_width).
export function centredLabel(text: string, measure: MeasureFn = defaultMeasure): Label {
  const [w] = measure(text);
  const total = Math.max(w, CENTRED_MIN_WIDTH);
  const left = Math.floor((total - w) / 2);
  const right = total - w - left;
  return labelNode(" ".repeat(left) + text + " ".repeat(right), measure);
}

// The decrement rule (counter_dec_rule): num becomes max(min, num - 1)
// when min is given and num - 1 otherwise.
export function decNum(num: number, min?: number): number {
  return min === undefined ? num - 1 : Math.max(min, num - 1);
}

// The increment rule (counter_inc_rule): num becomes min(max, num + 1)
// when max is given and num + 1 otherwise.
export function incNum(num: number, max?: number): number {
  return max === undefined ? num + 1 : Math.min(max, num + 1);
}

// The dec effect applied at the path (counter_dec_rule).
export const decEffect = defeffect("dec", (dispatch: DispatchFn, ...raw: unknown[]) => {
  const path = raw[0] as Path;
  const limit = raw[1] as number | undefined;
  dispatch(["update", path, (old: unknown) => decNum(old as number, limit)]);
});

// The inc effect applied at the path (counter_inc_rule).
export const incEffect = defeffect("inc", (dispatch: DispatchFn, ...raw: unknown[]) => {
  const path = raw[0] as Path;
  const limit = raw[1] as number | undefined;
  dispatch(["update", path, (old: unknown) => incNum(old as number, limit)]);
});

// The counter: a "-" button, a centred label and a "+" button; the
// buttons' on-click return the dec and inc effects with the path and
// the limit (counter_buttons).
export const counter = defineComponent(
  "counter",
  [{ keys: ["num", "min", "max"], defaults: { num: 0 } }],
  (props: Props) => {
    const num = props["num"] as number;
    const min = props["min"] as number | undefined;
    const max = props["max"] as number | undefined;
    const $num = props["$num"] as Path;

    const onDec = (): IntentList =>
      min === undefined ? [["dec", $num]] : [["dec", $num, min]];
    const onInc = (): IntentList =>
      max === undefined ? [["inc", $num]] : [["inc", $num, max]];

    return horizontalLayout([
      button("-", onDec),
      centredLabel(decimalString(num)),
      button("+", onInc),
    ]);
  },
);
