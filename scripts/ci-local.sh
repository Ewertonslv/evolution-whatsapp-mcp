#!/usr/bin/env bash
set -euo pipefail
npm ci && npm run lint && npm test && npm run build
