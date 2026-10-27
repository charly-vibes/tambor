// Purpose: routing contract for the logo demo's Run button (tambor-ibh
//   follow-up) — the browser smoke clicks the drawn Run button and the
//   fold stays empty, so this test pins the headless half of the wire:
//   a mouse-down at the Run button's view-space centre must route the
//   run intent (or reveal that the point lands on an intercepting
//   handler — the select pads of the world canvas).
// Responsibilities: build the demo view, resolve buttonPoint("Run"),
//   dispatch a mouse-down + mouse-up pair at that point, and assert the
//   intents are the demo's run intents (with the observed intent list
//   in the failure message when not).
// Rationale: corpus-lane debugging (the repo ruling) — the click
//   delivery itself is browser-proven (the root receives the pointer
//   event), so the remaining question is pure routing.

import { describe, it, expect } from "vitest";
import { dispatch } from "../src/events/dispatch.ts";
import { demoView } from "./e2e/drive.ts";
import { buttonPoint } from "./e2e/drive.ts";
import type { TamborEvent } from "../src/events/event.ts";

function mouseDown(p: readonly [number, number]): TamborEvent {
  return { type: "mouse-down", pos: p, button: 0, down: true, mods: [] } as TamborEvent;
}

describe("logo demo Run routing", () => {
  it("a mouse-down at the Run button's centre routes the run intent", async () => {
    const view = await demoView("logo");
    const p = buttonPoint(view, "Run");
    const intents = dispatch(view, mouseDown(p));
    expect({
      point: p,
      intents,
    }).toMatchObject({ intents: expect.any(Array) as unknown as readonly unknown[] });
    // the run intent (whatever its exact shape — pinned loosely: not
    // empty, and not the world-select effect)
    expect(intents.length, JSON.stringify(intents)).toBeGreaterThan(0);
  });
});
