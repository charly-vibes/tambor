// Purpose: the render cache of the component model — a canonical
//   serialization of props maps as the cache key.
// Responsibilities: canonical (deterministic, cycle-safe serialization
//   with sorted object keys) and cacheKey (component name + canonical
//   props).
// Rationale: openspec/specs/component-model/spec.md is the design authority; the
//   as self-reference serialises to the cycle placeholder, which is
//   constant for every props map. Split from component.ts so no file
//   carries the model and its caching (tambor-272).

import type { ComponentCall } from "./component.ts";

// Scalar arm of canonical: a JSON-ish encoding for the scalar types,
// null for function values (unserializable → the whole subtree is), and
// undefined for object/symbol which continue to the object walk below.
function canonicalScalar(value: unknown): string | null | undefined {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return JSON.stringify(value);
    case "undefined":
      return "undefined";
    case "bigint":
      return `${value.toString()}n`;
    case "function":
      return null;
    case "object":
    case "symbol":
      return undefined;
  }
}

function canonical(value: unknown, seen: Set<object>): string | null {
  if (value === null) return "null";
  const scalar = canonicalScalar(value);
  if (scalar !== undefined) return scalar;
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

// Per-component-name LRU cap on retained props-key entries
// (tambor-4r7, the 54j.11 deferred eviction decision): apps whose props
// embed ever-changing values (timestamps, counters) used to grow the
// cache linearly (H6 hazard probe); a per-name Map already preserves
// insertion order, so bump-on-hit + evict-oldest is the whole policy.
// The cap sits far above the realistic long-session working set (the
// 54j.11 soak plateaus at 485 distinct states), so the bounded regime
// is unaffected and clear-on-redefine (render_cached) remains the
// full reset path.
export const RENDER_CACHE_MAX_ENTRIES = 1024;

function lruBump(byProps: Map<string, unknown>, key: string, value: unknown): void {
  // Map iteration is insertion order: delete + set moves key to newest
  byProps.delete(key);
  byProps.set(key, value);
}

function lruInsert(byProps: Map<string, unknown>, key: string, value: unknown): void {
  if (byProps.size >= RENDER_CACHE_MAX_ENTRIES) {
    const oldest = byProps.keys().next();
    if (!oldest.done) byProps.delete(oldest.value);
  }
  byProps.set(key, value);
}

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
  if (cached !== undefined) {
    lruBump(byProps, key, cached);
    return cached;
  }
  const fresh = resolve();
  lruInsert(byProps, key, fresh);
  return fresh;
}

// any component redefinition resets the cache (render_cached: the
// cache is reset when any component is redefined)
export function clearRenderCache(): void {
  renderCache.clear();
}

// Diagnostic introspection for the soak/profile meter (tambor-54j.11):
// how many props keys are retained, across how many component names.
// component-cache.ts sits outside the public barrel — this is not an
// app-facing API change.
export function renderCacheStats(): { components: number; entries: number } {
  let entries = 0;
  for (const byProps of renderCache.values()) entries += byProps.size;
  return { components: renderCache.size, entries };
}
