// Purpose: the Playwright driving helpers (tambor-y9d.4) — coordinate
//   mapping between the corpus view space and the browser page, plus
//   screenshot capture into tests/screenshots/ (the HITL artifact).
// Responsibilities: demoView/demoPoint re-derive a demo's view in the
//   test process (the demos are pure views over plain state, so a fresh
//   app's view equals the page's initial view — the same scanOf +
//   centreOf pattern the jsdom contract tests use) and translate
//   view-space points to client coordinates through the fixture stage
//   box; clickView/dragView drive the real pointer wire; drawnText
//   reads the drawn tree's text for state assertions; shot() captures
//   named per-demo-per-state screenshots.
// Rationale: the SPA's input seam is the surface canvas — the drawn
//   buttons are display-only accessibility mirrors (buildButton), so
//   Playwright must click view-space coordinates on the canvas, not
//   the DOM buttons. Reusing tests/helpers/scan.ts keeps the coordinate
//   math identical to the contract tests (no second implementation).
//   This file is plain @playwright/test + the corpus scan helpers — no
//   harness abstraction (the tambor-54j.4 reuse note).

import type { Page, Locator } from "@playwright/test";
import { DEMOS } from "../../src/spa/gallery.ts";
import type { Elem } from "../../src/views/model.ts";
import { scanOf, type Found } from "../helpers/scan.ts";
import { centreOf } from "../helpers/appview.ts";

// A view-space point: the units the view tree and the event router use.
export type ViewPoint = readonly [number, number];

// A fresh in-process instance of a demo's app view — pure, no DOM
// (makeApp draws only on dispatch), so it mirrors the page's initial
// view exactly.
export function demoView(demoId: string): Elem {
  const def = DEMOS.find((d) => d.id === demoId);
  if (def === undefined) throw new Error(`no demo: ${demoId}`);
  return def.create().view();
}

// The view-space centre of the drawn button with the given text.
export function buttonPoint(view: Elem, text: string): ViewPoint {
  const found = scanOf(view).find(
    (f) => f.node.type === "button" && f.node.text === text,
  );
  if (found === undefined) throw new Error(`no button drawn: ${text}`);
  return centreOf(found);
}

// The view-space centre of a node matched by an arbitrary predicate.
export function pointWhere(view: Elem, pred: (f: Found) => boolean): ViewPoint {
  const found = scanOf(view).find(pred);
  if (found === undefined) throw new Error("no node matched");
  return centreOf(found);
}

// The view-space centre of the handler whose subtree draws the label
// with the given text (toggle options, select options) — the same
// subtree-scan shape appview.ts's toggleOptionOf uses.
export function optionPoint(view: Elem, text: string): ViewPoint {
  const found = scanOf(view).find(
    (f) => f.underHandler && f.node.type === "label" && f.node.text === text,
  );
  if (found === undefined) throw new Error(`no option drawn: ${text}`);
  return centreOf(found);
}

// The fixture stage: the event surface the SPA attaches input to. Since
// tambor-huu the surface IS the drawn root (a real <div> the backend
// emitted), not a detached <canvas> — pointer events land on the drawn
// elements themselves.
export function stage(page: Page): Locator {
  return page.locator("#demo > div");
}

// The stage's page-space box, translated by a view-space point.
export async function at(
  page: Page,
  p: ViewPoint,
): Promise<{ x: number; y: number }> {
  const box = await stage(page).boundingBox();
  if (box === null) throw new Error("stage root has no box");
  return { x: box.x + p[0], y: box.y + p[1] };
}

// Open the fixture page and wait for the bundle to boot (the nav is
// the entry's last DOM action, so a visible nav button means mounted).
export async function open(page: Page): Promise<void> {
  await page.goto("/tests/e2e/gallery.html");
  await page.locator("nav button").first().waitFor({ state: "visible" });
}

// Switch demos through the real nav (plain DOM buttons outside the
// corpus — the entry's mounting plumbing).
export async function navTo(page: Page, title: string): Promise<void> {
  // exact: substring matching went ambiguous when the bench apps added
  // "todomvc" next to "todo" (both matched hasText "todo").
  await page.getByRole("button", { name: title, exact: true }).click();
}

// Click a view-space point on the stage through the real mouse wire.
export async function clickView(page: Page, p: ViewPoint): Promise<void> {
  const c = await at(page, p);
  await page.mouse.click(c.x, c.y);
}

// Click a DRAWN element by its live bounding-box centre (tambor-0rp):
// DOM ground truth. The drawn root carries the same offsets the corpus
// layout computed (the emission writes translate coordinates as real CSS),
// so the element's live box centre is exactly the view-space point to
// route — through the overlaying surface canvas, same as clickView. This
// replaces in-process replay coordinates wherever the live state shifts
// positions: the browser layout uses real text metrics (configured at the
// bundle entry), which a node-side replay cannot reproduce.
export async function clickDrawnText(
  page: Page,
  text: string,
): Promise<void> {
  const el = page.locator("#demo").getByText(text, { exact: true }).last();
  // tambor-4h6: the preceding interaction's repaint lands on the next
  // animation frame, so locating + reading the box immediately can see
  // a not-yet-attached (or mid-swap) element — the logo smoke failed
  // 1-of-4 reruns with "no drawn element with text: Run". Wait for
  // visibility (auto-retries through the transient absence), then
  // settle a double rAF so the draw has flushed before the box read.
  await el.waitFor({ state: "visible" });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const raf = (
          globalThis as unknown as {
            requestAnimationFrame?: (cb: () => void) => number;
          }
        ).requestAnimationFrame;
        if (raf === undefined) {
          resolve();
          return;
        }
        raf(() => raf(() => resolve()));
      }),
  );
  const box = await el.boundingBox();
  if (box === null) throw new Error(`no drawn element with text: ${text}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// The view-space point of a drawn element's live box origin: the
// drawn translate wrappers write the same offsets as real CSS, so a
// drawn element's bounding-box origin (page space) minus the stage
// origin is its view position. Ground truth for state-dependent
// positions where the in-process replay layout may diverge.
export async function stagePoint(page: Page, el: Locator): Promise<ViewPoint> {
  const box = await el.boundingBox();
  if (box === null) throw new Error("drawn element has no box");
  const origin = await at(page, [0, 0]);
  return [box.x - origin.x, box.y - origin.y];
}

// A demo app's view after replaying the same intents the page's app
// received: the demos are pure views over plain state and the intents
// are plain data (or carry pure update functions), so replaying them
// on a fresh in-process app reproduces the page's live view exactly —
// scan coordinates stay correct for elements whose position depends on
// state (the logo buttons row grows with the world; the dropdown's
// options exist only while open).
export function replayView(
  demoId: string,
  intents: readonly (readonly unknown[])[],
): Elem {
  const def = DEMOS.find((d) => d.id === demoId);
  if (def === undefined) throw new Error(`no demo: ${demoId}`);
  const app = def.create();
  for (const intent of intents) {
    app.dispatch([intent] as Parameters<typeof app.dispatch>[0]);
  }
  return app.view();
}

// Pointer drag between two view-space points (pointerdown, moves,
// pointerup — the wire the slider's mdown/value tracking listens on).
export async function dragView(
  page: Page,
  from: ViewPoint,
  to: ViewPoint,
  steps = 8,
): Promise<void> {
  const a = await at(page, from);
  const b = await at(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // the slider's move handler is (re-)rendered only while mdown? is
  // true — the repaint that re-arms it lands on the next animation
  // frame, so give it a beat before the first move
  await page.waitForTimeout(50);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      a.x + ((b.x - a.x) * i) / steps,
      a.y + ((b.y - a.y) * i) / steps,
    );
  }
  await page.mouse.up();
}

// The drawn tree's full text: the state's rendered mirror.
export async function drawnText(page: Page): Promise<string> {
  return (await page.locator("#demo > div").innerText()) ?? "";
}

// A named screenshot into tests/screenshots/ (tambor-kd5: LOCAL dev artifact,
// gitignored — platform fonts make committed baselines pure git noise, and no
// test asserts on these; see tests/e2e/README.md). The project name prefixes
// the file so desktop and 380px captures stay distinct.
export async function shot(
  page: Page,
  name: string,
  project: string,
): Promise<string> {
  const file = `tests/screenshots/${project}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
