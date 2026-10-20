## ADDED Requirements

### Requirement: Minified spa artifact

The SPA build SHALL emit minified bundles for the spa shell and its
worker scripts, with the spa bundle's gzip size at or below the
unminified pre-change baseline (measured 56 KB gzip; expected ≈38.6 KB
minified).

#### Scenario: minify flag lands

- **WHEN** the build:spa script runs
- **THEN** dist/spa.js is minified (no unminified whitespace-only
  output) and its gzip size is at or below the recorded 38.6 KB
  baseline

### Requirement: Lazy demo chunks

The SPA demo registry SHALL load each demo example through a dynamic
import boundary so the initial chunk carries no example module
transitively, with the demo index rendered synchronously.

#### Scenario: examples split out of the initial chunk

- **WHEN** the build emits its chunk graph
- **THEN** no example module appears in the initial chunk's transitive
  imports and a representative gallery click-through loads its chunk
  on demand

### Requirement: PWA shell artifacts

The SPA build SHALL emit a valid web manifest and a service worker
that caches hashed assets cache-first and serves navigation
network-first with a cache fallback, with the cache name content-hash
versioned so a deploy invalidates the previous cache.

#### Scenario: manifest and worker present in dist

- **WHEN** the build completes
- **THEN** the demo build output contains a valid JSON manifest and
  the service worker artifact outside the npm files allowlist, and the
  browser entry registers the worker on secure origins

#### Scenario: offline reload serves the shell

- **WHEN** the network is unavailable after one successful visit
- **THEN** the service worker serves the cached app shell for the
  navigation request
