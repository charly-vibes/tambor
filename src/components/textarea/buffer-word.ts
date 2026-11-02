// Purpose: the class-based word rule of the editor buffer (design D7) —
//   the character classes and the word runs the word navigation moves
//   walk.
// Responsibilities: classify a code unit as word, space or other, and
//   find the word-run boundaries (the run that starts at a position, the
//   run that ends at a position, the next and the previous word run).
// Rationale: openspec/changes/add-textarea-editing-model/design.md D7 —
//   the word rule is class-based (a word is a run of letters, digits and
//   underscore; whitespace and each punctuation run are their own stops),
//   deterministic and headless. The rule is its own seam so the buffer
//   facade stays a facade: the navigation moves call it, and the rule
//   has one owner.

export type CharClass = "word" | "space" | "other";

// The character class of the code unit at index `i`: "word" for
// letters, digits and underscore (design D7), "space" for whitespace
// and "other" for every other character. The word rule is class-based
// and headless: a word is a run of word-class characters, while
// whitespace and each punctuation run are their own stops.
export function charClass(text: string, i: number): CharClass {
  const ch = text[i];
  if (ch === undefined) return "other";
  if (/[\p{L}\p{N}_]/u.test(ch)) return "word";
  if (/\s/u.test(ch)) return "space";
  return "other";
}

// The exclusive end of the word run that starts at or before `from`
// (a word is a maximal run of word-class characters).
export function wordRunEnd(text: string, from: number): number {
  let end = from + 1;
  while (end < text.length && charClass(text, end) === "word") {
    end += 1;
  }
  return end;
}

// The inclusive start of the word run that ends at `from`.
export function wordRunStart(text: string, from: number): number {
  let start = from;
  while (start > 0 && charClass(text, start - 1) === "word") {
    start -= 1;
  }
  return start;
}

// The exclusive end of the next word run at or after `i`; when there is
// none it returns `i` (the move is a no-op).
export function nextWordEnd(text: string, i: number): number {
  let j = i;
  while (j < text.length && charClass(text, j) !== "word") {
    j += 1;
  }
  return j < text.length ? wordRunEnd(text, j) : i;
}

// The exclusive end of the previous word run before `i`; when there is
// none it returns `i` (the move is a no-op).
export function prevWordEnd(text: string, i: number): number {
  let j = i - 1;
  while (j >= 0 && charClass(text, j) !== "word") {
    j -= 1;
  }
  return j >= 0 ? j + 1 : i;
}
