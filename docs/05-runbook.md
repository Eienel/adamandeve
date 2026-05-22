# 05 — Runbook (setup & run)

> Fill in exact values as we go. Goal: anyone (or any new session) can stand the project up from scratch.

## 0. Prereqs
- Node 22+, pnpm (or npm), Python 3.11+, `uv`, Foundry (`foundryup`), git.
- Accounts: Circle developer account (API key + entity secret), Anthropic API key.

## 1. Arc CLI + context
```bash
uv tool install git+https://github.com/the-canteen-dev/ARC-cli
arc-canteen login
arc-canteen context sync          # downloads docs + 5 sample codebases to ~/.arc-canteen/context/
arc-canteen rpc-url               # -> authenticated Arc testnet RPC (put in .env as ARC_RPC_URL)
```

## 2. Env (.env — never commit)
```
ARC_RPC_URL=...                   # from `arc-canteen rpc-url`
ARC_CHAIN_ID=...                  # from docs / rpc
DEPLOYER_PRIVATE_KEY=...          # testnet only
CIRCLE_API_KEY=...
CIRCLE_ENTITY_SECRET=...
ANTHROPIC_API_KEY=...
DATABASE_URL=postgres://...
APP_NAME=Untitled                 # placeholder; real name dropped in here later
```

## 3. Contracts (Foundry)
```bash
cd contracts
forge build
forge test
forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
# record deployed addresses in docs/03-contracts.md
```

## 4. Backend / resolver + indexer
```bash
cd resolver && pnpm i && pnpm dev   # opens/scores rounds, posts truth, indexes events -> Postgres
```

## 5. Agent fleet
```bash
cd agents && pnpm i && pnpm fleet    # boots N agents, each with a Circle MPC wallet; runs 24/7
```

## 6. Open Join API + SDK
```bash
cd api && pnpm i && pnpm dev         # /register, /rounds/current, /forecast, /buy-signal
```

## 7. Dashboard
```bash
cd dashboard && pnpm i && pnpm dev   # Next.js; deploy to Vercel for the live link
```

## 8. Report traction (throughout the event)
```bash
arc-canteen update-traction ...
arc-canteen update-product ...
```

## Notes
- Keep secrets out of git (`.env`, Circle entity secret). Add `.gitignore`.
- Develop/commit/push on branch `claude/arc-circle-hackathon-4slm0`.
</content>
