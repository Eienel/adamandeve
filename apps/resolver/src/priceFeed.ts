/** Price feed for the arena's "truth" price.
 *
 *  Primary mode: live spot price from a public exchange REST API (Coinbase, with
 *  Binance/Coingecko fallbacks). The resolver owns it; agents only ever see history
 *  up to "now", so the close price is genuinely uncertain at forecast time.
 *
 *  If the network is unreachable (locked-down container, offline dev), it transparently
 *  falls back to a random walk so the demo never breaks. Public API (tick/current/recent)
 *  is unchanged; call `await init()` once before the round loop to seed real data. */
export class PriceFeed {
  private last: number;
  private readonly hist: { t: number; price: number }[] = [];
  private live = false;
  private source = "simulated";
  private lastFetch = 0;
  private readonly refreshMs = 4000;

  constructor(
    private readonly symbol = "ETH-USD",
    fallbackStart = 3000,
    private readonly volPerStep = 0.004,
  ) {
    this.last = fallbackStart;
    this.hist.push({ t: Date.now(), price: this.last });
  }

  /** Seed with real spot + recent 1-min closes. Falls back to simulation on failure. */
  async init(): Promise<void> {
    const candles = await this.fetchCandles().catch(() => null);
    const spot = await this.fetchSpot().catch(() => null);
    if (spot || (candles && candles.length)) {
      this.live = true;
      this.hist.length = 0;
      const series = candles && candles.length ? candles : [spot!];
      const now = Date.now();
      series.forEach((p, i) => this.hist.push({ t: now - (series.length - i) * 60_000, price: p }));
      this.last = spot ?? series[series.length - 1];
      this.hist.push({ t: now, price: this.last });
      this.lastFetch = now;
      console.log(`Price feed: LIVE via ${this.source} — ${this.symbol} @ ${this.last.toFixed(2)} (${this.hist.length} pts)`);
    } else {
      console.log(`Price feed: simulated (no live source reachable) — ${this.symbol} ~${this.last.toFixed(2)}`);
    }
  }

  tick(): number {
    if (this.live) {
      this.maybeRefresh();
      return this.last;
    }
    const shock = (Math.random() * 2 - 1) * this.volPerStep;
    this.last = Math.max(1, this.last * (1 + shock));
    this.push(this.last);
    return this.last;
  }

  current(): number {
    return this.last;
  }

  recent(n = 20): number[] {
    return this.hist.slice(-n).map((h) => h.price);
  }

  isLive(): boolean {
    return this.live;
  }

  private push(price: number): void {
    this.hist.push({ t: Date.now(), price });
    if (this.hist.length > 1000) this.hist.shift();
  }

  /** Non-blocking, throttled live refresh. */
  private maybeRefresh(): void {
    const now = Date.now();
    if (now - this.lastFetch < this.refreshMs) return;
    this.lastFetch = now;
    this.fetchSpot()
      .then((p) => {
        if (p && Number.isFinite(p)) {
          this.last = p;
          this.push(p);
        }
      })
      .catch(() => {
        /* keep last known price */
      });
  }

  private async fetchJson(url: string): Promise<any> {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json();
  }

  /** Latest spot price; tries Coinbase, then Binance, then Coingecko. */
  private async fetchSpot(): Promise<number | null> {
    try {
      const d = await this.fetchJson(`https://api.coinbase.com/v2/prices/${this.symbol}/spot`);
      const p = Number(d?.data?.amount);
      if (Number.isFinite(p)) { this.source = "coinbase"; return p; }
    } catch { /* try next */ }
    try {
      const sym = this.symbol.replace("-", "").replace("USD", "USDT");
      const d = await this.fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
      const p = Number(d?.price);
      if (Number.isFinite(p)) { this.source = "binance"; return p; }
    } catch { /* try next */ }
    try {
      const d = await this.fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd`);
      const p = Number(d?.ethereum?.usd);
      if (Number.isFinite(p)) { this.source = "coingecko"; return p; }
    } catch { /* give up */ }
    return null;
  }

  /** Recent 1-minute closes (oldest -> newest) for seeding the history window. */
  private async fetchCandles(): Promise<number[] | null> {
    try {
      const d = await this.fetchJson(`https://api.exchange.coinbase.com/products/${this.symbol}/candles?granularity=60`);
      // Coinbase returns [time, low, high, open, close, volume], newest first.
      if (Array.isArray(d) && d.length) {
        this.source = "coinbase";
        return d.slice(0, 20).reverse().map((c: number[]) => Number(c[4])).filter(Number.isFinite);
      }
    } catch { /* fall through */ }
    return null;
  }
}
