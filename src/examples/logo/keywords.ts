// Purpose: the runtime EN/ES keyword tables of the example.logo demo
//   (tambor-y9d.5) — dialect words resolved to canonical keywords at
//   runtime, seeded from power-turtle's Spanish CSV with its confirmed
//   gaps fixed, per the power-turtle cold read.
// Responsibilities: the Dialect union ("en" | "es"); LookupResult —
//   the typed lookup outcome (a miss is returned, never thrown);
//   lookup(table, token); translateTokens(toks, table) — the
//   token-level alias pass (numbers, :variables and brackets pass
//   through); TABLES, the per-dialect alias tables; DIALECTS order.
// Rationale: insights/power-turtle.md P6-P8 is the design authority —
//   "use a runtime keyword table consulted by the evaluator rather
//   than generated namespaces". Provenance of the Spanish seed:
//   https://github.com/timothypratley/power-turtle
//   translations/es/power-turtle.api.turtle.csv @ b7a9aaf
//   (commit b7a9aafd8ed7c5c7b5c19419de0a203e5e5dc288), fetched
//   2026-10-16. The CSV maps clojure-turtle words, so only words with
//   a tambor counterpart are aliased; every word below is verified
//   against the reference named in its comment — never memory (F08).

export type Dialect = "en" | "es";

export const DIALECTS: readonly Dialect[] = ["en", "es"];

// dialectWord → canonicalKeyword. The canonical words themselves are
// always accepted (the dispatch table owns them); aliases only add
// dialect spellings on top.
export interface KeywordTable {
  readonly dialect: Dialect;
  readonly aliases: Readonly<Record<string, string>>;
}

// The typed lookup outcome: a hit carries the canonical keyword; a
// miss carries the offending token. No throw either way.
export type LookupResult =
  | { readonly ok: true; readonly canonical: string }
  | { readonly ok: false; readonly token: string };

export function lookup(table: KeywordTable, token: string): LookupResult {
  const hit = table.aliases[token];
  if (hit !== undefined) return { ok: true, canonical: hit };
  // The canonical dialect's words are themselves keywords; a miss there
  // is still typed (the dispatcher owns the "I don't know how to …"
  // failure for words no dialect aliases).
  if (table.dialect === "en") return { ok: true, canonical: token };
  return { ok: false, token };
}

// Token-level translation: hits become their canonical keyword, misses
// pass through untouched (the interpreter reports them as unknown
// commands, which is the honest failure for both dialects).
export function translateTokens(
  toks: readonly string[],
  table: KeywordTable,
): readonly string[] {
  return toks.map((t) => {
    const r = lookup(table, t);
    return r.ok ? r.canonical : t;
  });
}

// EN is the canonical dialect: every canonical word is its own
// keyword, so the alias table is empty.
const EN: KeywordTable = { dialect: "en", aliases: {} };

// ES — seeded from the CSV (provenance above). Verification
// references: [W] es.wikipedia "Logo (lenguaje de programación)"
// ("avanzar 100 girarderecha 90 girarizquierda 30"; "repite 4 [av 100
// gd 90]"); [M] es.wikipedia "MSWLogo" instruction list ("AV número
// Avanza la tortuga", "REPITE número [instrucciones]", "PONCL [R G B]
// Fija color del lápiz"). [C] = verbatim from the CSV.
const ES: KeywordTable = {
  dialect: "es",
  aliases: {
    // Movement (CSV [C]; movement words confirmed by [W]/[M]).
    avanzar: "forward", // [C] CSV forward→avanzar; [W] "avanzar 100"
    avanza: "forward", // [M] "AV número Avanza la tortuga"
    retroceder: "back", // [C] CSV back→retroceder
    derecha: "right", // [C] CSV right→derecha (machine-made; kept + variants)
    izquierda: "left", // [C] CSV left→izquierda (machine-made; kept + variants)
    giraderecha: "right", // [W] example spelling "girarderecha 90"
    girarderecha: "right", // [W] verbatim spelling
    giraizquierda: "left", // [W] example spelling "girarizquierda 30"
    girarizquierda: "left", // [W] verbatim spelling
    // Pen (CSV [C]).
    "levantar-pincel": "pu", // [C] CSV penup→levantar-pincel
    "bajar-pincel": "pd", // [C] CSV pendown→bajar-pincel
    // Position (CSV [C]).
    inicio: "home", // [C] CSV home→inicio
    // Colors (CSV [C] for rojo/verde/azul; naranja/morado/negro are
    // the CSV's own gap — standard Spanish color names, dictionary
    // level, not yet signed off by a Spanish speaker).
    rojo: "red", // [C]
    verde: "green", // [C]
    azul: "blue", // [C]
    naranja: "orange", // CSV gap — dictionary-verified only
    morado: "purple", // CSV gap — dictionary-verified only
    negro: "black", // CSV gap — dictionary-verified only
    // The CSV's two confirmed gaps (insights P6), fixed and verified:
    repite: "repeat", // CSV missing repeat; [W] "repite 4 [av 100 gd 90]"; [M] "REPITE número [instrucciones]"
    poncolor: "setcolor", // CSV missing color; [M] "PONCL [R G B] Fija color del lápiz" (the PON* setcolor family)
    // The CSV's typo (insights P7): end-fill→"termiar-llenado" is
    // wrong; the corrected word is "terminar-llenado". power-turtle's
    // start-fill/end-fill have no tambor counterpart, so neither is
    // aliased — recorded here as CSV provenance only.
  },
};

export const TABLES: Readonly<Record<Dialect, KeywordTable>> = { en: EN, es: ES };
