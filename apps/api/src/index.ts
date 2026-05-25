import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes, parseUnits } from "viem";
import {
  loadDeployment,
  makePublicClient,
  makeWalletClient,
  forecastArenaAbi,
  store,
} from "@arena/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const pub = makePublicClient();
const PORT = Number(process.env.PORT ?? 8787);
const APP_NAME = process.env.APP_NAME ?? "Forecast Arena";
const SIGNAL_PRICE = "0.05"; // USDC, x402 nanopayment price for one reasoning trace
const SIGNAL_PRICE_WEI = parseUnits(SIGNAL_PRICE, 6); // USDC has 6 decimals
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const f18 = (s: string) => Number(BigInt(s)) / 1e18; // on-chain 18-dec fixed -> float

function dep() {
  return loadDeployment();
}

/** Verify a real on-chain USDC payment: a Transfer(payer -> agent, >= price) in the given tx. */
async function verifyOnchainPayment(txHash: `0x${string}`, payer: `0x${string}`, agent: `0x${string}`): Promise<boolean> {
  try {
    const usdc = dep().usdc.toLowerCase();
    const receipt = await pub.getTransactionReceipt({ hash: txHash });
    return receipt.logs.some((log) => {
      if ((log.address || "").toLowerCase() !== usdc) return false;
      if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC || log.topics.length < 3) return false;
      const from = `0x${log.topics[1]!.slice(-40)}`.toLowerCase();
      const to = `0x${log.topics[2]!.slice(-40)}`.toLowerCase();
      return from === payer.toLowerCase() && to === agent.toLowerCase() && BigInt(log.data || "0x0") >= SIGNAL_PRICE_WEI;
    });
  } catch {
    return false;
  }
}

async function readRound(arena: `0x${string}`, id: number) {
  const r = (await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "rounds", args: [BigInt(id)] })) as unknown as any[];
  const participants = (await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "getParticipants", args: [BigInt(id)] })) as `0x${string}`[];
  const [openTs, closeTs, mode, settled, truthPrice, winner, winnerError, numForecasts, subject] = r;
  return {
    id,
    openTs: Number(openTs),
    closeTs: Number(closeTs),
    mode: Number(mode),
    settled: Boolean(settled),
    truthPrice: truthPrice.toString(),
    winner,
    winnerError: winnerError.toString(),
    numForecasts: Number(numForecasts),
    subject,
    participants,
  };
}

app.get("/api/state", async (_req, res) => {
  try {
    const d = dep();
    const arena = d.forecastArena;
    const count = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "roundCount" }));
    const rounds = [];
    for (let i = count; i >= 1 && i > count - 20; i--) rounds.push(await readRound(arena, i));

    // Signals sold per agent (the seller is purchase.agent) — powers the "top sellers" view.
    const soldBy: Record<string, number> = {};
    for (const p of store.purchases()) soldBy[p.agent.toLowerCase()] = (soldBy[p.agent.toLowerCase()] ?? 0) + 1;

    // Count off-chain wins and played for external agents by analyzing settled rounds.
    const offChainWins: Record<string, number> = {};
    const offChainPlayed: Record<string, Set<number>> = {}; // agent -> set of round IDs they played
    for (let i = 1; i <= count; i++) {
      const traces = store.listTraces(i);
      if (!traces.length) continue;
      // Track which agents played this round.
      for (const t of traces) {
        const addr = t.agent.toLowerCase();
        if (!offChainPlayed[addr]) offChainPlayed[addr] = new Set();
        offChainPlayed[addr].add(i);
      }
      // Check if this round is settled on-chain to count wins.
      try {
        const r = (await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "rounds", args: [BigInt(i)] })) as unknown as any[];
        const [, , , settled, truthPrice] = r;
        if (!Boolean(settled)) continue; // Round not settled.
        const truth = f18(truthPrice.toString());
        // Find the closest forecast.
        const graded = traces
          .filter((x) => x.value != null)
          .map((x) => ({ ...x, err: Math.abs(f18(x.value) - truth) }))
          .sort((a, b) => a.err - b.err);
        if (graded.length > 0) {
          const winner = graded[0];
          const addr = winner.agent.toLowerCase();
          offChainWins[addr] = (offChainWins[addr] ?? 0) + 1;
        }
      } catch {
        // Round data unavailable, skip.
      }
    }

    const agents = store.listAgents();
    const leaderboard = [];
    for (const a of agents) {
      const onChainWins = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "wins", args: [a.address] }));
      const onChainPlayed = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "roundsPlayed", args: [a.address] }));
      // External agents: use off-chain wins and played (on-chain tracking is identity-free).
      // Internal agents: use on-chain data.
      const addr = a.address.toLowerCase();
      const wins = offChainWins[addr] ?? onChainWins;
      const played = (offChainPlayed[addr]?.size ?? 0) || onChainPlayed;
      leaderboard.push({ ...a, wins, played, sold: soldBy[addr] ?? 0 });
    }
    leaderboard.sort((x, y) => y.wins - x.wins);

    res.json({ appName: APP_NAME, deployment: d, roundCount: count, rounds, leaderboard, purchases: store.purchases().length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/round/:id", async (req, res) => {
  try {
    const d = dep();
    const id = Number(req.params.id);
    const round = await readRound(d.forecastArena, id);
    // Build from off-chain traces so BOTH our fleet and external agents (relayed via the open
    // API) show up. Each trace's hash was anchored on-chain at submission for provenance.
    const forecasts = store.listTraces(id).map((trace) => ({
      agent: trace.agent,
      agentName: trace.agentName ?? trace.agent,
      strategy: trace.strategy ?? "?",
      traceHash: trace.traceHash,
      txHash: trace.txHash,
      value: round.settled ? trace.value : null, // hidden until settled
      reasoningAvailable: !!trace.reasoning,
    }));
    res.json({ round, forecasts });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Paginated rounds for the dashboard's "Older / Newer" navigation. page 0 = newest `size`.
app.get("/api/rounds", async (req, res) => {
  try {
    const arena = dep().forecastArena;
    const count = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "roundCount" }));
    const size = Math.min(50, Math.max(1, Number(req.query.size ?? 20)));
    const page = Math.max(0, Number(req.query.page ?? 0));
    const top = count - page * size; // highest round id on this page
    const bottom = Math.max(1, top - size + 1); // lowest round id on this page
    const rounds = [];
    for (let i = top; i >= bottom && i >= 1; i--) rounds.push(await readRound(arena, i));
    res.json({ roundCount: count, page, size, hasNewer: page > 0, hasOlder: bottom > 1, rounds });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// x402-style pay-to-read: returns reasoning if the round is settled or the buyer paid.
app.get("/api/signal/:roundId/:agent", (req, res) => {
  const roundId = Number(req.params.roundId);
  const agent = req.params.agent;
  const buyer = String(req.query.buyer ?? req.header("x-buyer") ?? "anon");
  const trace = store.getTrace(roundId, agent);
  if (!trace) return res.status(404).json({ error: "no trace" });
  if (!trace.reasoning || !trace.traceHash) return res.status(409).json({ error: "signal not ready: missing reasoning trace" });

  const settled = false; // reasoning is a paid product even after settle in this demo
  if (settled || store.isPurchased(roundId, agent, buyer)) {
    return res.json({ roundId, agent, reasoning: trace.reasoning, traceHash: trace.traceHash, paid: true });
  }
  // 402 Payment Required (x402 negotiation)
  res.setHeader("PAYMENT-REQUIRED", JSON.stringify({ scheme: "exact", price: SIGNAL_PRICE, currency: "USDC", network: "arc-testnet", resource: `signal/${roundId}/${agent}` }));
  res.status(402).json({ error: "payment required", price: SIGNAL_PRICE, currency: "USDC", payEndpoint: `/api/signal/${roundId}/${agent}/pay` });
});

// Settle a signal purchase. Two modes:
//  • Real x402: pass { payer, txHash } — we verify a USDC Transfer(payer→agent, ≥ price) on-chain.
//  • Demo: pass only { buyer } — mock settlement so the no-wallet dashboard still works.
app.post("/api/signal/:roundId/:agent/pay", (req, res) => {
  (async () => {
    const roundId = Number(req.params.roundId);
    const agent = req.params.agent as `0x${string}`;
    const buyer = String(req.body?.buyer ?? "anon");
    const payer = req.body?.payer as `0x${string}` | undefined;
    const txHash = req.body?.txHash as `0x${string}` | undefined;

    const trace = store.getTrace(roundId, agent);
    if (!trace?.reasoning || !trace.traceHash) {
      return res.status(409).json({ error: "signal not ready: missing reasoning trace" });
    }

    if (payer && txHash) {
      const ok = await verifyOnchainPayment(txHash, payer, agent);
      if (!ok) return res.status(402).json({ error: "payment tx not found or insufficient", required: SIGNAL_PRICE, currency: "USDC" });
    }

    store.recordPurchase({ roundId, agent, buyer, amount: SIGNAL_PRICE, at: Date.now() });
    res.json({ ok: true, roundId, agent, txHash, reasoning: trace.reasoning, traceHash: trace.traceHash });
  })().catch((e) => res.status(500).json({ error: String(e) }));
});

// ========== PHASE 1: AGENT REGISTRATION ==========

// Register a new agent (external or human-controlled)
app.post("/api/agents/register", async (req, res) => {
  try {
    const { name, strategy } = req.body;
    if (!name || !strategy) return res.status(400).json({ error: "missing name or strategy" });

    // Generate unique API key
    const apiKey = `ak_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const agentId = String(store.listAgents().length + 1);

    // For now, use a deterministic address based on agentId
    // On Arc with Circle, this would be a new Circle wallet
    const agentAddress = `0x${agentId.padStart(40, "0")}` as `0x${string}`;

    const agent = {
      address: agentAddress,
      name,
      strategy,
      apiKey,
      agentId,
      registeredAt: Date.now(),
    };

    store.upsertAgent(agent);
    res.json({ success: true, apiKey, agentId, address: agentAddress, name });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ========== PHASE 2: LEADERBOARD & AUTH ==========

// List all agents (public)
app.get("/api/agents", async (_req, res) => {
  try {
    const agents = store.listAgents();
    const d = dep();
    const arena = d.forecastArena;

    const leaderboard = await Promise.all(
      agents.map(async (a) => {
        const wins = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "wins", args: [a.address] }));
        const played = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "roundsPlayed", args: [a.address] }));
        return {
          agentId: a.agentId,
          name: a.name,
          strategy: a.strategy,
          address: a.address,
          wins,
          played,
          winRate: played > 0 ? (wins / played).toFixed(3) : "0",
        };
      }),
    );

    leaderboard.sort((x, y) => y.wins - x.wins);
    res.json(leaderboard);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Get leaderboard for a specific round (public)
app.get("/api/rounds/:id/leaderboard", async (req, res) => {
  try {
    const roundId = Number(req.params.id);
    const traces = store.listTraces(roundId);
    const d = dep();
    const arena = d.forecastArena;

    const leaderboard = await Promise.all(
      traces.map(async (t) => {
        const wins = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "wins", args: [t.agent] }));
        const played = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "roundsPlayed", args: [t.agent] }));
        return {
          agentId: t.agentId,
          address: t.agent,
          name: t.agentName,
          strategy: t.strategy,
          prediction: t.value,
          wins,
          played,
          winRate: played > 0 ? (wins / played).toFixed(3) : "0",
        };
      }),
    );

    leaderboard.sort((x, y) => y.wins - x.wins);
    res.json({ roundId, leaderboard });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Verify API key and get agent info (for external agents to self-check)
app.get("/api/agents/verify", (req, res) => {
  const apiKey = req.header("authorization")?.replace("Bearer ", "");
  if (!apiKey) return res.status(401).json({ error: "missing api key" });

  const agent = store.listAgents().find((a) => a.apiKey === apiKey);
  if (!agent) return res.status(401).json({ error: "invalid api key" });

  res.json({ agentId: agent.agentId, name: agent.name, address: agent.address, strategy: agent.strategy });
});

// ========== PHASE 2b: AGENT PREDICTION SUBMISSION ==========

// Submit a prediction from an external agent
app.post("/api/rounds/:id/predict", async (req, res) => {
  try {
    const roundId = Number(req.params.id);
    const apiKey = req.header("authorization")?.replace("Bearer ", "");
    const { prediction, reasoning } = req.body;

    if (!apiKey) return res.status(401).json({ error: "missing authorization header" });
    if (typeof prediction !== "number") return res.status(400).json({ error: "invalid prediction" });

    // Authenticate agent
    const agent = store.listAgents().find((a) => a.apiKey === apiKey);
    if (!agent) return res.status(401).json({ error: "invalid api key" });

    // Get deployment & wallet for on-chain submission
    const d = dep();
    const deployerKey = (process.env.DEPLOYER_PRIVATE_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;
    const wallet = makeWalletClient(deployerKey);

    // Hash reasoning
    const reasoningText = reasoning ?? `Prediction: ${prediction}`;
    const traceHash = keccak256(toBytes(reasoningText));

    // Submit forecast on-chain. External agents are relayed by the deployer (msg.sender =
    // deployer) and aren't ERC-8004 identities, so submit identity-free (agentId 0) — passing a
    // tokenId the deployer doesn't own would revert BadAgentId().
    const value = parseUnits(prediction.toFixed(6), 18);
    const txHash = await wallet.writeContract({
      address: d.forecastArena,
      abi: forecastArenaAbi,
      functionName: "submitForecast",
      args: [BigInt(roundId), value, traceHash, 0n],
      account: wallet.account!,
      chain: wallet.chain,
    });

    // Wait for receipt
    const pub = makePublicClient();
    await pub.waitForTransactionReceipt({ hash: txHash });

    // Store trace
    store.addTrace({
      roundId,
      agent: agent.address,
      agentName: agent.name,
      agentId: agent.agentId ?? "0",
      value: value.toString(),
      reasoning: reasoningText,
      traceHash,
      strategy: agent.strategy,
      createdAt: Date.now(),
      txHash,
    });

    res.json({
      success: true,
      roundId,
      agentId: agent.agentId,
      txHash,
      traceHash,
      prediction,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.use(express.static(path.resolve(__dirname, "../public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${APP_NAME} dashboard + API listening on 0.0.0.0:${PORT}`);
});
