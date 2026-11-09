// Purpose: the shared static-import closure walk over esbuild metafile
//   outputs (add-spa-delivery / add-docs-site chunk-graph contracts) —
//   the ONE implementation of "which outputs ride a chunk's initial
//   load", imported by the spa-delivery, docs-embeds-chunk and
//   docs-delivery contract files and by the docs-delivery-budget seam
//   (C-2 review resolution: delivery was the duplication hub, with twin
//   walk bodies in three files).
// Responsibilities: export the metafile output/import types, the
//   static-edge predicate isStaticImport, and the closure walk
//   staticClosure(entry, outputs).
// Rationale: a dynamic-import edge is the lazy boundary that keeps
//   example/page modules off the initial chunk; only the eager
//   import-statement kind (and unmarked externals) rides a chunk's
//   closure. One walk keeps the contract files and the gzip-budget
//   seam honest with each other — a drift between twin traversals
//   would silently weaken the split-out guarantees.

export interface MetaImport {
  readonly path: string;
  readonly external?: boolean;
  readonly kind?: string;
}

export interface MetaOutput {
  readonly bytes: number;
  readonly entryPoint?: string;
  readonly imports?: readonly MetaImport[];
  readonly inputs?: Readonly<Record<string, unknown>>;
}

export type MetaOutputs = Readonly<Record<string, MetaOutput>>;

// A static-import edge rides the chunk's closure: locals only, and only
// the eager import-statement kind — dynamic import() edges are the lazy
// path that keeps generated page bodies / example modules out of the
// initial chunk.
export function isStaticImport(imp: MetaImport): boolean {
  return (
    imp.external !== true &&
    (imp.kind === undefined || imp.kind === "import-statement")
  );
}

// The static-import transitive closure of an entry output (the entry
// included) — the exact output set that must be present for the entry
// to boot.
export function staticClosure(
  entry: string,
  outputs: MetaOutputs,
): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const imp of outputs[current]?.imports ?? []) {
      if (isStaticImport(imp) && !seen.has(imp.path)) {
        seen.add(imp.path);
        queue.push(imp.path);
      }
    }
  }
  return seen;
}