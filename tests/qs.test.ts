// Purpose: verifies the README quickstart snippet verbatim (tambor-cie.3
//   Meter: the documented copy-paste path must reach a first render).
import { describe, it, expect } from "vitest";
import { todoApp, todoState } from "../src/examples/todo/todo";
import { makeApp } from "../src/effects/dispatch";
import { dispatch } from "../src/events/dispatch";

describe("README quickstart", () => {
  it("makes an app, routes an event, applies intents", () => {
    const app = makeApp({
      view: (state, context) =>
        todoApp(state as ReturnType<typeof todoState>, context),
      state: todoState(),
      backend: { containerSize: [300, 300] },
    });
    const intents = dispatch(app.view(), { type: "mouse-down", pos: [15, 15] });
    expect(Array.isArray(intents)).toBe(true);
    if (intents.length > 0) app.dispatch(intents);
    expect(app.view()).toBeDefined();
  });
});
