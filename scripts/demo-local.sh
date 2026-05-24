#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
export RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
export DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
export DEPLOYMENTS_FILE="${DEPLOYMENTS_FILE:-./deployments.local.json}"
export ARENA_DATA_FILE="${ARENA_DATA_FILE:-./arena-data.json}"

STARTED_ANVIL=0
if ! curl -s -m2 -X POST "$RPC_URL" -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' >/dev/null 2>&1; then
  echo "Starting anvil..."
  anvil --silent &
  ANVIL_PID=$!
  STARTED_ANVIL=1
  trap '[ "$STARTED_ANVIL" = "1" ] && kill "$ANVIL_PID" 2>/dev/null || true' EXIT
  for i in $(seq 1 20); do
    curl -s -m2 -X POST "$RPC_URL" -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

echo "Building contracts..."
(cd contracts && forge build >/dev/null)

echo "Deploying..."
pnpm exec tsx scripts/deploy.ts

echo "Running demo..."
pnpm exec tsx scripts/local-demo.ts

echo
echo "Demo complete. To explore in the dashboard:  pnpm api   →  http://localhost:${PORT:-8787}"
