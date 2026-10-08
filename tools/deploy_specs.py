#!/usr/bin/env python3
"""Deploy specodelic corpus specs into the openspec layout.

Transform (per corpus file specs/<name>.md -> openspec/specs/<name>/spec.md):
  1. the frontmatter id is kept — specodelic Revision 18's
     id_matches_file derives a spec.md's expected id from its parent
     directory (the former `id: spec` dual-format self-containment is
     retired; refs now resolve corpus-wide)
  2. own-id [[links]] are normalized to [[<own-id>.<row>]] (corpus-wide
     addressing); foreign-id [[links]] in structured table cells are
     still downgraded to bare prose — contract derivation ownership
     stays with the deploying file's own properties
  3. a ## Requirements mirror is generated from the Properties table:
     one Scenario per property, each carrying a
     - **VERIFIES** [[<own-id>.<property-id>]] bullet (ah sync coverage
     link)
"""
import re
import sys
import pathlib

LINK = re.compile(r"\[\[([a-zA-Z0-9_.\-]+)\]\]")


def parse_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def is_sep(cells):
    return all(set(c) <= set(":- ") and c for c in cells)


def is_own_link(gid, own):
    return gid == own or gid.startswith(own + ".")


def rewrite_cell(cell, own):
    def sub(m):
        gid = m.group(1)
        if is_own_link(gid, own):
            return m.group(0)
        return f"{gid} (cross-file)"

    return LINK.sub(sub, cell)


def table_spans(lines):
    """Yield (body_start, body_end) for each markdown table's data rows."""
    i = 0
    while i < len(lines) - 1:
        header_ok = lines[i].strip().startswith("|")
        sep_ok = lines[i + 1].strip().startswith("|") and is_sep(parse_row(lines[i + 1]))
        if not (header_ok and sep_ok):
            i += 1
            continue
        j = i + 2
        while j < len(lines) and lines[j].strip().startswith("|"):
            j += 1
        yield i + 2, j
        i = j


def rewrite(text, own):
    # own-id links are already in corpus addressing ([[own]] / [[own.row]])
    # under Revision 18 — nothing to rewrite; foreign links in table cells
    # are downgraded by rewrite_cell below.
    lines = text.splitlines()
    for start, end in table_spans(lines):
        for k in range(start, end):
            if not lines[k].strip().startswith("|"):
                continue
            cells = [rewrite_cell(c, own) for c in parse_row(lines[k])]
            lines[k] = "| " + " | ".join(cells) + " |"
    return "\n".join(lines) + "\n"


def properties_rows(lines):
    """Parse the ## Properties table into a list of cell dicts."""
    rows = []
    cols = None
    in_props = False
    for line in lines:
        stripped = line.strip()
        in_props = in_props or stripped == "## Properties"
        if not in_props:
            continue
        if stripped.startswith("## ") and stripped != "## Properties":
            break
        if not stripped.startswith("|"):
            continue
        cells = parse_row(stripped)
        if is_sep(cells):
            continue
        if cols is None:
            cols = [c.lower() for c in cells]
            continue
        rows.append(dict(zip(cols, cells)))
    return rows


def requirement_block(own, prop):
    pid = prop["id"]
    gen = prop.get("generator") or "the documented inputs"
    pred = prop.get("predicate") or ""
    return [
        f"#### Scenario: {pid}",
        "",
        f"- **WHEN** {gen}",
        f"- **THEN** {pred}",
        f"- **VERIFIES** [[{own}.{pid}]]",
        "",
    ]


def requirements_mirror(text, own):
    mirror = [
        "## Requirements",
        "",
        "### Requirement: Property coverage mirror",
        "",
        "Every property row is verified by exactly one dedicated scenario;",
        "`ah sync` derives one contract per VERIFIES link.",
        "",
    ]
    for prop in properties_rows(text.splitlines()):
        mirror += requirement_block(own, prop)
    return text.rstrip("\n") + "\n\n" + "\n".join(mirror) + "\n"


def deploy_one(path, out_root):
    text = path.read_text()
    own = re.search(r"^id:\s*(\S+)", text, re.M).group(1)
    # Revision 18: the deployed spec.md keeps the corpus id — the linter
    # derives the expected id from the parent directory (path.stem).
    text = requirements_mirror(rewrite(text, own), own)
    dest = out_root / path.stem / "spec.md"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text)
    print(f"deployed {path.name} -> {dest} (own id {own})")


def main():
    corpus = pathlib.Path("specs")
    out_root = pathlib.Path("openspec/specs")
    for path in sorted(corpus.glob("*.md")):
        deploy_one(path, out_root)


if __name__ == "__main__":
    sys.exit(main())