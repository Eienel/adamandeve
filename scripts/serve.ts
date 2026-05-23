import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseUnits, formatUnits, type Address } from "viem";
import { loadDeployment, makePublicClient, forecastArenaAbi, store, Mode } from "@arena/shared";
import { Resolver, PriceFeed } from "@arena/resolver";
import {
  Agent,
  CircleAgent,
  registerAgent,
  createCircleClient,
  createAgentWallets,
  registerAgentViaCircle,
} from "@arena/agents";
import { ANVIL_KEYS } from "./anvilKeys.js";

type Forecaster = { name: string; address: Address; forecastRound: (roundId: number, ctx: any) => Promise<{ value: number; txHash: string }> };

/** All-in-one entrypoint for a single Railway service:
 *  embedded chain (if none) → deploy → continuous agent rounds + dashboard/API.
 *  Gives a live, self-running demo with no external keys. Point RPC_URL at Arc to use Arc. */

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const IS_ARC = RPC.includes("arc.network");
const STRATEGIES = ["momentum", "mean-reversion", "contrarian"] as const;

async function rpcUp(): Promise<boolean> {
  try {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", id: 1 }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function spawnInherit(cmd: string, args: string[]) {
  const p = spawn(cmd, args, { stdio: "inherit", env: process.env });
  p.on("error", (e) => console.error(`spawn ${cmd} error:`, String(e)));
  return p;
}

async function runToCompletion(cmd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawnInherit(cmd, args);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  // 1. Dashboard/API first so the web port binds immediately (Railway health check).
  spawnInherit("pnpm", ["exec", "tsx", "apps/api/src/index.ts"]);

  // 2. Ensure a chain is available.
  if (!(await rpcUp())) {
    if (IS_ARC) throw new Error("Arc RPC unreachable");
    console.log("Starting embedded anvil...");
    const anvilProc = spawn("anvil", ["--host", "0.0.0.0", "--port", "8545", "--silent"], { stdio: "ignore" });
    anvilProc.on("error", (e) => console.error("anvil spawn error:", String(e)));
    for (let i = 0; i < 60 && !(await rpcUp()); i++) await sleep(500);
    if (!(await rpcUp())) throw new Error("anvil failed to start (is foundry installed?)");
  }

  // 3. Deploy if we don't already have a deployment.
  let deployed = false;
  try {
    loadDeployment();
    deployed = true;
  } catch {
    /* none yet */
  }
  if (!deployed) {
    console.log("Deploying contracts...");
    await runToCompletion("pnpm", ["exec", "tsx", "scripts/deploy.ts"]);
  }

  const dep = loadDeployment();
  const pub = makePublicClient();
  const deployerKey = (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`) ?? ANVIL_KEYS[0];
  const resolver = new Resolver(deployerKey, dep.forecastArena);
  const feed = new PriceFeed("ETH-USD", 3000, 0.006);
  await feed.init();
  const horizon = Number(process.env.HORIZON_SEC ?? 20);
  const gap = Number(process.env.ROUND_GAP_SEC ?? 10);
  const fleetSize = Math.min(Number(process.env.FLEET_SIZE ?? 3), ANVIL_KEYS.length - 1);

  // 4. Register the fleet once. Arc -> Circle Programmable Wallets (gas-free); local -> anvil keys.
  const agents: Forecaster[] = [];
  if (IS_ARC) {
    const client = createCircleClient();
    console.log(`Creating ${fleetSize} Circle wallets on Arc...`);
    const wallets = await createAgentWallets(client, fleetSize);
    for (let i = 0; i < wallets.length; i++) {
      const strategy = STRATEGIES[i % STRATEGIES.length];
      const agentId = await registerAgentViaCircle(client, wallets[i].address, dep.identityRegistry, `ipfs://agent-${i}-${strategy}`);
      agents.push(new CircleAgent({ name: `Agent-${i}-${strategy}`, strategy, client, walletAddress: wallets[i].address, arena: dep.forecastArena, agentId }));
      console.log(`  ${wallets[i].address} agentId=${agentId}`);
    }
  } else {
    for (let i = 0; i < fleetSize; i++) {
      const key = ANVIL_KEYS[i + 1];
      const strategy = STRATEGIES[i % STRATEGIES.length];
      const agentId = await registerAgent(key, dep.identityRegistry, `ipfs://agent-${i}-${strategy}`);
      agents.push(new Agent({ name: `Agent-${i}-${strategy}`, strategy, privateKey: key, arena: dep.forecastArena, agentId }));
    }
  }
  console.log(`Fleet of ${agents.length} registered. Running rounds every ~${horizon + gap}s.`);

  // 5. Continuous round loop.
  let n = 0;
  while (true) {
    try {
      for (let k = 0; k < 15; k++) feed.tick();
      const roundId = await resolver.openRound(Mode.SpotClose, horizon, "ETH/USDC");
      for (const agent of agents) {
        const ctx = { subject: "ETH/USDC", history: feed.recent(15), current: feed.current(), horizonSec: horizon };
        await agent.forecastRound(roundId, ctx);
        feed.tick();
      }
      const end = Date.now() + horizon * 1000;
      while (Date.now() < end) {
        feed.tick();
        await sleep(500);
      }
      const result = await resolver.settle(roundId, feed.current());
      await resolver.pushReputation(roundId, agents.map((a) => a.address) as Address[]);
      const w = store.getTrace(roundId, result.winner);
      console.log(`Round ${roundId} settled — winner ${w?.agentName ?? result.winner} @ ${feed.current().toFixed(2)}`);

      if (!IS_ARC && ++n % 5 === 0) await managedSwap(dep, pub, deployerKey, (n / 5) % 2 === 0).catch(() => {});
    } catch (e) {
      console.error("round error:", String(e));
    }
    await sleep(gap * 1000);
  }
}

async function managedSwap(
  dep: ReturnType<typeof loadDeployment>,
  pub: ReturnType<typeof makePublicClient>,
  deployerKey: `0x${string}`,
  sellBase: boolean,
) {
  const { makeWalletClient, erc20Abi, miniAmmAbi } = await import("@arena/shared");
  const w = makeWalletClient(deployerKey);
  const token = sellBase ? dep.demoToken : dep.usdc;
  const amount = sellBase ? parseUnits("10", 18) : parseUnits("30000", 6);
  const before = (await pub.readContract({ address: dep.miniAmm, abi: miniAmmAbi, functionName: "priceQuotePerBase" })) as bigint;
  const a = await w.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [dep.miniAmm, amount], account: w.account!, chain: w.chain });
  await pub.waitForTransactionReceipt({ hash: a });
  const s = await w.writeContract({ address: dep.miniAmm, abi: miniAmmAbi, functionName: "swap", args: [sellBase, amount, 0n], account: w.account!, chain: w.chain });
  await pub.waitForTransactionReceipt({ hash: s });
  const after = (await pub.readContract({ address: dep.miniAmm, abi: miniAmmAbi, functionName: "priceQuotePerBase" })) as bigint;
  console.log(`Managed swap (${sellBase ? "sell" : "buy"} ADT): price ${formatUnits(before, 6)} → ${formatUnits(after, 6)} USDC/ADT`);
}

main().catch((e) => {
  // Keep the dashboard/API child alive so the site stays up even when the chain
  // setup fails (e.g. an Arc/Circle misconfig). Exiting here would crash-loop the
  // whole container and take the public dashboard offline with it.
  console.error("fatal: chain/fleet setup failed — dashboard stays up, no new rounds.\n", e);
});
