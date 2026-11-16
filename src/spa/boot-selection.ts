// Purpose: the SPA boot selection (deep links) — the pure parser behind
//   the gallery entry's first mount: ?demo=<id> opens that registry
//   entry, and ?debug=1 asks the mount seam for its debug handle.
// Responsibilities: bootSelection(search, demos) maps location.search
//   onto { demoIndex, debug }: the FIRST `demo` value selects the demo
//   whose id matches EXACTLY (case- and whitespace-sensitive); an
//   absent, unknown or malformed value selects the first registry
//   entry; `debug` is true only when the first `debug` value is
//   exactly "1". Pure — no DOM and no imports from the mount — and it
//   never throws on any query string.
// Rationale: the boot rules live outside main.ts so they are testable
//   without a browser (the e2e seam spec drives the same rules through
//   the real entry), and the entry parses location.search exactly once
//   — nav clicks and fallback mounts are runtime state, not query
//   state. URLSearchParams is reached structurally from globalThis:
//   tsconfig carries no DOM lib, and a host without the constructor
//   degrades to "no parameters" (the documented default boot) instead
//   of crashing the entry. Deep links are attacker-controlled input, so
//   every malformed string lands on the default rather than an error.

export interface BootSelection {
  readonly demoIndex: number;
  readonly debug: boolean;
}

// The two query parameters the entry understands.
const DEMO_PARAM = "demo";
const DEBUG_PARAM = "debug";

// Structural view of URLSearchParams: the parser needs one method, and
// `get` is first-occurrence-wins by definition.
interface ParamReader {
  get(name: string): string | null;
}

type ParamsCtor = new (init?: string) => ParamReader;

// The host global this module reaches structurally (tsconfig has no
// DOM lib): optional because an embedding may not provide the web
// platform at all.
interface HostGlobals {
  readonly URLSearchParams?: ParamsCtor;
}

// The default reader: no parameters at all, so every lookup misses.
const NO_PARAMS: ParamReader = { get: () => null };

// Resolve the search reader once per call. A missing constructor — or
// one rejecting the input — degrades to "no parameters", and
// bootSelection takes the documented default path.
function readParam(search: string): ParamReader {
  // structural host view: no DOM lib in tsconfig, and an embedding may
  // omit the constructor entirely
  const host = globalThis as HostGlobals;
  const ctor = host.URLSearchParams;
  if (ctor === undefined) return NO_PARAMS;
  try {
    return new ctor(search);
  } catch {
    return NO_PARAMS;
  }
}

export function bootSelection(
  search: string,
  demos: readonly { readonly id: string }[],
): BootSelection {
  const param = readParam(search);
  const id = param.get(DEMO_PARAM);
  // -1 keeps "no demo parameter" and "no matching id" on the same
  // documented default: the first registry entry.
  const index = id === null ? -1 : demos.findIndex((demo) => demo.id === id);
  return {
    demoIndex: index < 0 ? 0 : index,
    debug: param.get(DEBUG_PARAM) === "1",
  };
}