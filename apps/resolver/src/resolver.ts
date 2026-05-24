import { parseUnits, decodeEventLog, type Address } from "viem";
import { makeWalletClient, makePublicClient, forecastArenaAbi, Mode } from "@arena/shared";

export interface RoundResult {
  roundId: number;
  truthPrice: number;
  winner: Address;
  winnerError: bigint;
  numForecasts: number;
}

export class Resolver {
  private wallet;
  private pub;
  private arena: Address;

  constructor(privateKey: `0x${string}`, arena: Address) {
    this.wallet = makeWalletClient(privateKey);
    this.pub = makePublicClient();
    this.arena = arena;
  }

  get address(): Address {
    return this.wallet.account!.address;
  }

  async openRound(mode: Mode, closeInSec: number, subject: string): Promise<number> {
    const closeTs = BigInt(Math.floor(Date.now() / 1000) + closeInSec);
    const hash = await this.wallet.writeContract({
      address: this.arena,
      abi: forecastArenaAbi,
      functionName: "openRound",
      args: [mode, closeTs, subject],
      account: this.wallet.account!,
      chain: this.wallet.chain,
    });
    await this.pub.waitForTransactionReceipt({ hash });
    const count = (await this.pub.readContract({
      address: this.arena,
      abi: forecastArenaAbi,
      functionName: "roundCount",
    })) as bigint;
    return Number(count);
  }

  async settle(roundId: number, truthPrice: number): Promise<RoundResult> {
    const truth = parseUnits(truthPrice.toFixed(6), 18);
    const hash = await this.wallet.writeContract({
      address: this.arena,
      abi: forecastArenaAbi,
      functionName: "settle",
      args: [BigInt(roundId), truth],
      account: this.wallet.account!,
      chain: this.wallet.chain,
    });
    const receipt = await this.pub.waitForTransactionReceipt({ hash });

    let winner = "0x0000000000000000000000000000000000000000" as Address;
    let winnerError = 0n;
    let numForecasts = 0;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: forecastArenaAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "RoundSettled") {
          const a = ev.args as unknown as { winner: Address; winnerError: bigint; numForecasts: number };
          winner = a.winner;
          winnerError = a.winnerError;
          numForecasts = Number(a.numForecasts);
        }
      } catch {
        /* not our event */
      }
    }
    return { roundId, truthPrice, winner, winnerError, numForecasts };
  }

  async pushReputation(roundId: number, agents: Address[]): Promise<void> {
    for (const agent of agents) {
      try {
        const hash = await this.wallet.writeContract({
          address: this.arena,
          abi: forecastArenaAbi,
          functionName: "pushReputation",
          args: [BigInt(roundId), agent],
          account: this.wallet.account!,
          chain: this.wallet.chain,
        });
        await this.pub.waitForTransactionReceipt({ hash });
      } catch {
        /* already pushed or no forecast */
      }
    }
  }
}
