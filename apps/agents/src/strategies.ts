export interface MarketContext {
  subject: string;
  history: number[]; // recent prices, oldest..newest
  current: number;
  horizonSec: number;
}

export interface Forecast {
  value: number;
  reasoning: string;
}

export type StrategyName = "momentum" | "mean-reversion" | "contrarian";

function pctChange(history: number[]): number {
  if (history.length < 2) return 0;
  const a = history[0];
  const b = history[history.length - 1];
  return a === 0 ? 0 : (b - a) / a;
}

function sma(history: number[], n: number): number {
  const slice = history.slice(-n);
  if (slice.length === 0) return 0;
  return slice.reduce((s, x) => s + x, 0) / slice.length;
}

/** Heuristic strategies — deterministic, run with no API key. Each returns a forecast + human-readable reasoning. */
export const heuristics: Record<StrategyName, (ctx: MarketContext) => Forecast> = {
  momentum(ctx) {
    const drift = pctChange(ctx.history);
    // extrapolate the recent drift forward, damped
    const projected = ctx.current * (1 + drift * 0.6);
    return {
      value: projected,
      reasoning:
        `Momentum read on ${ctx.subject}. Recent window moved ${(drift * 100).toFixed(2)}% ` +
        `(from ${ctx.history[0]?.toFixed(2)} to ${ctx.current.toFixed(2)}). Trend appears to be ` +
        `${drift >= 0 ? "up" : "down"}; I expect continuation, damped to 60% of observed drift over the ` +
        `${ctx.horizonSec}s horizon. Forecast ${projected.toFixed(2)}.`,
    };
  },
  "mean-reversion"(ctx) {
    const avg = sma(ctx.history, 10);
    const projected = ctx.current + (avg - ctx.current) * 0.5;
    return {
      value: projected,
      reasoning:
        `Mean-reversion read on ${ctx.subject}. 10-step SMA is ${avg.toFixed(2)} vs spot ${ctx.current.toFixed(2)} ` +
        `(${(((ctx.current - avg) / (avg || 1)) * 100).toFixed(2)}% from fair value). I expect a partial pull ` +
        `back toward the average over ${ctx.horizonSec}s. Forecast ${projected.toFixed(2)}.`,
    };
  },
  contrarian(ctx) {
    const drift = pctChange(ctx.history);
    const projected = ctx.current * (1 - drift * 0.35);
    return {
      value: projected,
      reasoning:
        `Contrarian read on ${ctx.subject}. The crowd just pushed price ${(drift * 100).toFixed(2)}%; ` +
        `short-horizon over-reactions tend to fade. I fade ~35% of the move. Forecast ${projected.toFixed(2)}.`,
    };
  },
};

/** True if any LLM provider is configured (Bedrock bearer token or a direct Anthropic key). */
export function hasModelProvider(): boolean {
  return !!(process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.ANTHROPIC_API_KEY);
}

/** Call Claude via AWS Bedrock (bearer-token invoke) or the direct Anthropic API.
 *  Returns the raw text, or null to signal "fall back to heuristic". */
async function callModel(system: string, user: string, model: string): Promise<string | null> {
  const bedrockToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (bedrockToken) {
    const region = process.env.AWS_REGION ?? "us-east-1";
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/invoke`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bedrockToken}`, "content-type": "application/json" },
      body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return null; // quota/throttle/error -> heuristic fallback
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (j.content ?? []).map((c) => c.text ?? "").join("") || null;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model,
      max_tokens: 400,
      // cache_control is supported at runtime (prompt caching); cast covers older SDK types.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] as any,
      messages: [{ role: "user", content: user }],
    });
    return resp.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  }

  return null;
}

/** Optional Claude-backed reasoning (Bedrock or Anthropic). Falls back to the heuristic on any error. */
export async function claudeForecast(
  strategy: StrategyName,
  ctx: MarketContext,
  model: string,
): Promise<Forecast> {
  try {
    const system =
      `You are an autonomous market-forecasting agent with a ${strategy} bias. ` +
      `Given recent prices, output ONLY strict JSON: {"value": <number>, "reasoning": "<2-3 sentences>"}. ` +
      `value is your point forecast for the reference price at the round close. Be decisive.`;
    const user =
      `Subject: ${ctx.subject}\nRecent prices (oldest→newest): ${ctx.history.map((p) => p.toFixed(2)).join(", ")}\n` +
      `Spot now: ${ctx.current.toFixed(2)}\nHorizon: ${ctx.horizonSec}s\nReturn JSON only.`;

    const text = await callModel(system, user, model);
    if (!text) return heuristics[strategy](ctx);

    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (typeof json.value === "number" && typeof json.reasoning === "string") {
      return { value: json.value, reasoning: json.reasoning };
    }
    return heuristics[strategy](ctx);
  } catch {
    return heuristics[strategy](ctx);
  }
}
