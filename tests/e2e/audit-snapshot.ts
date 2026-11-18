// Purpose: the browser-side half of the real-shell visual audit
//   (tambor-v3s) — one JSON-safe snapshot of the live shell plus the
//   structural types the Node-side rules read.
// Responsibilities: SNAPSHOT (a string expression evaluated in the page)
//   reads document/nav/root overflow, drawn element boxes, leaf-text boxes
//   with colour/background/font, button targets, and the host-font
//   measured width of each text box's painted run (the trailing
//   separator space included — labels paint with white-space: pre);
//   the exported interfaces describe that payload.
// Rationale: the repo tsconfig has no DOM lib (tambor's structural-seam
//   rule), so the snapshot is a string like risks.spec.ts's evaluate
//   bodies. Keeping it out of audit.ts leaves the rules file readable and
//   under the repo's file-length gate; the two halves share one contract
//   here, not two drifting copies.

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ButtonInfo extends Box {
  readonly text: string;
  readonly where: "nav" | "drawn";
}

export interface TextInfo extends Box {
  readonly text: string;
  readonly color: string;
  readonly bg: string;
  readonly fontSize: number;
  readonly clipped: boolean;
  readonly measured: number;
  // the text sits inside a drawn <button>: its box is the corpus
  // button_bounds (label + 12, floored at 44/axis), not shrink-to-fit
  readonly inButton: boolean;
}

export interface Snapshot {
  readonly width: number;
  readonly height: number;
  readonly doc: { readonly scrollWidth: number; readonly clientWidth: number };
  readonly nav: {
    readonly box: Box;
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly overflowX: string;
  } | null;
  readonly root: {
    readonly box: Box;
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
  } | null;
  readonly buttons: readonly ButtonInfo[];
  readonly texts: readonly TextInfo[];
  readonly elements: number;
  readonly truncated: boolean;
}

export const SNAPSHOT = `(() => {
  const de = document.documentElement;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
    };
  };
  const nav = document.querySelector("nav");
  const root = document.querySelector("#demo > div");
  const all = root ? Array.from(root.querySelectorAll("*")) : [];
  const LIMIT = 1500;
  const sample = all.slice(0, LIMIT);
  const backgroundOf = (el) => {
    let n = el;
    while (n) {
      const c = getComputedStyle(n).backgroundColor;
      const r = n.getBoundingClientRect();
      // zero-area with-color wrappers paint no background; skipping
      // them reports the surface the glyphs actually sit on
      if (
        c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent" &&
        r.width > 0 && r.height > 0
      ) return c;
      n = n.parentElement;
    }
    return "rgb(255, 255, 255)";
  };
  const buttons = Array.from(
    document.querySelectorAll("nav button, #demo > div button"),
  ).map((b) => ({
    text: (b.textContent || "").trim().slice(0, 40),
    where: b.closest("nav") ? "nav" : "drawn",
    ...rect(b),
  }));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const textWidth = (text, cs) => {
    if (!ctx) return -1;
    ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    let w = 0;
    for (const line of String(text).split("\\n")) {
      // views/fit.ts keeps the joining space on every non-final wrapped
      // line, and the DOM painter emits labels with white-space: pre
      // (dom-painters buildLabel) — so that trailing space does paint and
      // does widen the span's box (measured: one space ≈ 5px at 16px).
      // Layout positions the label by the same untrimmed measure, so the
      // oracle must measure untrimmed too: trimming here would under-count
      // by that space and fire text.measure-drift against a box that
      // legitimately still has it.
      w = Math.max(w, ctx.measureText(line).width);
    }
    return w;
  };
  const texts = sample
    .filter((el) => el.children.length === 0 && (el.textContent || "").trim() !== "")
    .slice(0, 300)
    .map((el) => {
      const cs = getComputedStyle(el);
      const r = rect(el);
      const raw = el.textContent || "";
      const isButton = el.tagName === "BUTTON";
      const measured = textWidth(raw, cs);
      return {
        text: raw.trim().slice(0, 40),
        ...r,
        color: cs.color,
        bg: backgroundOf(el),
        fontSize: parseFloat(cs.fontSize) || 0,
        clipped: el.scrollWidth > el.clientWidth + 1,
        // the emitted box should equal the host-font measure: labels are
        // shrink-to-fit, buttons carry the corpus button_bounds (the
        // audit's drift rule applies the formula, geometry.ts owns it)
        inButton: isButton,
        measured: measured < 0 ? -1 : measured,
      };
    });
  return {
    width: innerWidth,
    height: innerHeight,
    doc: { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth },
    nav: nav ? {
      box: rect(nav),
      scrollWidth: nav.scrollWidth,
      clientWidth: nav.clientWidth,
      overflowX: getComputedStyle(nav).overflowX,
    } : null,
    root: root ? {
      box: rect(root),
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
    } : null,
    buttons,
    texts,
    elements: all.length,
    truncated: all.length > LIMIT,
  };
})()`;