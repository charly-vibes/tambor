// Purpose: the SVG leaf painters (path/arc draw, tambor-0rp round 3,
//   primitive_set parity), extracted from dom-painters.ts as a
//   mechanical split (zero behavior change) to keep dom-painters under
//   the file_lines ceiling.
// Responsibilities: buildPath/buildArc (the registry entries dom.ts
//   wires), svgStroke (the inline svg anchored at the origin whose
//   viewport COVERS THE GEOMETRY), and the geometry helpers svgExtent,
//   pathData, arcData.
// Rationale: an inline svg anchored at the origin whose viewport covers
//   the geometry — Chrome paints nothing from a 0×0 svg viewport even
//   with overflow visible (the blank logo world), so width/height are
//   the node's extent. overflow:visible keeps out-of-viewport geometry
//   (negative coords) painting, and pointer-events none keeps the
//   stroke from intercepting clicks (canvas strokes don't hit-test).
//   The stroke inherits the threaded with-color ink. This module
//   imports the builder contract from dom-painters (never the reverse —
//   dom.ts wires the registry), so the dependency stays acyclic.

import type { ElementLike } from "./domsim.ts";
import { atOrigin, type BuildCtx, type DomNode } from "./dom-painters.ts";

function svgExtent(node: DomNode, kind: "path" | "arc"): [number, number] {
  if (kind === "path") {
    const pts = node.points ?? [];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [
      Math.max(0, ...xs),
      Math.max(0, ...ys),
    ];
  }
  // the arc lives in the circle box around (cx, cy): the viewport from
  // the origin covering cx+r, cy+r contains it (overflow shows the rest)
  const r = node.radius ?? 0;
  return [
    Math.max(0, (node.cx ?? 0) + r),
    Math.max(0, (node.cy ?? 0) + r),
  ];
}

function svgStroke(kind: "path" | "arc", node: DomNode, ctx: BuildCtx, parent: ElementLike): void {
  const el = ctx.make("svg");
  atOrigin(el);
  const [w, h] = svgExtent(node, kind);
  el.attrs["width"] = Math.ceil(w);
  el.attrs["height"] = Math.ceil(h);
  el.style["overflow"] = "visible";
  el.style["pointer-events"] = "none";
  const p = ctx.make("path");
  p.attrs["d"] = kind === "path" ? pathData(node) : arcData(node);
  p.attrs["fill"] = "none";
  p.attrs["stroke"] = ctx.stroke ?? "currentColor";
  p.attrs["stroke-width"] = String(ctx.strokeWidth ?? 1);
  el.appendChild(p);
  parent.appendChild(el);
}

function pathData(node: DomNode): string {
  const pts = node.points ?? [];
  if (pts.length === 0) return "";
  const [x0, y0] = pts[0]!;
  let d = `M ${x0} ${y0}`;
  for (const [x, y] of pts.slice(1)) d += ` L ${x} ${y}`;
  return d;
}

// canvas arc semantics: angles are y-down (0 = +x, PI/2 = +y) and the
// stroke runs from start to end in the positive-angle direction — the
// svg sweep-flag 1 direction; delta > PI flips the large-arc flag.
function arcData(node: DomNode): string {
  const cx = node.cx ?? 0;
  const cy = node.cy ?? 0;
  const r = node.radius ?? 0;
  const start = node.start ?? 0;
  const end = node.end ?? 0;
  const x0 = cx + r * Math.cos(start);
  const y0 = cy + r * Math.sin(start);
  const x1 = cx + r * Math.cos(end);
  const y1 = cy + r * Math.sin(end);
  const delta = end - start;
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

export function buildPath(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  svgStroke("path", node, ctx, parent);
}

export function buildArc(ctx: BuildCtx, node: DomNode, parent: ElementLike): void {
  svgStroke("arc", node, ctx, parent);
}
