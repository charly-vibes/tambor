// @vitest-environment jsdom
// Purpose: the logo gallery demo contract tests (tambor-y9d.2) — the
//   wanna-chat Logo world mounted through the same DomBackend +
//   event-router wire as the other gallery demos.
// Responsibilities: verify (1) the logo demo is registered in DEMOS and
//   mounts rendering real text (the title and the cursor position), and
//   (2) a routed click on Run appends the editor source as a fold entry
//   and re-renders — the cursor label flips from 0/0 to 1/1 (dispatch →
//   app.dispatch → re-draw round trip).
// Rationale: openspec/specs/interop-model/spec.md is the design
//   authority for the per-app seam the demo mounts through; the gallery
//   changes no semantics — the demo is mounting plumbing over
//   example.logo (src/examples/logo/logo.ts).

import { describe, expect, it } from "vitest";

import { mountDemo } from "../src/spa/mount.ts";
import { DEMOS } from "../src/spa/gallery.ts";
import { scanOf } from "./helpers/scan.ts";
import { centreOf } from "./helpers/appview.ts";
import type { ButtonNode } from "../src/views/model.ts";
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

function buttonCentre(spa: { app: { view(): unknown } }, text: string): readonly [number, number] {
  const found = scanOf(spa.app.view() as never).find(
    (f) => f.node.type === "button" && (f.node as ButtonNode).text === text,
  );
  if (found === undefined) throw new Error(`button not drawn: ${text}`);
  return centreOf(found);
}

describe("logo gallery demo — the world is a fold", () => {
  it("is registered and mounts with the title and cursor label", () => {
    const def = DEMOS.find((d) => d.id === "logo");
    expect(def).toBeDefined();
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const spa = mountDemo(doc, container, def!.create);
    const text = container.textContent ?? "";
    expect(text).toContain("tambor logo");
    expect(text).toContain("0/0");
    spa.unmount();
  });

  it("clicking Run appends a fold entry and re-renders the cursor", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const def = DEMOS.find((d) => d.id === "logo")!;
    const spa = mountDemo(doc, container, def.create);

    const [x, y] = buttonCentre(spa, "Run");
    clickAt(spa.surface, x, y);

    expect(container.textContent).toContain("1/1");
    // the spiral example's 66 segments are now drawn
    const view = spa.app.view() as never;
    expect(
      scanOf(view).filter((f) => f.node.type === "path").length,
    ).toBe(67); // 66 segments + the turtle marker
    spa.unmount();
  });

  it("the stepper rewinds: ◀ back to 0/0 redraws an empty world", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const def = DEMOS.find((d) => d.id === "logo")!;
    const spa = mountDemo(doc, container, def.create);

    clickAt(spa.surface, ...buttonCentre(spa, "Run"));
    clickAt(spa.surface, ...buttonCentre(spa, "◀"));

    expect(container.textContent).toContain("0/1");
    const view = spa.app.view() as never;
    expect(
      scanOf(view).filter((f) => f.node.type === "path").length,
    ).toBe(1); // the turtle marker only
    spa.unmount();
  });

  it("tambor-y9d.5: a Spanish program runs end-to-end after the dialect toggle", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const def = DEMOS.find((d) => d.id === "logo")!;
    const spa = mountDemo(doc, container, def.create);

    // Switch to Spanish: the example loaders become the ES set.
    clickAt(spa.surface, ...buttonCentre(spa, "Español"));
    clickAt(spa.surface, ...buttonCentre(spa, "cuadrado"));
    // The Spanish square: repite 4 [avanza 80 giraderecha 90].
    clickAt(spa.surface, ...buttonCentre(spa, "Run"));

    expect(container.textContent).toContain("1/1");
    const view = spa.app.view() as never;
    expect(
      scanOf(view).filter((f) => f.node.type === "path").length,
    ).toBe(5); // 4 segments + the turtle marker
    spa.unmount();
  });

  it("tambor-y9d.6: clicking the turtle selects it — halo handles and inspector appear", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const def = DEMOS.find((d) => d.id === "logo")!;
    const spa = mountDemo(doc, container, def.create);

    clickAt(spa.surface, ...buttonCentre(spa, "Run"));
    const haloCount = (view: unknown): number =>
      scanOf(view as never).filter(
        (f) =>
          f.node.type === "rectangle" &&
          (f.node as { width: number; height: number }).width === HALO_HANDLE &&
          (f.node as { width: number; height: number }).height === HALO_HANDLE,
      ).length;
    const before = haloCount(spa.app.view());
    expect(before).toBe(0);

    // the turtle marker is the only 4-point path in the canvas
    const turtle = scanOf(spa.app.view() as never).find(
      (f) => f.node.type === "path" && (f.node as { points: unknown[] }).points.length === 4,
    );
    expect(turtle).toBeDefined();
    clickAt(spa.surface, ...centreOf(turtle!));

    // the halo draws four handles and the inspector shows the fields
    expect(haloCount(spa.app.view())).toBe(before + 4);
    const text = container.textContent ?? "";
    expect(text).toContain("inspector — turtle");
    expect(text).toContain("pen: true");
    spa.unmount();
  });

  it("tambor-y9d.6: the ✕ handle deselects — halo and inspector disappear", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const def = DEMOS.find((d) => d.id === "logo")!;
    const spa = mountDemo(doc, container, def.create);

    clickAt(spa.surface, ...buttonCentre(spa, "Run"));
    const turtle = scanOf(spa.app.view() as never).find(
      (f) => f.node.type === "path" && (f.node as { points: unknown[] }).points.length === 4,
    )!;
    clickAt(spa.surface, ...centreOf(turtle));
    expect((container.textContent ?? "")).toContain("inspector — turtle");

    clickAt(spa.surface, ...buttonCentre(spa, "✕"));
    expect((container.textContent ?? "")).not.toContain("inspector — turtle");
    expect(
      scanOf(spa.app.view() as never).filter(
        (f) =>
          f.node.type === "rectangle" &&
          (f.node as { width: number; height: number }).width === HALO_HANDLE,
      ).length,
    ).toBe(0);
    spa.unmount();
  });

  it("tambor-y9d.6: clicking a drawn segment selects it — the inspector shows its row", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const def = DEMOS.find((d) => d.id === "logo")!;
    const spa = mountDemo(doc, container, def.create);

    clickAt(spa.surface, ...buttonCentre(spa, "Run"));
    // a segment whose bbox is a real area (spiral turns ~91° per step):
    // the topmost segment covering the click point is the one selected
    const seg = scanOf(spa.app.view() as never).find(
      (f) =>
        f.node.type === "path" &&
        (f.node as { points: readonly [number, number][] }).points.length === 2 &&
        (f.node as { points: readonly [number, number][] }).points[0]![0] !==
          (f.node as { points: readonly [number, number][] }).points[1]![0] &&
        (f.node as { points: readonly [number, number][] }).points[0]![1] !==
          (f.node as { points: readonly [number, number][] }).points[1]![1],
    );
    expect(seg).toBeDefined();
    clickAt(spa.surface, ...centreOf(seg!));

    expect(container.textContent).toMatch(/inspector — segment \d+/);
    expect(container.textContent).toContain("x1:");
    spa.unmount();
  });
});

// the halo handle size drawn for every selected item
const HALO_HANDLE = 6;
