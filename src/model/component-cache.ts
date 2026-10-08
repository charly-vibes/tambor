// Purpose: the render cache of the component model — a canonical
//   serialization of props maps as the cache key.
// Responsibilities: canonical (deterministic, cycle-safe serialization
//   with sorted object keys) and cacheKey (component name + canonical
//   props).
// Rationale: specs/component-model.md is the design authority; the
//   as self-reference serialises to the cycle placeholder, which is
//   constant for every props map. Split from component.ts so no file
//   carries the model and its caching (tambor-272).

import type { ComponentCall } from "./component.ts";

function canonical(value: unknown, seen: Set<object>): string | null {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
    case "boolean":
      return JSON.stringify(value);
    case "undefined":
      return "undefined";
    case "bigint":
      return `${value.toString()}n`;
    case "function":
      return null;
  }
  const obj = value as object;
  if (seen.has(obj)) return '"<cycle>"';
  seen.add(obj);
  const out = Array.isArray(obj)
    ? canonicalArray(obj as unknown[], seen)
    : canonicalObject(obj as Record<string, unknown>, seen);
  seen.delete(obj);
  return out;
}

function canonicalArray(obj: readonly unknown[], seen: Set<object>): string | null {
  const parts = obj.map((v) => canonical(v, seen));
  return parts.some((p) => p === null) ? null : `[${parts.join(",")}]`;
}

function canonicalObject(obj: Record<string, unknown>, seen: Set<object>): string | null {
  const entries = Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1));
  const parts: (string | null)[] = entries.map(([k, v]) => {
    const cv = canonical(v, seen);
    return cv === null ? null : `${JSON.stringify(k)}:${cv}`;
  });
  return parts.some((p) => p === null) ? null : `{${parts.join(",")}}`;
}

// The cache key of a call: the component name plus its props map (the
// as self-reference serialises to the cycle placeholder, which is
// constant for every props map).
function cacheKey(c: ComponentCall): string | null {
  const key = canonical(c.props, new Set());
  return key === null ? null : `${c.component.name}\u0000${key}`;
}

// The keypath step for k, as plain data (state.paths).

const renderCache = new Map<string, Map<string, unknown>>();

// Rendering resolves a call's body output, replacing nested component
// calls with their rendered trees (recursive_components). An equal
// props map yields a cached render keyed by component name plus props;
// the cache is reset when any component is redefined (render_cached).
export function cachedRender(c: ComponentCall, resolve: () => unknown): unknown {
  const key = cacheKey(c);
  if (key === null) return resolve();
  let byProps = renderCache.get(c.component.name);
  if (byProps === undefined) {
    byProps = new Map<string, unknown>();
    renderCache.set(c.component.name, byProps);
  }
  const cached = byProps.get(key);
  if (cached !== undefined) return cached;
  const fresh = resolve();
  byProps.set(key, fresh);
  return fresh;
}

// any component redefinition resets the cache (render_cached: the
// cache is reset when any component is redefined)
export function clearRenderCache(): void {
  renderCache.clear();
}
