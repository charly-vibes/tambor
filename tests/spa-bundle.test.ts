// @vitest-environment jsdom
// Purpose: the built-bundle smoke test (tambor-y9d.2 acceptance) — the
//   actual dist/spa.js artifact mounts the Logo demo through the
//   real-DOM host and completes a dispatch → re-draw round trip, and the
//   build contract: dist/ carries every asset the bundle references —
//   dist/worker.js included (tambor-amb) — so a Pages deploy cannot 404
//   the logo worker into the silent fallback.
// Responsibilities: build the bundle exactly as build:spa does (esbuild
//   API, same entry and outfile), import it into a live jsdom document
//   (the entry boots on import), navigate to the logo demo through the
//   gallery nav, click the REAL drawn Run <button> node (events bubble
//   to the drawn root where the backend listens), and assert the cursor
//   label re-rendered 0/0 → 1/1.
// Rationale: the acceptance meter of tambor-y9d.2 names the built
//   dist/spa.js, not the source entry — a jsdom smoke over the artifact
//   is what proves the published bundle mounts (backend_portable). The
//   click targets the emitted button element itself (tambor-huu): real
//   user input lands on the drawn DOM, not a canvas surface, so the
//   smoke must exercise the same path. The click position comes from
//   the same view tree the corpus contracts use (scanOf + centreOf),
//   as in the gallery tests.

import { describe, expect, it, beforeAll } from "vitest";
// test-only node access (tsconfig types:[vitest/globals] by design);
// the build runs in a child process — esbuild's node code inside the
// jsdom environment trips the TextEncoder invariant
// @ts-expect-error node builtin
import { execSync } from "node:child_process";
// @ts-expect-error node builtin
import { readFileSync } from "node:fs";

import { scanOf } from "./helpers/scan.ts";
import { centreOf } from "./helpers/appview.ts";
import { createLogoApp } from "../src/examples/logo/logo.ts";
import type { ButtonNode } from "../src/views/model.ts";
import type { HostDoc } from "../src/interop/domhost.ts";

// jsdom's document, reached structurally (no lib.dom in tsconfig)
function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

// The structural DOM element type of the host seam.
type HostEl = ReturnType<HostDoc["createElement"]>;

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

// bubbles: true — a real user click originates at the target element
// and bubbles up to the drawn root where the backend listens
// (tambor-huu); MouseEventInit defaults bubbles to false.
function clickAt(host: HostEl, x: number, y: number): void {
  const ME = mouseEventCtor();
  const init = { bubbles: true, clientX: x, clientY: y } as {
    bubbles: boolean;
    clientX: number;
    clientY: number;
  };
  host.dispatchEvent(new ME("pointerdown", init));
  host.dispatchEvent(new ME("pointerup", init));
}

// The Run button's centre in the demo's own view tree — the same
// position the mounted bundle draws it at (the view is pure state).
function runCentre(): readonly [number, number] {
  const app = createLogoApp();
  const found = scanOf(app.view())
    .find((f) => f.node.type === "button" && (f.node as ButtonNode).text === "Run");
  if (found === undefined) throw new Error("Run button not in the view");
  return centreOf(found);
}

beforeAll(() => {
  // the build:spa recipe, verbatim (a child process: esbuild's node
  // code cannot load inside the jsdom environment)
  execSync("npm run build:spa", { stdio: "pipe" });
});

describe("spa bundle — the build contract", () => {
  it("dist/ carries every asset the deployed bundle references (the logo worker)", () => {
    // worker-client.ts constructs the Worker against a URL relative to the
    // bundled spa.js: on Pages the site root is uploaded as-is, so a
    // referenced asset that build:spa does not emit 404s and the client
    // silently downgrades to the bounded in-thread fallback. The contract:
    // the emitted dist/spa.js references ./worker.js and dist/worker.js
    // exists as a real bundled asset (the worker entry, worker-main's
    // envelope included).
    const spa = readFileSync("dist/spa.js", "utf8");
    expect(spa).toContain("./worker.js");
    const worker = readFileSync("dist/worker.js", "utf8");
    expect(worker.length).toBeGreaterThan(0);
    // the bundle serves worker-main's runProgram envelope — a marker from
    // the interpreter's typed failure, not a stray string
    expect(worker).toContain("don't know how to");
  });
});

describe("spa bundle — dist/spa.js mounts the logo demo", () => {
  it("boots, navigates to logo, and Run round-trips 0/0 → 1/1", async () => {
    const doc: HostDoc = hostDoc();
    // the mount point the entry looks up (getElementById("app"))
    const mount = doc.createElement("div");
    mount.setAttribute("id", "app");
    doc.body.appendChild(mount);

    // the variable specifier keeps tsc from demanding a .d.ts for the
    // build artifact; @vite-ignore defers to node ESM resolution
    const bundle: string = "../dist/spa.js";
    await import(/* @vite-ignore */ bundle);

    // the entry built the gallery nav; select the logo demo
    const navs = Array.from(doc.body.querySelectorAll("nav"));
    expect(navs.length).toBeGreaterThan(0);
    let logo: HostEl | undefined;
    for (const b of (navs[0] as unknown as HostEl).querySelectorAll("button")) {
      if (b.textContent === "logo") logo = b as unknown as HostEl;
    }
    expect(logo).toBeDefined();
    (logo as HostEl).dispatchEvent(new (mouseEventCtor())("click", { clientX: 0, clientY: 0 }));

    const demo = doc.getElementById("demo");
    expect(demo).not.toBeNull();
    expect((demo as HostEl).textContent).toContain("tambor logo");
    expect((demo as HostEl).textContent).toContain("0/0");

    // click the REAL drawn element (tambor-huu): the emitted <button>
    // node itself, so the event bubbles to the drawn root the backend
    // listens on — the same path real user input takes
    const run = Array.from((demo as HostEl).querySelectorAll("button")).find(
      (b) => b.textContent === "Run",
    );
    expect(run).toBeDefined();
    const [x, y] = runCentre();
    clickAt(run as unknown as HostEl, x, y);

    expect((demo as HostEl).textContent).toContain("1/1");
  });
});
