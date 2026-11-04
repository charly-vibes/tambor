## ADDED Requirements

### Requirement: Docs bundle delivery

The build SHALL emit a docs SPA bundle chunked under the Pages
artifact at the `/docs/` path with relative chunk paths, page content
modules behind dynamic imports, and an initial docs shell whose gzip
size is recorded as a baseline and asserted by the build, so shipping
docs pages never regresses the initial load.

#### Scenario: docs build lands chunked under /docs/

- **WHEN** the build script completes
- **THEN** `demo-dist/docs/` contains the docs index with relative
  chunk paths, no page content module appears in the initial chunk's
  transitive imports, the recorded initial-shell gzip size holds, and
  the Pages artifact serves the docs index at `/docs/`
