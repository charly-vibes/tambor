#!/usr/bin/env bash
# Purpose: the local Bombadil runner (openspec/changes/add-bombadil-
#   exploration, task 6.1) — one command that builds the SPA, serves the
#   e2e fixture on a dedicated port, runs the pinned CLI against a demo
#   and always tears the server down.
# Responsibilities: validate the demo name and its spec, fail loudly when
#   BOMBADIL_PORT (default 4601) is taken, rebuild demo-dist, start
#   tests/e2e/serve.mjs with PORT set, wait for readiness, wipe
#   target/bombadil/<demo>/, run `bombadil browser test --headless` with a
#   ?demo=<id>&debug=1 origin, preserve the CLI exit status, and print the
#   trace path plus the --reproduce form (no --time-limit /
#   --exit-on-violation, which the CLI rejects together with --reproduce).
# Rationale: the run is nondeterministic and long; the fixture server must
#   never survive an interrupt (the trap covers EXIT/INT/TERM) and repeated
#   runs must not collide on the trace path (acceptance: two consecutive
#   runs, no manual cleanup). The CLI manages its own Chrome: it honors
#   CHROME when set and otherwise searches the standard Chrome/Chromium
#   install paths; this script never downloads a browser and never fakes
#   the variable.

set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  echo "usage: tools/bombadil-run.sh <demo>" >&2
  echo "  <demo> is a spec name under bombadil/ (e.g. counter)" >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 2
fi

demo="$1"
case "$demo" in
  [a-z]*)
    if ! [[ "$demo" =~ ^[a-z][a-z0-9_-]*$ ]]; then
      echo "❌ invalid demo name: $demo" >&2
      usage
      exit 2
    fi
    ;;
  *)
    echo "❌ invalid demo name: $demo" >&2
    usage
    exit 2
    ;;
esac

spec="bombadil/$demo.spec.ts"
if [ ! -f "$spec" ]; then
  echo "❌ no spec at $spec (available: $(ls bombadil/*.spec.ts 2>/dev/null | xargs -r -n1 basename | tr '\n' ' '))" >&2
  exit 2
fi

PORT="${BOMBADIL_PORT:-4601}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo "❌ BOMBADIL_PORT must be a TCP port number, got: $PORT" >&2
  exit 2
fi

TIME_LIMIT="${BOMBADIL_TIME_LIMIT:-60s}"
OUT="target/bombadil/$demo"
SERVER_LOG="target/bombadil/server-$PORT.log"

# Chrome: the CLI manages the browser but needs an executable. CHROME is
# passed through untouched; the CLI also searches the standard system
# paths. When neither yields a browser, fail here with the Playwright
# path instead of spending a build on the CLI's locate error.
if [ -z "${CHROME:-}" ]; then
  chrome_found=0
  for cmd in google-chrome-stable google-chrome chromium chromium-browser chrome; do
    if command -v "$cmd" >/dev/null 2>&1; then
      chrome_found=1
      break
    fi
  done
  if [ "$chrome_found" -ne 1 ]; then
    echo "❌ no Chrome/Chromium on PATH and CHROME is unset." >&2
    echo "   set CHROME to a browser binary, e.g. one from the Playwright cache:" >&2
    echo "   CHROME=<path-to-chrome> just bombadil $demo" >&2
    echo "   (find one with: ls \"\$HOME\"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome)" >&2
    exit 1
  fi
fi

# A taken port would silently drive the wrong server: refuse loudly.
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  echo "❌ BOMBADIL_PORT $PORT is already in use — stop the listener or set BOMBADIL_PORT" >&2
  exit 1
fi

echo "→ building demo-dist (npm run build:spa)"
npm run build:spa

mkdir -p target/bombadil
: >"$SERVER_LOG"

echo "→ serving tests/e2e/gallery.html on http://localhost:$PORT"
PORT="$PORT" node tests/e2e/serve.mjs >"$SERVER_LOG" 2>&1 &
server_pid=$!

cleanup() {
  if [ -n "${server_pid:-}" ] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ready=0
for _ in $(seq 1 150); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "❌ fixture server exited during startup; log:" >&2
    cat "$SERVER_LOG" >&2 || true
    exit 1
  fi
  if node -e 'fetch(process.argv[1], { signal: AbortSignal.timeout(1000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' \
    "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
if [ "$ready" -ne 1 ]; then
  echo "❌ fixture server did not become ready on port $PORT; log:" >&2
  cat "$SERVER_LOG" >&2 || true
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

echo "→ bombadil $demo (headless, $TIME_LIMIT, output $OUT)"
set +e
npx bombadil browser test \
  --headless \
  --time-limit "$TIME_LIMIT" \
  --output-path "$OUT" \
  --output-path-overwrite \
  "http://localhost:$PORT/?demo=$demo&debug=1" \
  "$spec"
status=$?
set -e

trace="$OUT/trace.jsonl"
echo
if [ -f "$trace" ]; then
  echo "trace:     $trace"
else
  echo "trace:     (not written) $trace"
fi
echo "reproduce: npx bombadil browser test --headless --reproduce \"$trace\" \\"
echo "             \"http://localhost:$PORT/?demo=$demo&debug=1\" \"$spec\""
echo "           (start the fixture first: PORT=$PORT node tests/e2e/serve.mjs &)"
if [ -n "${CHROME:-}" ]; then
  echo "chrome:    $CHROME"
else
  echo "chrome:    CLI-managed (set CHROME=/path/to/chrome to override)"
fi

if [ "$status" -eq 0 ]; then
  echo "✅ bombadil $demo exited 0"
else
  echo "❌ bombadil $demo exited $status"
fi
exit "$status"