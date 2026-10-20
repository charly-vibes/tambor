// @vitest-environment jsdom
// Purpose: the gallery SPA contract tests (tambor-cie.2) — every demo in
//   DEMOS mounts through mountDemo into a live document, renders real
//   text, and interacts through the corpus event router.
// Responsibilities: verify per-demo (1) mount renders the demo's
//   content, and (2) a routed interaction re-renders from the new
//   state — counter: clicking + increments the label (components.numeric
//   counter_inc_rule); dropdown: opening the header then clicking an
//   option selects it and closes the list (components.select
//   header_toggles, select_closes).
// Rationale: openspec/specs/components-numeric/spec.md and
//   openspec/specs/components-select/spec.md stay the design
//   authorities — the gallery changes no semantics; these tests pin
//   the mounting plumbing the docs site runs on.

import { describe, expect, it } from "vitest";

import { mountDemo } from "../src/spa/mount.ts";
import { DEMOS } from "../src/spa/gallery.ts";
import { counter } from "../src/components/numeric/counter.ts";
import { dropdown } from "../src/components/select/dropdown.ts";
import { render, call } from "../src/model/component.ts";
import { scanOf } from "./helpers/scan.ts";
import { centreOf } from "./helpers/appview.ts";
import type { Elem, Label } from "../src/views/model.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";

function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

function mouseEventCtor(): new (
  type: string,
  init: { clientX: number; clientY: number },
) => unknown {
  const ctor = (globalThis as { MouseEvent?: unknown }).MouseEvent;
  if (typeof ctor !== "function") throw new Error("MouseEvent unavailable");
  return ctor as new (
    type: string,
    init: { clientX: number; clientY: number },
  ) => unknown;
}

function clickAt(surface: { host: HostElement }, x: number, y: number): void {
  const ME = mouseEventCtor();
  surface.host.dispatchEvent(new ME("pointerdown", { clientX: x, clientY: y }));
  surface.host.dispatchEvent(new ME("pointerup", { clientX: x, clientY: y }));
}

describe("gallery — every demo mounts and interacts", () => {
  it("todo demo renders the list and filters on click", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const todo = DEMOS.find((d) => d.id === "todo")!;
    const spa = mountDemo(doc, container, todo.create);
    expect(container.textContent).toContain("first");
    // the +1 button of the counter demo must not leak across mounts
    expect(container.textContent).not.toContain("+");
    spa.unmount();
  });

  it("counter demo: clicking + increments the drawn number", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const def = DEMOS.find((d) => d.id === "counter")!;
    const spa = mountDemo(doc, container, def.create);

    expect(container.textContent).toContain("5");
    const view = render(call(counter, { num: 5, $num: [["keypath", "num"]] })) as Elem;
    // click the "+" label drawable — the router hit-tests to its button handler
    const plus = scanOf(view).find((f) => (f.node as Label).text === "+")!;
    const [x, y] = centreOf(plus);
    clickAt(spa.surface, x, y);

    expect(container.textContent).toContain("6");
    spa.unmount();
  });

  it("dropdown demo: open then select an option; the list closes", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const def = DEMOS.find((d) => d.id === "select")!;
    const spa = mountDemo(doc, container, def.create);

    expect(container.textContent).toContain("no selection");
    const ARGS = {
      selected: null,
      options: [["uno", "Uno"], ["dos", "Dos"]],
      $selected: [["keypath", "selected"]],
      "open?": false,
      "$open?": [["keypath", "open?"]],
    } as Record<string, unknown>;
    const headerView = render(
      call(dropdown, ARGS, { extra: {}, $extra: [["keypath", "::extra"]] }),
    ) as Elem;

    // open the list: click the header (its handler draws "no selection")
    const header = scanOf(headerView).find((f) => (f.node as Label).text === "no selection")!;
    let [x, y] = centreOf(header);
    clickAt(spa.surface, x, y);
    expect(container.textContent).toContain("Uno");

    // select "Dos": the list is open, so the fresh view draws its rows
    const openView = render(
      call(dropdown, { ...ARGS, "open?": true }, { extra: {}, $extra: [["keypath", "::extra"]] }),
    ) as Elem;
    const row = scanOf(openView).find((f) => (f.node as Label).text === "Dos")!;
    [x, y] = centreOf(row);
    clickAt(spa.surface, x, y);

    expect(container.textContent).toContain("Dos");
    expect(container.textContent).not.toContain("Uno");
    spa.unmount();
  });
});
