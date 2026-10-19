// Purpose: the memo component (components.memo) — a subtree memo
//   boundary whose cache key is state identity, sitting above expensive
//   derives (tambor-54j.8.4).
// Responsibilities: memo(build) returns a memoized render function —
//   calling it with an object key returns the cached subtree when the
//   key's identity is unchanged and rebuilds otherwise; the identity
//   and equality contract (identity-keyed, object keys only, no deep
//   equality) and the invalidation-soundness contract (state changes
//   only through dispatch, so a state slice's identity is a sound
//   invalidation signal) live in its doc and the spec corpus.
// Rationale: openspec/specs/components-memo/spec.md is the design authority.
//   The route-time view cache (tambor-8xm) skips whole-view derivation
//   only when NO state changed; a view whose most subtrees are
//   unchanged still re-derives all of them on every state change.
//   Memo closes that gap at component granularity: an app maps its
//   per-item subtrees through a module-level memoized renderer, and
//   only the items whose identity changed re-derive. The boundary
//   design follows the render-cache key-cost finding
//   (benchmarks/findings-kit.md, tambor-54j.11): a cache hit here is
//   one WeakMap lookup (~0.1 µs) against the ~4.6–5.1 µs serialization
//   key the component render cache pays, so this memo pays for
//   boundaries above derives that cost more than a lookup — cheap
//   boundaries are harmless but pointless, expensive ones win. Identity
//   is the invalidation signal for the same reason 8xm's route-time
//   cache is sound: state changes only through dispatch — including
//   cell-writeback closures, which capture state and write back
//   through dispatch (effect-dispatch's registry-aware update) — and
//   every dispatch produces fresh identity for each changed slice
//   (state-paths immutability with structural sharing), so an
//   unchanged slice keeps its identity and a changed slice loses it.

// A memoized render function: the build is called at most once per
// distinct key identity; every other call returns the cached subtree.
export type Memoized<K extends object, V> = (key: K) => V;

// The per-build cache: one WeakMap per memoized renderer, keyed on the
// key object's identity. WeakMap so a key that leaves app state
// (removed rows, replaced cells) lets its cached subtree be collected
// — the memo never retains keys the app dropped.
export function memo<K extends object, V>(
  build: (key: K) => V,
): Memoized<K, V> {
  const cache = new WeakMap<K, V>();
  return (key: K): V => {
    // identity is the invalidation signal: only objects have one to
    // key on (a primitive key would need deep equality — the ~5 µs
    // serialization key the component render cache already pays — so
    // the contract rejects it loudly instead of silently mis-keying).
    if (typeof key !== "object" || key === null) {
      throw new TypeError(
        "memo: the key must be an object — identity is the invalidation signal",
      );
    }
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const fresh = build(key);
    cache.set(key, fresh);
    return fresh;
  };
}
