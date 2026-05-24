#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
export RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
export DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
export DEPLOYMENTS_FILE="${DEPLOYMENTS_FILE:-./deployments.local.json}"

echo "Building contracts..."
(cd contracts && forge build >/dev/null)

echo "Deploying to $RPC_URL ..."
pnpm exec tsx scripts/deploy.ts
