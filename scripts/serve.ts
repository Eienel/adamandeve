import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseUnits, formatUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
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

/** Persistent state dir. On Railway, mount a volume here so deployment + Circle wallets
 *  survive redeploys (otherwise every restart re-deploys contracts and spawns NEW unfunded
 *  agent wallets). Defaults to cwd for local dev. Set DATA_DIR=/data + mount a volume on Railway. */
const DATA_DIR = process.env.DATA_DIR ?? process.cwd();
function dataPath(name: string): string {
  return path.join(DATA_DIR, name);
}

interface PersistedWallet { address: Address; id: string; agentId: string; name: string; strategy: (typeof STRATEGIES)[number] }
function walletsFile(): string {
  return process.env.AGENT_WALLETS_FILE ?? dataPath("agent-wallets.arc.json");
}
function loadPersistedWallets(): PersistedWallet[] {
  try {
    const f = walletsFile();
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, "utf8")) as PersistedWallet[];
  } catch {
    return [];
  }
}
function savePersistedWallets(w: PersistedWallet[]): void {
  fs.writeFileSync(walletsFile(), JSON.stringify(w, null, 2));
}

// --- EOA (plain private-key) agent fleet for Arc when Circle isn't configured ---
interface PersistedKey { privateKey: `0x${string}`; address: Address; agentId: string; name: string; strategy: (typeof STRATEGIES)[number] }
function keysFile(): string {
  return process.env.AGENT_KEYS_FILE ?? dataPath("agent-keys.arc.json");
}
function loadOrCreateAgentKeys(n: number): PersistedKey[] {
  let keys: PersistedKey[] = [];
  try {
    if (fs.existsSync(keysFile())) keys = JSON.parse(fs.readFileSync(keysFile(), "utf8")) as PersistedKey[];
  } catch {
    keys = [];
  }
  for (let i = keys.length; i < n; i++) {
    const strategy = STRATEGIES[i % STRATEGIES.length];
    const privateKey = generatePrivateKey();
    keys.push({ privateKey, address: privateKeyToAccount(privateKey).address, agentId: "0", name: `Agent-${i}-${strategy}`, strategy });
  }
  fs.writeFileSync(keysFile(), JSON.stringify(keys, null, 2));
  return keys.slice(0, n);
}
function saveAgentKeys(keys: PersistedKey[]): void {
  fs.writeFileSync(keysFile(), JSON.stringify(keys, null, 2));
}
// Public anvil account #0 — safe locally, but must NOT be the deployer on a live testnet.
const ANVIL_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
function loadOrCreateDeployerKey(): `0x${string}` {
  const f = process.env.DEPLOYER_KEY_FILE ?? dataPath("deployer-key.arc.json");
  try {
    if (fs.existsSync(f)) return (JSON.parse(fs.readFileSync(f, "utf8")) as { privateKey: `0x${string}` }).privateKey;
  } catch {
    /* regenerate */
  }
  const privateKey = generatePrivateKey();
  fs.writeFileSync(f, JSON.stringify({ privateKey, address: privateKeyToAccount(privateKey).address }, null, 2));
  return privateKey;
}
async function balanceOf(pub: ReturnType<typeof makePublicClient>, address: Address): Promise<bigint> {
  try {
    return await pub.getBalance({ address });
  } catch {
    return 0n;
  }
}


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
  // 0. Persistent state. Point deployment + arena data at DATA_DIR (a Railway volume in prod)
  //    so they survive restarts. Set BEFORE spawning the API child so it inherits the paths.
  fs.mkdirSync(DATA_DIR, { recursive: true });
  process.env.DEPLOYMENTS_FILE ??= dataPath(IS_ARC ? "deployments.arc.json" : "deployments.local.json");
  process.env.ARENA_DATA_FILE ??= dataPath("arena-data.json");

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

  const pub = makePublicClient();
  const fleetSize = IS_ARC
    ? Number(process.env.FLEET_SIZE ?? 3)
    : Math.min(Number(process.env.FLEET_SIZE ?? 3), ANVIL_KEYS.length - 1);
  const hasCircle = !!(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET);
  const eoaArc = IS_ARC && !hasCircle;

  // On Arc, never deploy from the public anvil key. If the user hasn't supplied their own
  // DEPLOYER_PRIVATE_KEY, generate + persist a dedicated one (they just fund the printed address).
  let deployerKey = (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`) ?? ANVIL_KEYS[0];
  if (IS_ARC && (!process.env.DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY === ANVIL_KEY_0)) {
    deployerKey = loadOrCreateDeployerKey();
    process.env.DEPLOYER_PRIVATE_KEY = deployerKey; // so the deploy.ts child uses it too
  }
  const deployerAddr = privateKeyToAccount(deployerKey).address;

  // On the Arc EOA path, generate the agent wallets up front so ALL addresses needing USDC
  // (deployer + agents) can be funded in one faucet session. Keys persist to the volume.
  const eoaKeys = eoaArc ? loadOrCreateAgentKeys(fleetSize) : [];
  if (eoaArc) {
    console.log(`\n⏳ Fund these wallets with testnet USDC (faucet: https://faucet.circle.com, select Arc testnet):`);
    console.log(`   DEPLOYER  ${deployerAddr}`);
    for (const k of eoaKeys) console.log(`   AGENT     ${k.address}  (${k.strategy})`);
    console.log("   Deployment runs once the deployer is funded; agents start as each is funded.\n");
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
    // On Arc the deployer pays gas in USDC — wait until it's funded before deploying so a
    // cold start doesn't crash. Locally anvil pre-funds account 0, so this returns instantly.
    if (IS_ARC && (await balanceOf(pub, deployerAddr)) === 0n) {
      console.log(`Waiting for DEPLOYER ${deployerAddr} to be funded...`);
      while ((await balanceOf(pub, deployerAddr)) === 0n) await sleep(5000);
      console.log("Deployer funded ✓");
    }
    console.log("Deploying contracts...");
    await runToCompletion("pnpm", ["exec", "tsx", "scripts/deploy.ts"]);
  }

  const dep = loadDeployment();
  const resolver = new Resolver(deployerKey, dep.forecastArena);
  const feed = new PriceFeed("ETH-USD", 3000, 0.006);
  await feed.init();
  const fastHorizon = Number(process.env.HORIZON_SEC ?? 60);

  // 4. Register the fleet once. Arc + Circle creds -> Circle Programmable Wallets (gas-free MPC);
  //    Arc without Circle -> plain EOA wallets you fund at the faucet; local -> anvil keys.
  const agents: Forecaster[] = [];
  // EOA fleet bookkeeping for lazy (post-funding) ERC-8004 registration on Arc.
  const eoaFleet: { agent: Agent; key: PersistedKey; idx: number; registered: boolean }[] = [];
  if (IS_ARC && hasCircle) {
    const client = createCircleClient();
    // Reuse wallets from a previous run if we have enough persisted (avoids spawning new
    // unfunded wallets on every Railway restart). Otherwise create + register the fleet once.
    const persisted = loadPersistedWallets();
    if (persisted.length >= fleetSize) {
      console.log(`Reusing ${fleetSize} persisted Circle wallets from ${walletsFile()}`);
      for (let i = 0; i < fleetSize; i++) {
        const p = persisted[i];
        agents.push(new CircleAgent({ name: p.name, strategy: p.strategy, client, walletAddress: p.address, arena: dep.forecastArena, agentId: BigInt(p.agentId) }));
        console.log(`  ${p.address} agentId=${p.agentId} (${p.strategy})`);
      }
    } else {
      console.log(`Creating ${fleetSize} Circle wallets on Arc...`);
      const wallets = await createAgentWallets(client, fleetSize);
      const toSave: PersistedWallet[] = [];
      for (let i = 0; i < wallets.length; i++) {
        const strategy = STRATEGIES[i % STRATEGIES.length];
        const name = `Agent-${i}-${strategy}`;
        const agentId = await registerAgentViaCircle(client, wallets[i].address, dep.identityRegistry, `ipfs://agent-${i}-${strategy}`);
        agents.push(new CircleAgent({ name, strategy, client, walletAddress: wallets[i].address, arena: dep.forecastArena, agentId }));
        toSave.push({ address: wallets[i].address, id: wallets[i].id, agentId: agentId.toString(), name, strategy });
        console.log(`  ${wallets[i].address} agentId=${agentId}`);
      }
      savePersistedWallets(toSave);
      console.log(`Saved wallet fleet to ${walletsFile()} (persist this volume to reuse on restart).`);
    }
  } else if (IS_ARC) {
    // EOA path: keys generated + printed for funding above. Agents auto-activate (and lazily
    // ERC-8004-register) once each wallet has USDC for gas.
    for (let i = 0; i < eoaKeys.length; i++) {
      const k = eoaKeys[i];
      const agent = new Agent({ name: k.name, strategy: k.strategy, privateKey: k.privateKey, arena: dep.forecastArena, agentId: BigInt(k.agentId) });
      agents.push(agent);
      eoaFleet.push({ agent, key: k, idx: i, registered: k.agentId !== "0" });
    }
  } else {
    for (let i = 0; i < fleetSize; i++) {
      const key = ANVIL_KEYS[i + 1];
      const strategy = STRATEGIES[i % STRATEGIES.length];
      const agentId = await registerAgent(key, dep.identityRegistry, `ipfs://agent-${i}-${strategy}`);
      agents.push(new Agent({ name: `Agent-${i}-${strategy}`, strategy, privateKey: key, arena: dep.forecastArena, agentId }));
    }
  }
  // 5. Continuous multi-horizon round loop. Each "track" is an independent forecast horizon
  //    (e.g. 1m volume workhorse + 5m). Tracks run concurrently: a track opens a round, the
  //    fleet forecasts once, and it settles when its horizon elapses. High-frequency short
  //    rounds compound a verifiable on-chain accuracy record per agent across timeframes —
  //    that track record is what makes an agent's sold reasoning valuable.
  const label = (s: number) => (s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`);
  const horizons = (process.env.HORIZONS ?? `${fastHorizon},300`)
    .split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
  const tracks = horizons.map((sec) => ({ sec, label: label(sec), open: undefined as undefined | { id: number; closeMs: number } }));
  console.log(`Fleet of ${agents.length} agents. Horizon tracks: ${tracks.map((t) => t.label).join(", ")}.`);

  // Lazily ERC-8004-register EOA agents once they're funded (best-effort; identity is optional
  // for forecasting since the arena skips the ownerOf check when agentId is 0).
  let lastLazyCheck = 0;
  async function lazyRegisterEoa(): Promise<void> {
    if (!IS_ARC || hasCircle || eoaFleet.length === 0) return;
    if (eoaFleet.every((e) => e.registered)) return;
    if (Date.now() - lastLazyCheck < 20000) return;
    lastLazyCheck = Date.now();
    for (const e of eoaFleet) {
      if (e.registered) continue;
      if ((await balanceOf(pub, e.key.address)) === 0n) continue;
      try {
        const agentId = await registerAgent(e.key.privateKey, dep.identityRegistry, `ipfs://agent-${e.idx}-${e.key.strategy}`);
        e.agent.setAgentId(agentId);
        e.key.agentId = agentId.toString();
        e.registered = true;
        const keys = loadOrCreateAgentKeys(fleetSize);
        keys[e.idx] = e.key;
        saveAgentKeys(keys);
        console.log(`Registered EOA agent ${e.key.address} -> agentId ${agentId}`);
      } catch {
        /* not funded enough yet / transient — retry next pass */
      }
    }
  }

  let settleCount = 0;
  while (true) {
    const now = Date.now();
    await lazyRegisterEoa();
    for (const tr of tracks) {
      try {
        if (!tr.open) {
          const subject = `ETH/USDC · ${tr.label}`;
          const roundId = await resolver.openRound(Mode.SpotClose, tr.sec, subject);
          for (const agent of agents) {
            const ctx = { subject, history: feed.recent(15), current: feed.current(), horizonSec: tr.sec };
            // Per-agent failures (e.g. an unfunded EOA on Arc) must not abort the round.
            await agent.forecastRound(roundId, ctx).catch((err) => console.error(`  ${agent.name} skip:`, String(err).slice(0, 120)));
          }
          tr.open = { id: roundId, closeMs: now + tr.sec * 1000 };
          console.log(`Opened round ${roundId} (${tr.label}) @ ${feed.current().toFixed(2)}`);
        } else if (now >= tr.open.closeMs) {
          const result = await resolver.settle(tr.open.id, feed.current());
          await resolver.pushReputation(tr.open.id, agents.map((a) => a.address) as Address[]).catch((e) => console.error("pushReputation:", String(e).slice(0, 120)));
          const w = store.getTrace(tr.open.id, result.winner);
          console.log(`Round ${tr.open.id} (${tr.label}) settled — winner ${w?.agentName ?? result.winner} @ ${feed.current().toFixed(2)}`);
          tr.open = undefined;
          if (!IS_ARC && ++settleCount % 5 === 0) await managedSwap(dep, pub, deployerKey, (settleCount / 5) % 2 === 0).catch(() => {});
        }
      } catch (e) {
        console.error(`track ${tr.label} error:`, String(e));
      }
    }
    feed.tick();
    await sleep(2000);
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
