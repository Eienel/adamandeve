import { parseUnits, formatUnits, type Address } from "viem";
import {
  loadDeployment,
  makePublicClient,
  makeWalletClient,
  forecastArenaAbi,
  miniAmmAbi,
  erc20Abi,
  store,
  Mode,
} from "@arena/shared";
import { Resolver, PriceFeed } from "@arena/resolver";
import { Agent, registerAgent } from "@arena/agents";
import { ANVIL_KEYS } from "./anvilKeys.js";

const STRATEGIES = ["momentum", "mean-reversion", "contrarian"] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitWithTicks(seconds: number, feed: PriceFeed) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    feed.tick();
    await sleep(400);
  }
}

async function main() {
  const dep = loadDeployment();
  const pub = makePublicClient();
  const deployerKey = (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`) ?? ANVIL_KEYS[0];
  const resolver = new Resolver(deployerKey, dep.forecastArena);
  const feed = new PriceFeed(3000, 0.006);
  const fleetSize = Math.min(Number(process.env.FLEET_SIZE ?? 3), ANVIL_KEYS.length - 1);
  const rounds = Number(process.env.ROUNDS ?? 3);
  const horizon = Number(process.env.HORIZON_SEC ?? 8);

  console.log(`\n=== ${process.env.APP_NAME ?? "Forecast Arena"} — local demo ===`);
  console.log(`Arena ${dep.forecastArena} | fleet ${fleetSize} | rounds ${rounds}\n`);

  console.log("Registering agents on ERC-8004 IdentityRegistry...");
  const agents: Agent[] = [];
  for (let i = 0; i < fleetSize; i++) {
    const key = ANVIL_KEYS[i + 1];
    const strategy = STRATEGIES[i % STRATEGIES.length];
    const agentId = await registerAgent(key, dep.identityRegistry, `ipfs://agent-${i}-${strategy}`);
    const agent = new Agent({ name: `Agent-${i}-${strategy}`, strategy, privateKey: key, arena: dep.forecastArena, agentId });
    agents.push(agent);
    console.log(`  ${agent.name.padEnd(24)} ${agent.address} agentId=${agentId}`);
  }

  for (let r = 1; r <= rounds; r++) {
    for (let k = 0; k < 15; k++) feed.tick();

    const roundId = await resolver.openRound(Mode.SpotClose, horizon, "ETH/USDC");
    console.log(`\n── Round ${roundId} opened (close in ${horizon}s) — spot now ${feed.current().toFixed(2)} ──`);

    for (const agent of agents) {
      const ctx = { subject: "ETH/USDC", history: feed.recent(15), current: feed.current(), horizonSec: horizon };
      const { value } = await agent.forecastRound(roundId, ctx);
      console.log(`  ${agent.name.padEnd(24)} forecast ${value.toFixed(2)}`);
      feed.tick();
    }

    await waitWithTicks(horizon + 2, feed);

    const truth = feed.current();
    const result = await resolver.settle(roundId, truth);
    const winnerTrace = store.getTrace(roundId, result.winner);
    console.log(`  truth=${truth.toFixed(2)} → winner ${winnerTrace?.agentName ?? result.winner} (err ${formatUnits(result.winnerError, 18)})`);
    if (winnerTrace) console.log(`    reasoning: ${winnerTrace.reasoning.slice(0, 140)}...`);

    await resolver.pushReputation(roundId, agents.map((a) => a.address) as Address[]);
    console.log(`  reputation pushed to ERC-8004 for ${agents.length} agents`);
  }

  console.log("\n=== Leaderboard (on-chain wins) ===");
  const board: { name: string; wins: number }[] = [];
  for (const agent of agents) {
    const wins = (await pub.readContract({ address: dep.forecastArena, abi: forecastArenaAbi, functionName: "wins", args: [agent.address] })) as bigint;
    board.push({ name: agent.name, wins: Number(wins) });
  }
  board.sort((a, b) => b.wins - a.wins);
  for (const row of board) console.log(`  ${row.name.padEnd(24)} ${row.wins} win(s)`);

  // Managed-trading track: an agent executes a real spot swap on MiniAMM.
  console.log("\n=== Managed-trading demo (real spot swap) ===");
  const trader = agents[0];
  const deployer = makeWalletClient(deployerKey);
  const fund = await deployer.writeContract({ address: dep.demoToken, abi: erc20Abi, functionName: "mint", args: [trader.address, parseUnits("50", 18)], account: deployer.account!, chain: deployer.chain });
  await pub.waitForTransactionReceipt({ hash: fund });

  const traderWallet = makeWalletClient(ANVIL_KEYS[1]);
  const priceBefore = (await pub.readContract({ address: dep.miniAmm, abi: miniAmmAbi, functionName: "priceQuotePerBase" })) as bigint;
  const approve = await traderWallet.writeContract({ address: dep.demoToken, abi: erc20Abi, functionName: "approve", args: [dep.miniAmm, parseUnits("50", 18)], account: traderWallet.account!, chain: traderWallet.chain });
  await pub.waitForTransactionReceipt({ hash: approve });
  const swap = await traderWallet.writeContract({ address: dep.miniAmm, abi: miniAmmAbi, functionName: "swap", args: [true, parseUnits("50", 18), 0n], account: traderWallet.account!, chain: traderWallet.chain });
  await pub.waitForTransactionReceipt({ hash: swap });
  const priceAfter = (await pub.readContract({ address: dep.miniAmm, abi: miniAmmAbi, functionName: "priceQuotePerBase" })) as bigint;
  console.log(`  ${trader.name} swapped 50 ADT → USDC; price ${formatUnits(priceBefore, 6)} → ${formatUnits(priceAfter, 6)} USDC/ADT`);

  console.log("\nDone. Start the dashboard with: pnpm api  (then open http://localhost:8787)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
