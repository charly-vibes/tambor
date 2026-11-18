// Purpose: the deterministic look-and-feel audit (tambor-v3s) — reads the
//   LIVE drawn DOM of the real demo-dist shell and returns machine-readable
//   violations, with no screenshot and no vision call.
// Responsibilities: one browser-side snapshot (document/nav/root overflow,
//   drawn element boxes, leaf-text boxes and colors, button targets) plus
//   the Node-side rule evaluation (overflow, off-root draw, clipping,
//   touch targets, contrast, footprint). The JSON report is the artifact a
//   coding agent (or a human) triages; vision is reserved for the
//   subjective residual and is never on this path.
// Rationale: tambor owns its layout model, so the browser DOM is a
//   projection to check deterministically — screenshots are a lossy,
//   platform-dependent opinion. The rules are floors from the corpus
//   (tambor.mobile_first, view.layout, ui-mobile.theme_aware) plus shell
//   invariants the gallery nav broke as the demo registry grew. Emitted
//   text boxes are also checked against the host-font measure — the
//   renderer's own oracle (a mismatch is what made drawn buttons paint
//   at 13.33px while layout measured 16px). Known gaps (drawn <button>
//   mirror heights, the unwired dark tokens) are warnings here until
//   their corpus fixes land; page-level overflow and measure drift are
//   errors because they make the site wrong or unusable.
//
// The browser snapshot is a string expression: the repo tsconfig has no
// DOM lib (tambor's structural-seam rule), the same reason risks.spec.ts
// uses string evaluate bodies.

import type { Page } from "@playwright/test";
import { composite, contrast, parseColor } from "./audit-color.ts";
import { buttonBounds } from "../../src/views/geometry.ts";
import { SNAPSHOT, type ButtonInfo, type Snapshot, type TextInfo } from "./audit-snapshot.ts";

export interface AuditIssue {
  readonly rule: string;
  readonly severity: "error" | "warn";
  readonly detail: string;
}

export interface AuditReport {
  readonly demo: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly document: { readonly scrollWidth: number; readonly clientWidth: number };
  readonly navScroll: { readonly scrollWidth: number; readonly clientWidth: number } | null;
  readonly root: { readonly w: number; readonly h: number } | null;
  readonly elements: number;
  readonly truncated: boolean;
  readonly issues: readonly AuditIssue[];
}

// The browser snapshot contract lives in ./audit-snapshot.ts.

function addIssue(
  issues: AuditIssue[],
  severity: AuditIssue["severity"],
  rule: string,
  detail: string,
): void {
  issues.push({ rule, severity, detail });
}

// A nav overflow must be a local scroller (the designed chip row), not
// unreachable content.
function checkNav(nav: Snapshot["nav"], issues: AuditIssue[]): void {
  if (nav === null) {
    addIssue(issues, "error", "shell.missing-nav", "no <nav> in the shell");
    return;
  }
  if (nav.scrollWidth <= nav.clientWidth + 1) return;
  const scrollable = nav.overflowX === "auto" || nav.overflowX === "scroll";
  if (scrollable) return;
  addIssue(
    issues,
    "error",
    "nav.unreachable-overflow",
    `nav scrollWidth ${nav.scrollWidth} > clientWidth ${nav.clientWidth} (overflow-x: ${nav.overflowX})`,
  );
}

// Page-level shell floor: no sideways page.
function checkDocument(s: Snapshot, issues: AuditIssue[]): void {
  if (s.doc.scrollWidth > s.doc.clientWidth + 1) {
    addIssue(
      issues,
      "error",
      "page.horizontal-overflow",
      `document scrollWidth ${s.doc.scrollWidth} > clientWidth ${s.doc.clientWidth}`,
    );
  }
  checkNav(s.nav, issues);
}

// The drawn root must sit inside the viewport and hold its own content.
function checkRoot(s: Snapshot, issues: AuditIssue[]): void {
  if (s.root === null) {
    addIssue(issues, "error", "shell.missing-drawn-root", "no #demo > div drawn root");
    return;
  }
  const { box } = s.root;
  if (box.x < -1 || box.right > s.width + 1) {
    addIssue(
      issues,
      "error",
      "root.out-of-viewport",
      `drawn root x=${box.x} right=${box.right} viewport=${s.width}`,
    );
  }
  if (s.root.scrollHeight > s.root.clientHeight + 2) {
    addIssue(
      issues,
      "error",
      "root.content-spill",
      `drawn root scrollHeight ${s.root.scrollHeight} > clientHeight ${s.root.clientHeight}`,
    );
  }
}

// Leaf text whose box escapes the root, plus the audit's own sample cap.
function checkRootText(s: Snapshot, issues: AuditIssue[]): void {
  if (s.root === null) return;
  const box = s.root.box;
  const outside = s.texts.filter(
    (t) =>
      t.right > box.right + 2 ||
      t.bottom > box.bottom + 2 ||
      t.x < box.x - 2 ||
      t.y < box.y - 2,
  );
  if (outside.length > 0) {
    addIssue(
      issues,
      "warn",
      "root.off-root-text",
      `${outside.length} leaf text box(es) outside the drawn root, e.g. ${outside
        .slice(0, 3)
        .map((t) => JSON.stringify(t.text))
        .join(", ")}`,
    );
  }
  if (s.truncated) {
    addIssue(
      issues,
      "warn",
      "audit.truncated",
      `sampled 1500 of ${s.elements} drawn elements; tail not audited`,
    );
  }
}

function contrastFinding(t: TextInfo): AuditIssue | null {
  const fg = parseColor(t.color);
  const bg = parseColor(t.bg);
  if (fg === null || bg === null) return null;
  const ratio = contrast(composite(fg, bg), [bg[0], bg[1], bg[2]]);
  if (ratio >= 4.5) return null;
  return {
    rule: "text.contrast",
    severity: "warn",
    detail: `${JSON.stringify(t.text)} contrast ${ratio.toFixed(2)} < 4.5`,
  };
}

function sizeFinding(t: TextInfo): AuditIssue | null {
  if (t.fontSize <= 0 || t.fontSize >= 16) return null;
  return {
    rule: "text.small",
    severity: "warn",
    detail: `${JSON.stringify(t.text)} font-size ${t.fontSize} < 16`,
  };
}

function driftFinding(t: TextInfo): AuditIssue | null {
  // expected box: shrink-to-fit for plain labels; for button labels the
  // corpus button_bounds (label + 12 floored at 44/axis, tambor-8cu) —
  // geometry.ts owns the formula so audit and renderer cannot drift
  const expected = t.inButton ? buttonBounds([t.measured, 0])[0]! : t.measured;
  if (t.measured < 0 || Math.abs(t.w - expected) <= 2) return null;
  return {
    rule: "text.measure-drift",
    severity: "error",
    detail: `${JSON.stringify(t.text)} box ${t.w} vs host-font measure ${t.measured.toFixed(2)}`,
  };
}

// Per-text findings: contrast, size, host-font measure drift.
function textFindings(t: TextInfo): AuditIssue[] {
  const out: AuditIssue[] = [];
  for (const finding of [contrastFinding(t), sizeFinding(t), driftFinding(t)]) {
    if (finding !== null) out.push(finding);
  }
  return out;
}

function checkText(s: Snapshot, issues: AuditIssue[]): void {
  const clipped = s.texts.filter((t) => t.clipped);
  if (clipped.length > 0) {
    addIssue(
      issues,
      "warn",
      "text.clipped",
      `${clipped.length} leaf text node(s) have scrollWidth > clientWidth, e.g. ${clipped
        .slice(0, 3)
        .map((t) => JSON.stringify(t.text))
        .join(", ")}`,
    );
  }
  for (const t of s.texts) issues.push(...textFindings(t));
}

function checkTargetSizes(s: Snapshot, issues: AuditIssue[]): void {
  for (const b of s.buttons) {
    if (b.w < 44 || b.h < 44) {
      addIssue(
        issues,
        "warn",
        "target.below-44px",
        `${b.where} button ${JSON.stringify(b.text)} is ${b.w}x${b.h} (corpus mobile_first floor is 44x44)`,
      );
    }
  }
}

function overlappingButtons(
  buttons: readonly ButtonInfo[],
): ReadonlyArray<readonly [ButtonInfo, ButtonInfo]> {
  return buttons.flatMap((a, i) =>
    buttons
      .slice(i + 1)
      .filter((b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom)
      .map((b) => [a, b] as const),
  );
}

function checkTargetOverlaps(s: Snapshot, issues: AuditIssue[]): void {
  for (const [a, b] of overlappingButtons(s.buttons)) {
    addIssue(
      issues,
      "warn",
      "target.overlap",
      `buttons ${JSON.stringify(a.text)} and ${JSON.stringify(b.text)} overlap`,
    );
  }
}

// Evaluate the floors. Errors are site-breaking; warnings are known
// corpus/shell gaps with an owning issue recorded in the detail.
function evaluate(demo: string, s: Snapshot): AuditReport {
  const issues: AuditIssue[] = [];
  checkDocument(s, issues);
  checkRoot(s, issues);
  checkRootText(s, issues);
  checkText(s, issues);
  checkTargetSizes(s, issues);
  checkTargetOverlaps(s, issues);

  return {
    demo,
    viewport: { width: s.width, height: s.height },
    document: s.doc,
    navScroll: s.nav === null
      ? null
      : { scrollWidth: s.nav.scrollWidth, clientWidth: s.nav.clientWidth },
    root: s.root === null ? null : { w: s.root.box.w, h: s.root.box.h },
    elements: s.elements,
    truncated: s.truncated,
    issues,
  };
}

/** Audit the live drawn DOM of the real shell at the current viewport. */
export async function auditDrawnDom(page: Page, demo: string): Promise<AuditReport> {
  const snapshot = (await page.evaluate(SNAPSHOT)) as Snapshot;
  return evaluate(demo, snapshot);
}