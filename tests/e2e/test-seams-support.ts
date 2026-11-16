// Purpose: the shared page helpers for the boot-seam browser specs — the
//   fixture navigation carrying a query string, the nav-button lookup,
//   the console/pageerror watcher, the metafile-derived chunk names the
//   fallback cases abort, and the structural readers for the drawn tree,
//   the opt-in debug handle and the service-worker registration.
// Responsibilities: openAt boots the fixture WITH a search string and
//   waits for the nav (the entry's last synchronous boot action) exactly
//   like drive.open does; watchErrors collects the app's console errors
//   and unhandled rejections while filtering the deliberate abort noise;
//   readMeta/demoChunk/chunkCarrying resolve content-hashed chunk names
//   from the build's own metafile, never a hardcoded hash;
//   rejectChunklessLoaders replaces the two chunk-less (synchronous)
//   loaders on the LOADED registry module; drawnProjection reads the tree
//   the browser laid out; tamborDemo/tamborStateJson read the opt-in
//   debug handle; instrumentSwRegistration/swAttempts count the
//   service-worker registration attempts.
// Rationale: three specs share these seams — boot selection + the
//   failed-chunk fallback, the debug handle lifecycle, and debug
//   inertness + flag composition — so a second copy of a helper (the
//   chunk-name derivation above all) would drift. Every page-side read is
//   structural: the repo tsconfig carries no DOM lib.

import type { Page } from "@playwright/test";
// @ts-expect-error node builtin (tsconfig types: vitest/globals only)
import { readFileSync } from "node:fs";
import type { MetaOutputs } from "../helpers/metafile.ts";

// The fixture page with a query string: drive.open pins the bare URL,
// and boot selection is a load-time decision, so deep-link boots must
// navigate to the same page WITH its search and then wait for the nav
// (the entry's last synchronous boot action) exactly like open() does.
export async function openAt(page: Page, search: string): Promise<void> {
  await page.goto(`/tests/e2e/gallery.html${search}`);
  await page.locator("nav button").first().waitFor({ state: "visible" });
}

// A nav button by its exact title ("todo" must not also match
// "todomvc").
export function demoButton(page: Page, title: string) {
  return page.getByRole("button", { name: title, exact: true });
}

// Console errors and unhandled rejections for the whole test. Noise
// from the deliberate request aborts is filtered: a killed module load
// logs a browser-level failure, while this gate is about the APP — no
// console.error and no rejection escaping the boot (Bombadil's
// noConsoleErrors rule).
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (/Failed to (load|fetch)|net::ERR_/.test(msg.text())) return;
    errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

// The build's own metafile (scripts/build-spa.mjs writes it): the ONLY
// place these specs learn content-hashed chunk names, so they never
// hardcode a hash.
export function readMeta(): MetaOutputs {
  const raw = readFileSync("demo-dist/meta.json", "utf8");
  const meta = JSON.parse(raw) as { readonly outputs: MetaOutputs };
  return meta.outputs;
}

// The eager chunk esbuild wraps around a dynamic-import target
// (metafile: entryPoint === the imported module). Aborting that file
// rejects the registry loader's import().
export function demoChunk(source: string): string {
  for (const [path, output] of Object.entries(readMeta())) {
    if (output.entryPoint === source) {
      return path.slice(path.lastIndexOf("/") + 1);
    }
  }
  throw new Error(`no dynamic-entry chunk for ${source}`);
}

// The chunk that carries a module's code when the module rides a shared
// chunk instead of owning an entry (gallery.ts is one of those).
export function chunkCarrying(source: string): string {
  for (const [path, output] of Object.entries(readMeta())) {
    if (Object.keys(output.inputs ?? {}).includes(source)) return path;
  }
  throw new Error(`no chunk carries ${source}`);
}

// The two registry demos that build their app from statically imported
// modules (counter, select) never request a chunk, so no route can fail
// them. The all-fail case replaces those loaders on the LOADED registry
// module: importing the chunk that carries gallery.ts in the page hits
// the module cache (same URL the bundle already loaded), and the demo
// array is the exported array whose items carry id + load.
export async function rejectChunklessLoaders(
  page: Page,
  ids: readonly string[],
): Promise<string[]> {
  const url = `/${chunkCarrying("src/spa/gallery.ts")}`;
  return await page.evaluate(
    async (arg: { readonly url: string; readonly ids: readonly string[] }) => {
      type Loader = { readonly id: string; load: () => Promise<unknown> };
      // the shape IS the guard: a present id of string type and a
      // present load of function type, so no separate `in` probes
      const isLoader = (value: unknown): value is Loader => {
        if (value === null || typeof value !== "object") return false;
        const { id, load } = value as { id?: unknown; load?: unknown };
        return typeof id === "string" && typeof load === "function";
      };
      const mod = (await import(arg.url)) as Record<string, unknown>;
      for (const value of Object.values(mod)) {
        if (!Array.isArray(value)) continue;
        const exported: unknown[] = value;
        const demos = exported.filter(isLoader);
        if (demos.length === 0 || demos.length !== exported.length) continue;
        const patched: string[] = [];
        for (const demo of demos) {
          if (!arg.ids.includes(demo.id)) continue;
          demo.load = () =>
            Promise.reject(new Error(`test: ${demo.id} module unavailable`));
          patched.push(demo.id);
        }
        return patched;
      }
      return [];
    },
    { url, ids },
  );
}

// The drawn tree as the browser actually laid it out: the root's
// innerText plus every element under the drawn root, in document order,
// with its tag, text and integer-rounded page-space box. Scoped to
// "#demo > div" so the blurb — a sibling appended after the mount —
// can never enter the comparison, and read from getBoundingClientRect
// because the assertion is about the layout the user sees, not the view
// tree the backend intended.
interface DrawnElement {
  readonly tagName: string;
  readonly textContent: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface DrawnProjection {
  readonly text: string;
  readonly elements: readonly DrawnElement[];
}

// structural host view: tsconfig carries no DOM lib
interface HostRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface HostElement {
  readonly tagName: string;
  readonly textContent: string | null;
  readonly innerText: string;
  getBoundingClientRect(): HostRect;
  querySelectorAll(selector: string): ArrayLike<HostElement>;
}

interface HostDoc {
  querySelector(selector: string): HostElement | null;
}

// A named in-page function (Playwright serializes its source), so the
// projection stays inside the page and each function stays small.
function drawnProjectionInPage(): DrawnProjection {
  const host = globalThis as { document?: HostDoc };
  const doc = host.document;
  const root = doc?.querySelector("#demo > div") ?? null;
  if (root === null) throw new Error("the drawn root is not mounted");
  const project = (element: HostElement): DrawnElement => {
    const box = element.getBoundingClientRect();
    return {
      tagName: element.tagName,
      textContent: element.textContent ?? "",
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
    };
  };
  return {
    text: root.innerText,
    elements: [root, ...Array.from(root.querySelectorAll("*"))].map(project),
  };
}

export async function drawnProjection(page: Page): Promise<DrawnProjection> {
  return await page.evaluate(drawnProjectionInPage);
}

// The handle's demo id; throws while the mount has not published it yet,
// which is what lets expect.poll retry instead of racing the async chunk
// load (or reading a handle a later navigation already removed).
export async function tamborDemo(page: Page): Promise<string> {
  const demo = await page.evaluate(() => {
    const host = globalThis as { __tambor?: { readonly demo: string } };
    return host.__tambor?.demo ?? null;
  });
  if (demo === null) throw new Error("__tambor was not published");
  return demo;
}

// The state as the JSON projection the ticket asks for — JSON.stringify
// of the handle's live state, never a Playwright-serialized copy, so
// key order and value shapes are the app's own.
export async function tamborStateJson(page: Page): Promise<string> {
  const json = await page.evaluate(() => {
    const host = globalThis as { __tambor?: { state(): unknown } };
    const handle = host.__tambor;
    return handle === undefined ? null : JSON.stringify(handle.state());
  });
  if (typeof json !== "string") {
    throw new Error("__tambor did not expose a serializable state");
  }
  return json;
}

// Chromium fetches a service-worker SCRIPT out of band, so page.route
// never sees it. The registration ATTEMPT is what this case pins, so an
// init script (installed before any boot, re-run on every navigation)
// wraps navigator.serviceWorker.register, counts the calls and remembers
// the last URL argument. The original call stays reachable and its
// promise is returned untouched — the entry's own .catch is unchanged.
export async function instrumentSwRegistration(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // structural host view: tsconfig carries no DOM lib
    interface HostRegister {
      (url: string, options?: { readonly type?: string }): Promise<unknown>;
    }
    interface HostContainer {
      register: HostRegister;
    }
    const host = globalThis as {
      readonly navigator?: { readonly serviceWorker?: HostContainer };
      __swRegisterCalls?: number;
      __swRegisterUrl?: string | null;
    };
    host.__swRegisterCalls = 0;
    host.__swRegisterUrl = null;
    const container = host.navigator?.serviceWorker;
    if (container === undefined) return;
    const original = container.register;
    container.register = (url, options) => {
      host.__swRegisterCalls = (host.__swRegisterCalls ?? 0) + 1;
      host.__swRegisterUrl = url;
      return original.call(container, url, options);
    };
  });
}

// The attempts counted on THIS document (a navigation re-runs the init
// script, so the counters restart): how many register calls happened and
// with which URL.
interface SwAttempts {
  readonly calls: number;
  readonly url: string | null;
}

export async function swAttempts(page: Page): Promise<SwAttempts> {
  return await page.evaluate(() => {
    // structural host view: tsconfig carries no DOM lib
    const host = globalThis as {
      __swRegisterCalls?: number;
      __swRegisterUrl?: string | null;
    };
    return {
      calls: host.__swRegisterCalls ?? 0,
      url: host.__swRegisterUrl ?? null,
    };
  });
}
