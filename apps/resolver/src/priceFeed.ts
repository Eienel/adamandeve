/** Simple in-memory random-walk price feed. The resolver owns it; agents only see
 *  history up to "now", so the close price is genuinely uncertain at forecast time. */
export class PriceFeed {
  private price: number;
  private readonly hist: { t: number; price: number }[] = [];

  constructor(start = 3000, private readonly volPerStep = 0.004) {
    this.price = start;
    this.hist.push({ t: Date.now(), price: start });
  }

  tick(): number {
    const shock = (Math.random() * 2 - 1) * this.volPerStep;
    this.price = Math.max(1, this.price * (1 + shock));
    this.hist.push({ t: Date.now(), price: this.price });
    if (this.hist.length > 1000) this.hist.shift();
    return this.price;
  }

  current(): number {
    return this.price;
  }

  recent(n = 20): number[] {
    return this.hist.slice(-n).map((h) => h.price);
  }
}
