// Purpose: the runtime keyword-table contracts (tambor-y9d.5) — the
//   EN/ES dialect tables seeded from power-turtle's Spanish CSV, with
//   the CSV's confirmed gaps fixed and the dialect words verified
//   against references (see src/examples/logo/keywords.ts provenance).
// Responsibilities: pin (1) lookup resolving a dialect word to its
//   canonical keyword; (2) lookup reporting an unknown keyword as a
//   typed failure, never a throw; (3) token translation leaving
//   numbers, :variables and brackets untouched; (4) Spanish programs
//   drawing the same figures as their English twins; (5) the Spanish
//   examples running end-to-end; (6) English staying the default
//   dialect; (7) the demo's dialect toggle in state and view.
// Rationale: the power-turtle cold read (insights/power-turtle.md P6-P8)
//   is the design authority — runtime table consulted by the evaluator
//   rather than generated namespaces; the CSV words were verified
//   against es.wikipedia's Logo and MSWLogo articles, not memory.

import { describe, expect, it } from "vitest";

import {
  DIALECTS,
  lookup,
  TABLES,
  translateTokens,
  type LookupResult,
} from "../src/examples/logo/keywords.ts";
import {
  derive,
  EXAMPLES,
  EXAMPLES_ES,
} from "../src/examples/logo/interpreter.ts";
import {
  logoState,
  logoView,
  runLogo,
  type LogoState,
} from "../src/examples/logo/logo.ts";
import { scanOf } from "./helpers/scan.ts";
import type { ButtonNode } from "../src/views/model.ts";

describe("logo-keywords — the runtime dialect tables", () => {
  it("lookup resolves a dialect word to its canonical keyword", () => {
    expect(lookup(TABLES["es"], "avanza")).toEqual({ ok: true, canonical: "forward" });
    expect(lookup(TABLES["es"], "repite")).toEqual({ ok: true, canonical: "repeat" });
    expect(lookup(TABLES["es"], "poncolor")).toEqual({ ok: true, canonical: "setcolor" });
    expect(lookup(TABLES["es"], "rojo")).toEqual({ ok: true, canonical: "red" });
    expect(lookup(TABLES["en"], "fd")).toEqual({ ok: true, canonical: "fd" });
  });

  it("lookup reports an unknown keyword as a typed failure, not a throw", () => {
    let r: LookupResult | undefined;
    expect(() => {
      r = lookup(TABLES["es"], "zzz");
    }).not.toThrow();
    expect(r).toEqual({ ok: false, token: "zzz" });
  });

  it("translateTokens leaves numbers, :variables and brackets untouched", () => {
    const toks = ["repite", "4", "[", "avanza", "80", "giraderecha", "90", "]", ":n"];
    expect(translateTokens(toks, TABLES["es"])).toEqual([
      "repeat",
      "4",
      "[",
      "forward",
      "80",
      "right",
      "90",
      "]",
      ":n",
    ]);
  });

  it("a Spanish program draws the same figure as its English twin", () => {
    const es = derive([{ text: "repite 4 [avanza 80 giraderecha 90]" }], false, "es");
    const en = derive([{ text: EXAMPLES["square"] as string }], false, "en");
    expect(es.trace.length).toBe(en.trace.length);
    expect(es.trace[0]).toEqual(en.trace[0]);
  });

  it("the Spanish example programs run end-to-end", () => {
    for (const src of Object.values(EXAMPLES_ES)) {
      expect(derive([{ text: src }], false, "es").trace.length).toBeGreaterThan(0);
    }
  });

  it("English stays the default dialect", () => {
    expect(DIALECTS[0]).toBe("en");
    expect(() => derive([{ text: "repite 4 [avanza 80]" }], false)).toThrow(
      /don't know how to repite/,
    );
    expect(logoState().dialect).toBe("en");
  });

  it("an unknown word in a Spanish program names the word", () => {
    expect(() => derive([{ text: "giraarriba 90" }], false, "es")).toThrow(
      /don't know how to giraarriba/,
    );
  });
});

describe("logo-keywords — the demo's dialect toggle", () => {
  it("runLogo consults the state dialect for validation", () => {
    const s0: LogoState = { ...logoState(), dialect: "es", src: "repite 2 [avanza 40]" };
    const s1 = runLogo(s0);
    expect(s1.entries.length).toBe(1);
    expect(s1.err).toBe("");
  });

  it("the English dialect rejects a Spanish program", () => {
    const s0: LogoState = { ...logoState(), src: "repite 2 [avanza 40]" };
    expect(runLogo(s0).err).toMatch(/don't know how to repite/);
  });

  it("the view offers the toggle and the dialect's example loaders", () => {
    const texts = (s: LogoState): readonly string[] =>
      scanOf(logoView(s, {}))
        .map((f) => (f.node.type === "button" ? (f.node as ButtonNode).text : ""))
        .filter((t) => t.length > 0);
    const en: LogoState = logoState();
    expect(texts(en)).toContain("Español");
    expect(texts(en)).toContain("square");
    const es: LogoState = { ...logoState(), dialect: "es" };
    expect(texts(es)).toContain("English");
    expect(texts(es)).toContain("cuadrado");
  });
});
