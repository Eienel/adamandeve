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
const ERC20_TRANSFER_TOPIC = "0xddf252ad00000000000000000000000000000000000000000000000000000000";
const SIGNAL_PRICE_WEI = parseUnits(SIGNAL_PRICE, 18);

function dep() {
  return loadDeployment();
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
    for (let i = count; i >= 1 && i > count - 25; i--) rounds.push(await readRound(arena, i));

    const agents = store.listAgents();
    const leaderboard = [];
    for (const a of agents) {
      const wins = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "wins", args: [a.address] }));
      const played = Number(await pub.readContract({ address: arena, abi: forecastArenaAbi, functionName: "roundsPlayed", args: [a.address] }));
      leaderboard.push({ ...a, wins, played });
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
    const forecasts = round.participants.map((agent) => {
      const trace = store.getTrace(id, agent);
      return {
        agent,
        agentName: trace?.agentName ?? agent,
        strategy: trace?.strategy ?? "?",
        traceHash: trace?.traceHash,
        txHash: trace?.txHash,
        value: round.settled ? trace?.value : null, // hidden until settled
        reasoningAvailable: !!trace?.reasoning,
      };
    });
    res.json({ round, forecasts });
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

// Mock nanopayment settlement (stands in for Circle Gateway/Nanopayments on Arc).
app.post("/api/signal/:roundId/:agent/pay", (req, res) => {
  (async () => {
    const roundId = Number(req.params.roundId);
    const agent = req.params.agent as `0x${string}`;
    const buyer = String(req.body?.buyer ?? "anon");
    const payer = req.body?.payer as `0x${string}` | undefined;
    const txHash = req.body?.txHash as `0x${string}` | undefined;

    if (!payer || !txHash) {
      return res.status(400).json({ error: "missing payer or txHash" });
    }

    const d = dep();
    const trace = store.getTrace(roundId, agent);
    if (!trace?.reasoning || !trace.traceHash) {
      return res.status(409).json({ error: "signal not ready: missing reasoning trace" });
    }
    const receipt = await pub.getTransactionReceipt({ hash: txHash });
    const paid = receipt.logs.some((log) => {
      if ((log.address || "").toLowerCase() !== d.usdc.toLowerCase()) return false;
      if (!log.topics?.length || log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return false;
      if (log.topics.length < 3) return false;
      const from = (`0x${log.topics[1]!.slice(-40)}`).toLowerCase();
      const to = (`0x${log.topics[2]!.slice(-40)}`).toLowerCase();
      const value = BigInt(log.data ?? "0x0");
      return from === payer.toLowerCase() && to === agent.toLowerCase() && value >= SIGNAL_PRICE_WEI;
    });

    if (!paid) {
      return res.status(402).json({ error: "payment tx not found or insufficient amount", required: SIGNAL_PRICE, currency: "USDC" });
    }

    store.recordPurchase({ roundId, agent, buyer, amount: SIGNAL_PRICE, at: Date.now() });
    res.json({ ok: true, roundId, agent, txHash, payer, reasoning: trace?.reasoning, traceHash: trace?.traceHash });
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

    // Submit forecast on-chain
    const value = parseUnits(prediction.toFixed(6), 18);
    const txHash = await wallet.writeContract({
      address: d.forecastArena,
      abi: forecastArenaAbi,
      functionName: "submitForecast",
      args: [BigInt(roundId), value, traceHash, BigInt(agent.agentId ?? 0)],
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
