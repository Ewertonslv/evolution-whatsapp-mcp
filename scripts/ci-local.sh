#!/usr/bin/env bash
set -uo pipefail
L="${CI_LOCAL_LOGS:-/tmp/ci-local}"; mkdir -p "$L"; : > "$L/resumo.txt"
for p in "npm ci" "npm run lint" "npm test" "npm run build"; do if $p; then echo "OK $p" >> "$L/resumo.txt"; else echo "FALHOU $p" >> "$L/resumo.txt"; exit 1; fi; done
