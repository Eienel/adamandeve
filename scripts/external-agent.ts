/**
 * Forecast Arena — external agent (ChainGPT-powered, skill-learning).
 *
 * A standalone agent that anyone can run against a live arena. It:
 *   1. registers over the open API (gets an apiKey + agent address),
 *   2. forecasts each open round with ChainGPT, using its OWN installed "skills",
 *   3. after a round settles, checks whether it won — and if it LOST, buys the
 *      winning agent's signal and installs that agent's Skill Patch into its own
 *      toolkit, so it gets smarter over time (signals-as-reusable-skills).
 *
 * It depends on nothing in this repo (only global fetch), so it's easy to copy out.
 *
 * Run:
 *   CHAINGPT_API_KEY=xxx ARENA_URL=https://your-app.up.railway.app npx tsx external-agent.ts
 *
 * Env:
 *   ARENA_URL         arena base URL                (default http://localhost:8080)
 *   CHAINGPT_API_KEY  ChainGPT API key              (optional; falls back to a heuristic)
 *   AGENT_NAME        display name                   (default gemini1)
 *   AGENT_STRATEGY    momentum | mean-reversion | contrarian (default momentum)
 *   POLL_MS           poll interval                  (default 15000)
 */

const ARENA = (process.env.ARENA_URL ?? "http://localhost:8080").replace(/\/$/, "");
const CHAINGPT_KEY = process.env.CHAINGPT_API_KEY;
const NAME = process.env.AGENT_NAME ?? "gemini1";
const STRATEGY = process.env.AGENT_STRATEGY ?? "momentum";
const POLL_MS = Number(process.env.POLL_MS ?? 15000);

// The agent's evolving toolkit. It starts with one base skill of its own and grows it
// every time it buys a winning agent's signal after losing a round.
const skills: string[] = [
  `Base ${STRATEGY} skill: anchor on the current spot, lean into the prevailing short-horizon ` +
    `trend but fade any single extreme tick, and always output one precise number.`,
];

let apiKey = "";
let myAddress = "";
const myPrediction = new Map<number, number>();
const reviewed = new Set<number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const f18 = (s: string) => Number(BigInt(s)) / 1e18;

async function jsonFetch(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(ARENA + path, init);
  const text = await r.text();
  let body: any;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { ok: r.ok, status: r.status, body };
}

async function register(): Promise<void> {
  const { ok, body } = await jsonFetch("/api/agents/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: NAME, strategy: STRATEGY }),
  });
  if (!ok || !body.apiKey) throw new Error("register failed: " + JSON.stringify(body));
  apiKey = body.apiKey;
  myAddress = String(body.address).toLowerCase();
  console.log(`Registered "${NAME}" — agentId ${body.agentId}, address ${body.address}`);
}

/** Live spot price for the round's asset using CoinGecko (no auth needed). */
async function spotFor(subject: string): Promise<number> {
  const asset = (subject.split("/")[0] || "ETH").trim().toUpperCase();
  const coinGeckoId: Record<string, string> = {
    ETH: "ethereum",
    BTC: "bitcoin",
    SOL: "solana",
    USDC: "usd-coin",
  };
  const id = coinGeckoId[asset] || "ethereum";

  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    const j: any = await r.json();
    const amt = Number(j?.[id]?.usd);
    if (Number.isFinite(amt) && amt > 0) return amt;
  } catch { /* fall through */ }
  return 0;
}

/**
 * Ask ChainGPT for {value, reasoning}. The /chat/stream endpoint returns the answer as
 * plain text (often wrapped in ```json fences), so we read text, strip fences, and parse
 * defensively — falling back to extracting the first plausible price number.
 */
async function askChainGPT(subject: string, spot: number): Promise<{ value: number; reasoning: string } | null> {
  if (!CHAINGPT_KEY) return null;

  const skillsText = skills.join("\n- ");
  const prompt =
    `You are an autonomous market-forecasting agent named ${NAME} with a ${STRATEGY} bias.\n` +
    `Your installed skills (apply ALL of them):\n- ${skillsText}\n\n` +
    `Subject: ${subject}\nCurrent spot: $${spot}\n\n` +
    `Forecast the reference close price (a number near ${spot}). Be decisive.\n` +
    `Reply with ONLY a JSON object, no markdown, no code fences:\n` +
    `{"value": <number>, "reasoning": "Thesis: ... Evidence: ... Risks: ... Skill Patch: ..."}\n` +
    `Keep reasoning on a single line. The Skill Patch is one concise, transferable rule.`;

  try {
    console.log(`  [ChainGPT] calling with ${skills.length} skills...`);
    const r = await fetch("https://api.chaingpt.org/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CHAINGPT_KEY}`,
      },
      body: JSON.stringify({
        model: "general_assistant",
        question: prompt,
        chatHistory: "off",
      }),
    });

    if (!r.ok) {
      console.log(`  [ChainGPT] error ${r.status}: ${r.statusText}`);
      return null;
    }

    // /chat/stream returns the answer as plain text; strip any markdown fences.
    const raw = (await r.text()).replace(/```json/gi, "").replace(/```/g, "");

    // Try a clean JSON object first.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const json = JSON.parse(raw.slice(start, end + 1));
        const v = Number(json.value);
        if (Number.isFinite(v) && v > 0) {
          console.log(`  [ChainGPT] success: ${v}`);
          return { value: v, reasoning: String(json.reasoning ?? raw).slice(0, 800) };
        }
      } catch { /* fall through to number extraction */ }
    }

    // Fallback: pull the first plausible price number out of the text.
    const num = raw.match(/\d{2,}(?:[.,]\d+)?/);
    if (num) {
      const v = Number(num[0].replace(/,/g, ""));
      if (Number.isFinite(v) && v > 0) {
        console.log(`  [ChainGPT] extracted number: ${v}`);
        return { value: v, reasoning: raw.slice(0, 500) };
      }
    }

    console.log(`  [ChainGPT] no usable value in response`);
    return null;
  } catch (e) {
    console.log(`  [ChainGPT] exception: ${String(e).slice(0, 80)}`);
    return null;
  }
}

/** Deterministic fallback so the agent still plays without an LLM key. */
function heuristic(subject: string, spot: number): { value: number; reasoning: string } | null {
  if (spot <= 0) return null;
  const drift = STRATEGY === "contrarian" ? -0.001 : STRATEGY === "mean-reversion" ? 0 : 0.001;
  const value = spot * (1 + drift);
  return {
    value,
    reasoning:
      `Thesis: ${STRATEGY} read on ${subject}.\nEvidence: spot ${spot.toFixed(2)}.\n` +
      `Risks: low-data heuristic, no live news.\nSkill Patch: anchor on spot and nudge ` +
      `${(drift * 100).toFixed(2)}% in the ${STRATEGY} direction over a short horizon.`,
  };
}

async function forecastOpenRounds(rounds: any[]): Promise<void> {
  for (const r of rounds) {
    if (r.settled || myPrediction.has(r.id)) continue;
    const spot = await spotFor(r.subject);
    const f = (await askChainGPT(r.subject, spot)) ?? heuristic(r.subject, spot);
    if (!f) {
      console.log(`Round ${r.id} (${r.subject}): skipped (no valid forecast)`);
      continue;
    }
    const value = Number(f.value);
    if (!Number.isFinite(value) || value <= 0) {
      console.log(`Round ${r.id} (${r.subject}): skipped (invalid value: ${value})`);
      continue;
    }
    const { ok, status, body } = await jsonFetch(`/api/rounds/${r.id}/predict`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ prediction: value, reasoning: f.reasoning }),
    });
    if (ok) {
      myPrediction.set(r.id, value);
      console.log(`Round ${r.id} (${r.subject}): predicted ${value.toFixed(2)}`);
    } else {
      console.log(`Round ${r.id}: predict skipped (${status}) ${body?.error ?? ""}`);
    }
  }
}

function extractSkillPatch(reasoning: string): string | null {
  const m = reasoning.match(/skill\s*patch\s*[:\-]?\s*([\s\S]+)/i);
  if (!m) return null;
  const firstLine = m[1].trim().split("\n")[0].trim();
  return firstLine ? firstLine.slice(0, 300) : null;
}

async function buyAndLearn(roundId: number, winnerAddr: string, winnerName: string): Promise<void> {
  const probe = await jsonFetch(`/api/signal/${roundId}/${winnerAddr}?buyer=${myAddress}`);
  let signal = probe.body;
  if (probe.status === 402) {
    const paid = await jsonFetch(`/api/signal/${roundId}/${winnerAddr}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buyer: myAddress }),
    });
    if (!paid.ok) { console.log(`  buy signal failed (${paid.status})`); return; }
    signal = paid.body;
  }
  if (!signal?.reasoning) { console.log("  no reasoning returned"); return; }
  const patch = extractSkillPatch(signal.reasoning);
  if (patch) {
    skills.push(`Learned from ${winnerName} (round ${roundId}): ${patch}`);
    console.log(`  📚 bought ${winnerName}'s signal and installed a new skill:\n     "${patch}"`);
  } else {
    console.log(`  bought ${winnerName}'s signal (no Skill Patch found to install)`);
  }
}

async function reviewSettledRounds(rounds: any[]): Promise<void> {
  for (const r of rounds) {
    if (!r.settled || reviewed.has(r.id) || !myPrediction.has(r.id)) continue;
    reviewed.add(r.id);
    const { ok, body } = await jsonFetch(`/api/round/${r.id}`);
    if (!ok) continue;
    const truth = f18(body.round.truthPrice);
    const graded = (body.forecasts || [])
      .filter((x: any) => x.value != null)
      .map((x: any) => ({ ...x, err: Math.abs(f18(x.value) - truth) }))
      .sort((a: any, b: any) => a.err - b.err);
    if (!graded.length) continue;
    const winner = graded[0];
    const iWon = String(winner.agent).toLowerCase() === myAddress;
    if (iWon) {
      console.log(`Round ${r.id} settled @ ${truth.toFixed(2)} — 🏆 I won! No need to buy.`);
    } else {
      console.log(`Round ${r.id} settled @ ${truth.toFixed(2)} — lost to ${winner.agentName}. Learning from it…`);
      await buyAndLearn(r.id, winner.agent, winner.agentName);
    }
  }
}

async function main(): Promise<void> {
  console.log(`External agent → ${ARENA}  (ChainGPT: ${CHAINGPT_KEY ? "on" : "off, using heuristic"})`);
  await register();
  while (true) {
    try {
      const { ok, body } = await jsonFetch("/api/state");
      if (ok && Array.isArray(body.rounds)) {
        await forecastOpenRounds(body.rounds);
        await reviewSettledRounds(body.rounds);
      }
    } catch (e) {
      console.error("loop error:", String(e).slice(0, 160));
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
