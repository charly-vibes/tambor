#!/bin/sh
# testaruda exec loop — extracted from lefthook.yml (tambor-j44) so the
# pre-push job can run it under tools/gate-timing.sh.
#
# exec loop: select → run → ingest → calibrate.
# Exit 0 = selected tests ran and passed; exit 20 = no tests affected
# (benign — nothing to run). Any other code blocks the push.
#
# `|| code=$?`: lefthook scripts may run under -e semantics like the CI
# mirror — a bare failing command would abort before the tolerance check
# runs (same latent bug fixed in ci.yml, tambor-kpx).
#
# Tolerated codes: 0 = ran and passed, 20 = nothing affected, 10 =
# store uncalibrated (first run after init/reset — calibration is
# non-blocking, tambor-cpd).

set -eu

code=0
testaruda exec || code=$?
if [ "$code" -eq 0 ] || [ "$code" -eq 10 ] || [ "$code" -eq 20 ]; then exit 0; fi
echo "testaruda exec failed with exit code $code" >&2
exit "$code"