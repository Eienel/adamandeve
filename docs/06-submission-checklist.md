# 06 — Submission Checklist

Deadline: **May 25, 2026**. Submit early + often (multiple submissions allowed).

## Current status (2026-05-23)
- [x] Contracts written + tested (24 passing) and committed.
- [x] Full agent stack working locally end-to-end (`pnpm demo:local`): ERC-8004 register → forecast → settle → reputation → real swap.
- [x] Dashboard + x402 pay-to-read signals working.
- [x] Code pushed to `claude/arc-circle-hackathon-4slm0`.
- [ ] Live Arc testnet deployment (needs a funded deployer key from faucet.circle.com).
- [ ] Circle Programmable Wallet agent fleet on Arc (needs CIRCLE_API_KEY + entity secret + funding).
- [ ] Demo video (≤3 min) — outline below.
- [ ] Traction reporting via `arc-canteen` (needs GitHub device-flow login).
- [ ] Submission form.

## Must have
- [ ] Public GitHub repo (clean README, setup instructions, no secrets committed).
- [ ] Live deployed product link (dashboard on Vercel; testnet contracts live).
- [ ] ≤3-min demo video (Loom/YouTube/Vimeo) showing **autonomous agents acting live** + the dashboard.
- [ ] Traction numbers reported via `arc-canteen update-traction` (rounds, on-chain txns, USDC volume, # external agents, signal purchases).
- [ ] `arc-canteen update-product`.
- [ ] Submission form filled.

## Maximize the rubric
- [ ] **Agentic (30%):** show genuine autonomy — agents decide forecasts/trades with no human in the loop; show adaptation across rounds.
- [ ] **Traction (30%):** fleet running 24/7 from Day 1; onboard ≥1 external agent + ≥1 signal buyer; surface live counters.
- [ ] **Circle (20%):** Programmable Wallets (every agent + user) + Nanopayments (signal micro-payments) on Arc, USDC settlement — call these out explicitly in README/video.
- [ ] **Innovation (20%):** verifiable provenance-anchored agent intelligence marketplace + competition + real spot trading.

## Demo video outline (≤3 min)
1. The problem + the idea (15s).
2. An agent autonomously reasons → forecasts → submits on-chain (live) (45s).
3. Round scores; leaderboard updates; reputation grows (30s).
4. Someone buys a top agent's reasoning via micro-payment; provenance hash verified (30s).
5. (If ready) real spot trade by a managed agent (20s).
6. Traction counters + Circle tools used + close (20s).

## Hygiene
- [ ] No project name / no "halal" or Islamic labels in repo (per decisions).
- [ ] `.env` and Circle entity secret gitignored.
- [ ] Docs folder complete and current.
</content>
