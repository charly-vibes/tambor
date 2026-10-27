// @vitest-environment jsdom
// Purpose: the SPA mount's input hardening (tambor-hyw) — the surface
//   wiring's raw-DOM seam tests, split out of spa-mount.test.ts so the
//   suite files stay under the gate's size floor.
// Responsibilities: verify that the surface wiring (1) forwards
//   modifier combos as distinct events — ctrl/cmd+c/x as the
//   clipboard copy/cut sentinels, ctrl+v dropped ahead of the native
//   paste, modified printables as mod-carrying key-presses — (2)
//   preventDefaults handled keydowns so the page does not scroll, (3)
//   delivers synthetic mouse-ups when a gesture dies without a
//   pointerup (pointercancel, a drag leaving the surface, lost
//   capture), (4) carries the button-down state on pointer moves
//   (drag vs hover), and (5) routes multi-char IME keys and
//   compositionend text as paste-like clipboard insertions.
// Rationale: openspec/specs/example-todo/spec.md and the shared mount
//   plumbing are unchanged — these are the tambor-hyw seams that live
//   on the surface element, tested against the same mounted demo
//   (mountSpa) as the rest of the mount suite.

import { describe, expect, it } from "vitest";

import { mountSpa } from "../src/spa/todo-spa.ts";
import { NEXT_TEXT_PATH } from "../src/examples/todo/todo.ts";
import type { HostDoc } from "../src/interop/domhost.ts";

function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

// The Event constructor, reached structurally (no lib.dom in tsconfig).
function eventCtor(): new (type: string, init?: { cancelable?: boolean }) => unknown {
  const ctor = (globalThis as { Event?: unknown }).Event;
  if (typeof ctor !== "function") throw new Error("Event unavailable");
  return ctor as new (type: string, init?: { cancelable?: boolean }) => unknown;
}

// The KeyboardEvent constructor, reached structurally (no lib.dom).
function keyboardEventCtor(): new (
  type: string,
  init: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    cancelable?: boolean;
  },
) => unknown {
  const ctor = (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent;
  if (typeof ctor !== "function") throw new Error("KeyboardEvent unavailable");
  return ctor as new (
    type: string,
    init: {
      key: string;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      cancelable?: boolean;
    },
  ) => unknown;
}


// A plain Event carrying extra fields (wheel init, IME data) — the
// structural stand-in the tambor-gov test uses too. The event shape is
// read structurally (no lib.dom in tsconfig).
interface DomEventLike {
  defaultPrevented: boolean;
  preventDefault(): void;
}

function bareEvent(type: string, fields: Record<string, unknown>): DomEventLike {
  const ev = new (eventCtor())(type, { cancelable: true });
  for (const [field, value] of Object.entries(fields)) {
    Object.defineProperty(ev, field, { value });
  }
  return ev as unknown as DomEventLike;
}

// ------------------------------------------------------------------
// Input hardening (tambor-hyw): the surface wiring owns the raw-DOM
// seams the corpus leaves to the integration — modifier keys reach the
// router as distinct events, handled keys preventDefault so the page
// does not scroll, a drag leaving the surface delivers its mouse-up,
// and pointer moves carry the button-down state.
// ------------------------------------------------------------------
describe("spa-mount — input hardening (tambor-hyw)", () => {
  function mounted() {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const spa = mountSpa(doc, container);
    const routed: import("../src/events/event.ts").TamborEvent[] = [];
    spa.backend.subscribe((ev) => routed.push(ev));
    return { doc, spa, routed };
  }

  function keydown(init: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  }): DomEventLike {
    const ev = new (keyboardEventCtor())("keydown", { cancelable: true, ...init });
    return ev as unknown as DomEventLike;
  }

  it("a ctrl+c keydown forwards a clipboard copy event, not a c key-press", () => {
    const { spa, routed } = mounted();
    const ev = keydown({ key: "c", ctrlKey: true });
    spa.surface.host.dispatchEvent(ev as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    const kinds = routed.map((e) => [e.type, e.data ?? e.key]);
    expect(kinds).toContainEqual(["clipboard", "copy"]);
    expect(kinds).not.toContainEqual(["key-press", "c"]);
    // a modified key the app handles preventDefaults (no browser copy)
    expect(ev.defaultPrevented).toBe(true);
  });

  it("a ctrl+x keydown forwards a clipboard cut event", () => {
    const { spa, routed } = mounted();
    const ev = keydown({ key: "x", metaKey: true });
    spa.surface.host.dispatchEvent(ev as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    const kinds = routed.map((e) => [e.type, e.data ?? e.key]);
    expect(kinds).toContainEqual(["clipboard", "cut"]);
    expect(kinds).not.toContainEqual(["key-press", "x"]);
  });

  it("a ctrl+v keydown forwards nothing (the native paste event follows)", () => {
    const { spa, routed } = mounted();
    const ev = keydown({ key: "v", ctrlKey: true });
    spa.surface.host.dispatchEvent(ev as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    expect(routed).toEqual([]);
    // the native paste still routes as a clipboard event carrying text
    const paste = bareEvent("paste", {
      clipboardData: { getData: () => "pasted" },
    });
    spa.surface.host.dispatchEvent(paste as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    expect(routed.map((e) => [e.type, e.data])).toContainEqual([
      "clipboard",
      "pasted",
    ]);
  });

  it("modified printable keys reach components as distinct events, not plain text", () => {
    const { spa, routed } = mounted();
    // focus the new-todo textarea so its handlers answer key-presses
    spa.app.dispatch(["request-focus", NEXT_TEXT_PATH]);
    // ctrl+a forwards as the mod-carrying key-press — distinct from
    // plain a, whose key-press carries no mods (the textarea's insert
    // guard against modified keys is contracted in
    // tests/components-textarea-edit.test.ts)
    const ctrlA = keydown({ key: "a", ctrlKey: true });
    spa.surface.host.dispatchEvent(ctrlA as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    const press = routed.find((e) => e.type === "key-press");
    expect(press?.key).toBe("a");
    expect(press?.mods).toContain("ctrl");
    // plain a still forwards unmodified
    const plain = keydown({ key: "a" });
    spa.surface.host.dispatchEvent(plain as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    const plainPress = routed.filter((e) => e.type === "key-press")[1];
    expect(plainPress?.key).toBe("a");
    expect(plainPress?.mods).toEqual([]);
  });

  it("shift+a carries the shift mod on the forwarded key-press", () => {
    const { spa, routed } = mounted();
    const ev = keydown({ key: "A", shiftKey: true });
    spa.surface.host.dispatchEvent(ev as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    const press = routed.find((e) => e.type === "key-press");
    expect(press?.key).toBe("A");
    expect(press?.mods).toContain("shift");
  });

  it("handled keys preventDefault so the page does not scroll", () => {
    const { spa } = mounted();
    const cases = [
      keydown({ key: "ArrowDown" }),
      keydown({ key: " " }),
      keydown({ key: "Backspace" }),
    ];
    for (const ev of cases) {
      spa.surface.host.dispatchEvent(ev as unknown as Parameters<
        (typeof spa.surface.host)["dispatchEvent"]
      >[0]);
      expect(ev.defaultPrevented).toBe(true);
    }
    // a modifier alone is not handled: no preventDefault
    const shift = keydown({ key: "Shift" });
    spa.surface.host.dispatchEvent(shift as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    expect(shift.defaultPrevented).toBe(false);
  });

  it("pointercancel delivers a synthetic mouse-up and clears the down state", () => {
    const { spa, routed } = mounted();
    const send = (type: string): void => {
      spa.surface.host.dispatchEvent(
        bareEvent(type, { clientX: 12, clientY: 7 }) as unknown as Parameters<
          (typeof spa.surface.host)["dispatchEvent"]
        >[0],
      );
    };
    send("pointerdown");
    send("pointercancel");
    // the stuck pointer-down got its mouse-up
    expect(routed.map((e) => e.type)).toContain("mouse-up");
    // the state is cleared: a further cancel delivers nothing
    const after = routed.length;
    send("pointercancel");
    expect(routed.length).toBe(after);
  });

  it("a drag leaving the surface (pointerleave while down) delivers mouse-up", () => {
    const { spa, routed } = mounted();
    const send = (type: string): void => {
      spa.surface.host.dispatchEvent(
        bareEvent(type, { clientX: 12, clientY: 7 }) as unknown as Parameters<
          (typeof spa.surface.host)["dispatchEvent"]
        >[0],
      );
    };
    send("pointerdown");
    send("pointerleave");
    expect(routed.map((e) => e.type)).toContain("mouse-up");
    // clearing: a lostpointercapture after the release delivers nothing
    const after = routed.length;
    send("lostpointercapture");
    expect(routed.length).toBe(after);
  });

  it("pointermove carries the button-down state (drag vs hover)", () => {
    const { spa, routed } = mounted();
    const send = (type: string, buttons: number): void => {
      spa.surface.host.dispatchEvent(
        bareEvent(type, { clientX: 12, clientY: 7, buttons }) as unknown as Parameters<
          (typeof spa.surface.host)["dispatchEvent"]
        >[0],
      );
    };
    send("pointermove", 0);
    send("pointerdown", 1);
    send("pointermove", 1);
    send("pointerup", 0);
    const moves = routed.filter((e) => e.type === "mouse-move");
    expect(moves.map((e) => e.down)).toEqual([false, true]);
  });

  it("a multi-char keydown routes as paste-like text insertion", () => {
    const { spa, routed } = mounted();
    const ev = keydown({ key: "こん" });
    spa.surface.host.dispatchEvent(ev as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    expect(routed.map((e) => [e.type, e.data])).toContainEqual([
      "clipboard",
      "こん",
    ]);
  });

  it("an Unidentified keydown is still dropped", () => {
    const { spa, routed } = mounted();
    const ev = keydown({ key: "Unidentified" });
    spa.surface.host.dispatchEvent(ev as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    expect(routed).toEqual([]);
  });

  it("a compositionend commits IME text as paste-like insertion", () => {
    const { spa, routed } = mounted();
    const ev = bareEvent("compositionend", { data: "こんにちは" });
    spa.surface.host.dispatchEvent(ev as unknown as Parameters<
      (typeof spa.surface.host)["dispatchEvent"]
    >[0]);
    expect(routed.map((e) => [e.type, e.data])).toContainEqual([
      "clipboard",
      "こんにちは",
    ]);
  });
});
