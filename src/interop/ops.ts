// Purpose: interop.model — the DataOps seam, the one optional adapter
//   between the library and a host language's collections.
// Responsibilities: define the five-function ops shape (get, assoc,
//   toArray, tag, plus dissoc where deletion is used) and the default
//   jsOps implementation over plain JavaScript data, defaulting to
//   plain JS operations when no ops are given (data_ops_seam).
// Rationale: openspec/specs/interop-model/spec.md is the design authority. The
//   library never knows what a host keyword or a persistent map is:
//   tag normalization (tag_namespace_kept) and collection access live
//   entirely inside the caller-supplied ops object, so ClojureScript
//   data crosses the boundary unconverted (no_boundary_conversion) and
//   two apps with different ops can coexist (ops_bound_to_app). The
//   shape mirrors experiments/tambor-ops.mjs, the probe that measured
//   the seam at about 0.07 ms per dispatch on a 5000-item state.

/** The optional data-ops seam. Every function that reads or writes
 * user state or reads a collection accepts one of these; missing ops
 * mean plain JavaScript operations. */
export interface DataOps {
  /** read a value out of a host collection (map, vector, nil) */
  get(container: unknown, key: unknown): unknown;
  /** write a value into a host collection, immutably */
  assoc(container: unknown, key: unknown, value: unknown): unknown;
  /** remove a key from a host collection, immutably (deletion only) */
  dissoc?(container: unknown, key: unknown): unknown;
  /** normalize any documented list — array, rest args, lazy seq — to an
   * array once, at the boundary (iterable_inputs) */
  toArray(x: unknown): unknown[];
  /** turn a host tag (keyword) into its opaque string form: ns slash
   * name, or name when it has no namespace (tag_namespace_kept) */
  tag(x: unknown): unknown;
}

/** The default ops: plain JavaScript operations on plain data. */
export const jsOps: DataOps = {
  get: (container, key) =>
    container === null || container === undefined ? undefined : (container as Record<PropertyKey, unknown>)[key as PropertyKey],
  assoc: (container, key, value) => {
    if (container === null || container === undefined) {
      return { [key as PropertyKey]: value };
    }
    if (Array.isArray(container)) {
      const out = [...(container as unknown[])];
      out[key as number] = value;
      return out;
    }
    return { ...(container as Record<PropertyKey, unknown>), [key as PropertyKey]: value };
  },
  dissoc: (container, key) => {
    if (Array.isArray(container)) {
      return (container as unknown[]).filter((_, i) => i !== (key as number));
    }
    const out = { ...(container as Record<PropertyKey, unknown>) };
    delete out[key as PropertyKey];
    return out;
  },
  toArray: (x) => {
    if (x === null || x === undefined) return [];
    if (Array.isArray(x)) return [...x];
    const iterable = x as Iterable<unknown>;
    if (typeof iterable[Symbol.iterator] === "function") return Array.from(iterable);
    return [x];
  },
  // a plain-JS tag is already its opaque string form
  tag: (x) => x,
};
