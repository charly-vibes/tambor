// Purpose: the demo SPA service worker (tambor-dfk, add-spa-delivery) —
//   the installable/offline shell for the gallery demo build: hashed
//   assets served cache-first, navigation network-first with a cache
//   fallback, cache name content-hash versioned so a deploy invalidates
//   the previous cache and the activate handler prunes it.
// Responsibilities: pure, unit-testable serving logic — cacheNameFor
//   (content-derived cache version), isNavigation, respond (the
//   strategy) — plus the runtime wiring (install precaches the asset
//   manifest's URL list, activate prunes old caches, fetch routes
//   through respond) guarded so non-SW runtimes (vitest/jsdom, plain
//   node) never touch the lifecycle.
// Rationale: openspec/changes/add-spa-delivery/specs/distribution-packaging
//   is the design authority. Source stays TypeScript (esbuild emits the
//   artifact — "we don't hand-write JS"); the asset list is NOT
//   compiled in — the worker reads demo-dist/asset-manifest.json at
//   install so the build script stays a single pass and the version
//   hash derives from the manifest the deploy actually shipped.

// --- pure serving logic (unit-tested) --------------------------------------

export const CACHE_PREFIX = "tambor-spa";
export const MANIFEST_URL = "./asset-manifest.json";

// djb2 over the manifest text — deterministic, dependency-free, and
// sufficient to distinguish deploys (the esbuild chunk names already
// carry full content hashes; the version only needs to tell cache
// generations apart).
function hash32(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function cacheNameFor(manifestJson: string): string {
  return `${CACHE_PREFIX}-v-${hash32(manifestJson)}`;
}

export function isNavigation(request: { mode?: string }): boolean {
  return request.mode === "navigate";
}

// The serving strategy's deps, reached structurally so the pure logic
// never needs lib.dom / lib.webworker types (the repo stays DOM-free
// at the type level; the host seam carries the real shapes).
export interface CacheLike {
  match(url: string): Promise<{ body?: unknown } | undefined>;
}

export interface ResponseLike {
  body?: unknown;
}

export interface ServeDeps {
  readonly cache: CacheLike;
  network(url: string): Promise<ResponseLike>;
  readonly shellUrl: string;
}

// cache-first for hashed assets (everything that is not a navigation —
// chunk names are content-hashed, so a cache hit is provably fresh for
// its generation), network-first for navigation with the cached shell
// as the offline fallback.
export async function respond(
  request: { url: string; mode?: string },
  deps: ServeDeps,
): Promise<ResponseLike> {
  if (isNavigation(request)) {
    try {
      return await deps.network(request.url);
    } catch {
      const own = await deps.cache.match(request.url);
      if (own !== undefined) return own;
      const shell = await deps.cache.match(deps.shellUrl);
      if (shell !== undefined) return shell;
      throw new Error("offline and shell not cached");
    }
  }
  const cached = await deps.cache.match(request.url);
  if (cached !== undefined) return cached;
  return await deps.network(request.url);
}

// --- runtime wiring (guarded: inert without a SW global) -------------------

interface CacheStorageLike {
  open(name: string): Promise<{
    addAll(urls: readonly string[]): Promise<void>;
  }>;
  match(request: unknown): Promise<unknown>;
  keys(): Promise<readonly string[]>;
  delete(name: string): Promise<boolean>;
}

interface SwGlobal {
  caches?: CacheStorageLike;
  fetch?: (input: unknown) => Promise<unknown>;
  addEventListener?: (type: string, handler: (event: unknown) => void) => void;
  location?: { href: string };
  registration?: { scope: string };
}

interface ExtendableEvent {
  waitUntil?(promise: Promise<unknown>): void;
}

interface FetchEvent {
  request: { url: string; mode: string };
  respondWith(response: Promise<unknown>): void;
}

function swGlobal(): SwGlobal {
  return globalThis as unknown as SwGlobal;
}

function assetUrls(manifest: readonly { url: string }[]): string[] {
  return manifest.map((a) => a.url);
}

async function precache(
  g: SwGlobal,
  name: string,
  manifestText: string,
): Promise<void> {
  const cache = await g.caches!.open(name);
  const manifest = JSON.parse(manifestText) as readonly { url: string }[];
  await cache.addAll([...assetUrls(manifest), MANIFEST_URL]);
}

async function install(g: SwGlobal): Promise<void> {
  // relative fetch resolves against the worker script's own URL —
  // string forms only (the repo stays free of host-global types)
  const manifestText = await (
    await (g.fetch!(MANIFEST_URL) as Promise<{ text(): Promise<string> }>)
  ).text();
  const name = cacheNameFor(manifestText);
  await precache(g, name, manifestText);
  // content-hash versioned cache: a new deploy computes a new name, so
  // every pre-existing generation is stale by construction — prune it.
  for (const key of await g.caches!.keys()) {
    if (key !== name) await g.caches!.delete(key);
  }
}

function wire(g: SwGlobal): void {
  g.addEventListener!("install", (event) => {
    (event as ExtendableEvent).waitUntil?.(install(g));
  });
  g.addEventListener!("fetch", (event) => {
    const fe = event as FetchEvent;
    const cacheLike: CacheLike = {
      // real Cache.match accepts URL strings — the runtime seam is the
      // string form the pure logic already speaks
      match: async (url: string) =>
        (await g.caches!.match(url)) as { body?: unknown } | undefined,
    };
    const scope = g.registration?.scope ?? g.location?.href ?? "/";
    const shellUrl = scope.endsWith("/")
      ? `${scope}index.html`
      : `${scope}/index.html`;
    fe.respondWith(
      respond(fe.request, {
        cache: cacheLike,
        network: (url) => g.fetch!(url) as Promise<ResponseLike>,
        shellUrl,
      }),
    );
  });
}

// jsdom/vitest/node have no `caches` global — the wiring stays inert
// there; a real service-worker runtime self-registers via the entry.
const g = swGlobal();
if (g.caches !== undefined && g.addEventListener !== undefined) {
  wire(g);
}
