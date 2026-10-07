#!/usr/bin/env bash
# Purpose: Release-freshness oracle for the ship-close gate (tambor variant).
# Responsibilities: read-only checks — once a package manifest exists, the
#   newest CHANGELOG.md release heading must equal the package version, and
#   docs/ must have no uncommitted changes. Before a manifest exists (tambor
#   is still in the scaffold/spec phase), the oracle passes with a notice
#   instead of hard-failing a release that cannot happen yet.
#   Accepts an artifact path as $1 (oracle contract) but inspects the repo.
# Exit 0 = pass (or n/a), exit 1 = fail; failure reason is written to stderr.
set -euo pipefail

# Artifact path ($1) accepted per the oracle contract but unused: this oracle
# inspects repository state at gate time rather than artifact contents.

manifest=""
if [[ -f Cargo.toml ]]; then
  manifest="Cargo.toml"
elif [[ -f package.json ]]; then
  manifest="package.json"
else
  echo "release-docs-fresh: no package manifest yet — release gate n/a while tambor remains in scaffold phase" >&2
  exit 0
fi

if [[ ! -f CHANGELOG.md ]]; then
  echo "release-docs-fresh: CHANGELOG.md not found in $(pwd)" >&2
  exit 1
fi

if [[ "$manifest" == "Cargo.toml" ]]; then
  pkg_version="$(sed -nE 's/^version[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\1/p' Cargo.toml | head -1)"
else
  pkg_version="$(node -p "require('./package.json').version" 2>/dev/null || true)"
fi
if [[ -z "$pkg_version" ]]; then
  echo "release-docs-fresh: no package version found in $manifest" >&2
  exit 1
fi

# Newest non-Unreleased release heading: `## [X] - date`
changelog_version="$(grep -E '^## \[' CHANGELOG.md | grep -v '\[Unreleased\]' | head -1 | sed -E 's/^## \[([^]]+)\].*/\1/' || true)"
if [[ -z "$changelog_version" ]]; then
  echo "release-docs-fresh: CHANGELOG.md has no release heading (only Unreleased); $manifest version is $pkg_version" >&2
  exit 1
fi

if [[ "$changelog_version" != "$pkg_version" ]]; then
  echo "release-docs-fresh: CHANGELOG newest release ($changelog_version) lags $manifest version ($pkg_version)" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "release-docs-fresh: not a git repository; cannot verify docs/ freshness" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain -- docs/ 2>/dev/null)" ]]; then
  echo "release-docs-fresh: docs/ has uncommitted changes at gate time — commit or clean docs/ before release" >&2
  exit 1
fi

exit 0
