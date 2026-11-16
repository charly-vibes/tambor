// Purpose: the real-shell look-and-feel gate (tambor-v3s) — runs the
//   deterministic DOM audit against the built demo-dist page GitHub Pages
//   serves, at four viewports, across every registry demo.
// Responsibilities: mount each demo, snapshot the live drawn DOM, write
//   test-results/visual-audit.json (the triage artifact), fail on the
//   error floors (page/nav overflow, missing root, root out of viewport,
//   content spill) and on console/page errors.
// Rationale: the existing gallery lane drives the coordinate fixture,
//   whose zero body margin and nav-local scroller hide shell-level
//   overflow (the 13-demo registry used to widen the page to ~1571px at
//   every width up to 1440). Appearance must be measured on the artifact,
//   not the fixture. Warnings (drawn <button> mirror heights under the
//   44px corpus floor, low-contrast/small text, clipping) are recorded but
//   not blocking until their corpus fixes land; vision stays on demand
//   and is never part of this gate.

// @ts-expect-error node builtin (tsconfig types exclude node)
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { DEMOS } from "../../src/spa/gallery.ts";
import { auditDrawnDom, type AuditReport } from "./audit.ts";
import { navTo, openSite } from "./drive.ts";

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 380, height: 800 },
  { width: 800, height: 900 },
  { width: 1440, height: 900 },
] as const;

test.describe("visual audit — real shell", () => {
  test("page-level invariants across demos and viewports", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "viewport matrix is driven explicitly; the 380 touch project is the same geometry",
    );
    test.setTimeout(300_000);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    const reports: AuditReport[] = [];
    await openSite(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const demo of DEMOS) {
        await navTo(page, demo.title);
        reports.push(await auditDrawnDom(page, demo.id));
      }
    }

    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/visual-audit.json",
      `${JSON.stringify(reports, null, 2)}\n`,
    );

    const errors = reports.flatMap((report) =>
      report.issues
        .filter((issue) => issue.severity === "error")
        .map(
          (issue) =>
            `${report.demo} @${report.viewport.width}x${report.viewport.height}: ` +
            `${issue.rule}: ${issue.detail}`,
        ),
    );
    expect(errors, `error floors:\n${errors.join("\n")}`).toEqual([]);
    expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
  });
});