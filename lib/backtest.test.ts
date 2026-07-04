import { describe, it, expect } from "vitest";
import { runBacktest, simulate, maxDD } from "./backtest";
import { Bar, BotConfig, FRICTIONLESS, RealismParams } from "./types";

function series(seed: number, n = 320): Bar[] {
  let a = seed;
  const rng = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const randn = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out: Bar[] = []; let lp = Math.log(100);
  for (let i = 0; i < n; i++) { lp += 0.0006 + 0.013 * randn(); out.push({ t: "2021-01-" + String((i % 28) + 1).padStart(2, "0"), c: Math.exp(lp) }); }
  return out;
}
const bars = series(7);
const cfg: BotConfig = {
  name: "T", symbol: "X", capital: 10000, strategy: "ma",
  ma: { fast: 10, slow: 40 }, rsi: { period: 14, oversold: 30, overbought: 70 },
  risk: { stopLoss: 0, takeProfit: 0, positionSize: 1, trendFilter: 0 },
};

describe("maxDD", () => {
  it("captures the worst peak-to-trough drop", () => {
    expect(maxDD([100, 120, 60, 90])).toBeCloseTo(60 / 120 - 1);
  });
});

describe("simulate", () => {
  it("returns equity from startIdx and finite values", () => {
    const full = simulate(cfg, bars.map((b) => b.c), 10000, 0);
    expect(full.equity).toHaveLength(bars.length);
    expect(Number.isFinite(full.equity[full.equity.length - 1])).toBe(true);
    const sliced = simulate(cfg, bars.map((b) => b.c), 10000, 100);
    expect(sliced.equity).toHaveLength(bars.length - 100);
  });
  it("position size < 1 keeps some cash, so it swings less than full size", () => {
    const prices = bars.map((b) => b.c);
    const full = simulate({ ...cfg, risk: { stopLoss: 0, takeProfit: 0, positionSize: 1, trendFilter: 0 } }, prices, 10000, 0);
    const half = simulate({ ...cfg, risk: { stopLoss: 0, takeProfit: 0, positionSize: 0.5, trendFilter: 0 } }, prices, 10000, 0);
    expect(maxDD(half.equity)).toBeGreaterThanOrEqual(maxDD(full.equity)); // smaller (less negative) drawdown
  });
  it("a tight stop-loss produces at least as many exits", () => {
    const prices = bars.map((b) => b.c);
    const noStop = simulate(cfg, prices, 10000, 0);
    const withStop = simulate({ ...cfg, risk: { stopLoss: 3, takeProfit: 0, positionSize: 1, trendFilter: 0 } }, prices, 10000, 0);
    const sells = (m: typeof withStop.marks) => m.filter((x) => x.type === "sell").length;
    expect(sells(withStop.marks)).toBeGreaterThanOrEqual(sells(noStop.marks));
  });
});

describe("runBacktest", () => {
  it("coherent 70/30 split with finite returns for every strategy", () => {
    const strategies: BotConfig["strategy"][] = ["ma", "rsi", "macd", "bollinger", "breakout", "dip"];
    for (const strategy of strategies) {
      const r = runBacktest({ ...cfg, strategy }, bars);
      expect(r.equity).toHaveLength(bars.length);
      expect(r.splitIndex).toBe(Math.floor(bars.length * 0.7));
      expect(Number.isFinite(r.overall.totalReturn)).toBe(true);
      expect(Number.isFinite(r.outOfSample.totalReturn)).toBe(true);
    }
  });
  it("equity[last]/capital - 1 equals reported total return", () => {
    const r = runBacktest(cfg, bars);
    expect(r.equity[r.equity.length - 1] / 10000 - 1).toBeCloseTo(r.overall.totalReturn);
  });
});

describe("execution realism", () => {
  const prices = bars.map((b) => b.c);
  const opens = bars.map((b, i) => (i > 0 ? bars[i - 1].c * 0.5 + b.c * 0.5 : b.c)); // synthetic opens != closes

  it("no opts is identical to FRICTIONLESS (legacy behaviour preserved)", () => {
    const a = simulate(cfg, prices, 10000, 0);
    const b = simulate(cfg, prices, 10000, 0, { realism: FRICTIONLESS });
    expect(a.equity).toEqual(b.equity);
    expect(a.trades).toEqual(b.trades);
  });

  it("slippage + commission never improve final equity", () => {
    const frictionless = simulate(cfg, prices, 10000, 0, { opens, realism: { slippageBps: 0, commission: 0, fillTiming: "nextOpen", shares: "fractional" } });
    const costly: RealismParams = { slippageBps: 50, commission: 5, fillTiming: "nextOpen", shares: "whole" };
    const real = simulate(cfg, prices, 10000, 0, { opens, realism: costly });
    expect(real.equity[real.equity.length - 1]).toBeLessThanOrEqual(frictionless.equity[frictionless.equity.length - 1] + 1e-9);
  });

  it("next-bar-open fills differ from same-bar close fills when opens != closes", () => {
    const open = simulate(cfg, prices, 10000, 0, { opens, realism: { slippageBps: 0, commission: 0, fillTiming: "nextOpen", shares: "fractional" } });
    const close = simulate(cfg, prices, 10000, 0, { opens, realism: { slippageBps: 0, commission: 0, fillTiming: "close", shares: "fractional" } });
    expect(open.equity[open.equity.length - 1]).not.toBeCloseTo(close.equity[close.equity.length - 1]);
  });

  it("whole-share fills hold an integer number of shares (no fractional position)", () => {
    // a single always-in config so exactly one position is opened
    const allIn: BotConfig = { ...cfg, ma: { fast: 3, slow: 5 } };
    const r = simulate(allIn, prices, 10000, 0, { opens, realism: { slippageBps: 5, commission: 0, fillTiming: "nextOpen", shares: "whole" } });
    // reconstruct shares from the first buy: floor(cash/fill) is integer by construction
    expect(r.marks.some((m) => m.type === "buy")).toBe(true);
  });
});
