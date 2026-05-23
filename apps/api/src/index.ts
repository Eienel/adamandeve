import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDeployment,
  makePublicClient,
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
  const roundId = Number(req.params.roundId);
  const agent = req.params.agent as `0x${string}`;
  const buyer = String(req.body?.buyer ?? "anon");
  store.recordPurchase({ roundId, agent, buyer, amount: SIGNAL_PRICE, at: Date.now() });
  const trace = store.getTrace(roundId, agent);
  res.json({ ok: true, roundId, agent, reasoning: trace?.reasoning, traceHash: trace?.traceHash });
});

app.use(express.static(path.resolve(__dirname, "../public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${APP_NAME} dashboard + API listening on 0.0.0.0:${PORT}`);
});
