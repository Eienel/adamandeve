import fs from "node:fs";
import path from "node:path";
import type { TraceRecord, SignalPurchase, AgentInfo } from "./types.js";

interface Data {
  traces: TraceRecord[];
  purchases: SignalPurchase[];
  agents: AgentInfo[];
}

function dataFile(): string {
  return process.env.ARENA_DATA_FILE ?? path.resolve(process.cwd(), "arena-data.json");
}

function read(): Data {
  const f = dataFile();
  if (!fs.existsSync(f)) return { traces: [], purchases: [], agents: [] };
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as Data;
  } catch {
    return { traces: [], purchases: [], agents: [] };
  }
}

function write(d: Data): void {
  fs.writeFileSync(dataFile(), JSON.stringify(d, null, 2));
}

export const store = {
  file: dataFile,

  addTrace(t: TraceRecord): void {
    const d = read();
    const i = d.traces.findIndex((x) => x.roundId === t.roundId && x.agent.toLowerCase() === t.agent.toLowerCase());
    if (i >= 0) d.traces[i] = t;
    else d.traces.push(t);
    write(d);
  },

  getTrace(roundId: number, agent: string): TraceRecord | undefined {
    return read().traces.find((x) => x.roundId === roundId && x.agent.toLowerCase() === agent.toLowerCase());
  },

  listTraces(roundId?: number): TraceRecord[] {
    const all = read().traces;
    return roundId === undefined ? all : all.filter((x) => x.roundId === roundId);
  },

  recordPurchase(p: SignalPurchase): void {
    const d = read();
    d.purchases.push(p);
    write(d);
  },

  isPurchased(roundId: number, agent: string, buyer: string): boolean {
    return read().purchases.some(
      (x) =>
        x.roundId === roundId &&
        x.agent.toLowerCase() === agent.toLowerCase() &&
        x.buyer.toLowerCase() === buyer.toLowerCase(),
    );
  },

  purchases(): SignalPurchase[] {
    return read().purchases;
  },

  upsertAgent(a: AgentInfo): void {
    const d = read();
    const i = d.agents.findIndex((x) => x.address.toLowerCase() === a.address.toLowerCase());
    if (i >= 0) d.agents[i] = { ...d.agents[i], ...a };
    else d.agents.push(a);
    write(d);
  },

  listAgents(): AgentInfo[] {
    return read().agents;
  },
};
