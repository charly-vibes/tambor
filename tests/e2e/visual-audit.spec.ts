// Purpose: the real-shell look-and-feel gate (tambor-v3s) — runs the
//   deterministic DOM audit against the built demo-dist page GitHub Pages
//   serves, at four viewports, across every registry demo.
// Responsibilities: mount each demo, snapshot the live drawn DOM, write
//   test-results/visual-audit.json (the triage artifact for the light
//   pass), fail on the error floors (page/nav overflow, missing root,
//   root out of viewport, content spill, low-contrast text, drawn
//   buttons under the 44px floor) in BOTH color schemes, and on
//   console/page errors. The dark pass exists because the shell swaps
//   its tokens per scheme (add-demo-visual-polish task 6.3).
// Rationale: the existing gallery lane drives the coordinate fixture,
//   whose zero body margin and nav-local scroller hide shell-level
//   overflow (the registry used to widen the page to ~1571px at every
//   width up to 1440). Appearance must be measured on the artifact, not
//   the fixture. The contrast and 44px rules are error floors since the
//   corpus fixes landed (task 4); the remaining warnings (small text,
//   clipping, sampling cap) stay advisory so a red gate always means a
//   regression, never a known gap.

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

    // One full matrix pass in the requested scheme. The shell resolves
    // its tokens at boot, so the scheme must be emulated BEFORE the
    // page loads — the light pass keeps the triage artifact, and the
    // dark pass proves the same error floors hold on the inverted
    // palette (task 6.3).
    const auditMatrix = async (
      scheme: "light" | "dark",
    ): Promise<AuditReport[]> => {
      await page.emulateMedia({ colorScheme: scheme });
      const reports: AuditReport[] = [];
      await openSite(page);
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        for (const demo of DEMOS) {
          await navTo(page, demo.title);
          reports.push(await auditDrawnDom(page, demo.id));
        }
      }
      return reports;
    };

    const light = await auditMatrix("light");
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/visual-audit.json",
      `${JSON.stringify(light, null, 2)}\n`,
    );
    const reports = [...light, ...(await auditMatrix("dark"))];

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