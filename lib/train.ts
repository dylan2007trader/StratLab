// The honest auto-tuner. It searches a large 6-dimension space (each strategy's
// own params PLUS the shared risk/sizing controls) and validates every
// candidate across several unseen windows (walk-forward). A setting only wins if
// it holds up across all of them — so "leveling up" means generalizing, not
// overfitting. Because the space is huge, it uses guided random search rather
// than brute force, which also makes training take real time.

import { BotConfig, RiskParams } from "./types";
import { runBacktest } from "./backtest";
import { BotMetrics } from "./storage";

export interface Fold { label: string; fraction: number; }
export const FOLDS: Fold[] = [
  { label: "2/3 in · last 1/3 unseen", fraction: 0.55 },
  { label: "~65% in · rest unseen", fraction: 0.65 },
  { label: "~75% in · rest unseen", fraction: 0.75 },
  { label: "~85% in · rest unseen", fraction: 0.85 },
];

export interface Scored { config: BotConfig; score: number; metrics: BotMetrics; oosByFold: number[]; }
export interface TrainResult { config: BotConfig; metrics: BotMetrics; score: number; tested: number; }

const RISK = {
  stopLoss: [0, 5, 8, 10, 15, 20],
  takeProfit: [0, 10, 15, 20, 30, 50],
  positionSize: [0.25, 0.5, 0.75, 1],
  trendFilter: [0, 50, 100, 200],
};
const POOL = {
  ma: { fast: [3, 5, 8, 10, 12, 15, 18, 22, 26, 30], slow: [30, 40, 50, 70, 90, 110, 140, 170, 200] },
  rsi: { period: [5, 7, 9, 11, 14, 18, 22, 26], oversold: [15, 20, 25, 30, 35], overbought: [60, 65, 70, 75, 80, 85] },
  macd: { fast: [6, 8, 10, 12, 16], slow: [18, 22, 26, 30, 35], signal: [7, 9, 12] },
  bollinger: { period: [10, 14, 20, 26, 34], k: [1.5, 2, 2.5, 3] },
  breakout: { entry: [10, 15, 20, 30, 40, 55], exit: [5, 10, 15, 20] },
  dip: { long: [50, 80, 100, 150, 200], short: [5, 10, 15, 20, 30] },
};

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function randomRisk(): RiskParams {
  return { stopLoss: pick(RISK.stopLoss), takeProfit: pick(RISK.takeProfit), positionSize: pick(RISK.positionSize), trendFilter: pick(RISK.trendFilter) };
}

/** Sample up to `n` distinct candidate configs (always includes the base). */
export function buildCandidates(base: BotConfig, n = 140): BotConfig[] {
  const out: BotConfig[] = [{ ...base }];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < n && guard < n * 8) {
    guard++;
    const cfg: BotConfig = { ...base, risk: randomRisk() };
    if (base.strategy === "ma") {
      const fast = pick(POOL.ma.fast); const slow = pick(POOL.ma.slow);
      if (fast >= slow) continue;
      cfg.ma = { fast, slow };
    } else if (base.strategy === "rsi") {
      const period = pick(POOL.rsi.period); const oversold = pick(POOL.rsi.oversold); const overbought = pick(POOL.rsi.overbought);
      if (oversold + 10 > overbought) continue;
      cfg.rsi = { period, oversold, overbought };
    } else if (base.strategy === "macd") {
      const fast = pick(POOL.macd.fast); const slow = pick(POOL.macd.slow); const signal = pick(POOL.macd.signal);
      if (fast >= slow) continue;
      cfg.macd = { fast, slow, signal };
    } else if (base.strategy === "bollinger") {
      cfg.bollinger = { period: pick(POOL.bollinger.period), k: pick(POOL.bollinger.k) };
    } else if (base.strategy === "breakout") {
      const entry = pick(POOL.breakout.entry); const exit = pick(POOL.breakout.exit);
      if (exit > entry) continue;
      cfg.breakout = { entry, exit };
    } else if (base.strategy === "dip") {
      const long = pick(POOL.dip.long); const short = pick(POOL.dip.short);
      if (short >= long) continue;
      cfg.dip = { long, short };
    }
    const key = JSON.stringify([cfg.ma, cfg.rsi, cfg.macd, cfg.bollinger, cfg.breakout, cfg.dip, cfg.risk]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cfg);
  }
  return out;
}

export function scoreCandidate(config: BotConfig, bars: { t: string; c: number }[]): Scored {
  const cap = Math.max(100, config.capital || 10000);
  const oosByFold: number[] = [];
  const foldScores: number[] = [];
  let metrics: BotMetrics | null = null;
  for (const f of FOLDS) {
    const r = runBacktest(config, bars, f.fraction);
    const inSample = r.equity[r.splitIndex - 1] / cap - 1;
    const oos = r.outOfSample.totalReturn;
    oosByFold.push(oos);
    foldScores.push(Math.min(inSample, oos));
    if (Math.abs(f.fraction - 0.75) < 1e-9) {
      metrics = { totalReturn: r.overall.totalReturn, oosReturn: oos, maxDrawdown: r.overall.maxDrawdown, trades: r.overall.tradeCount };
    }
  }
  if (!metrics) {
    const r = runBacktest(config, bars, 0.7);
    metrics = { totalReturn: r.overall.totalReturn, oosReturn: r.outOfSample.totalReturn, maxDrawdown: r.overall.maxDrawdown, trades: r.overall.tradeCount };
  }
  const score = foldScores.reduce((a, b) => a + b, 0) / foldScores.length;
  return { config, score, metrics, oosByFold };
}

export function train(base: BotConfig, bars: { t: string; c: number }[]): TrainResult {
  const candidates = buildCandidates(base);
  let best: Scored | null = null;
  for (const c of candidates) {
    const s = scoreCandidate(c, bars);
    if (!best || s.score > best.score) best = s;
  }
  if (!best) best = scoreCandidate(base, bars);
  return { config: best.config, metrics: best.metrics, score: best.score, tested: candidates.length };
}

export function xpGain(prev: BotMetrics | null, next: BotMetrics): number {
  const base = 8;
  if (!prev) return base + 10;
  const improvement = next.oosReturn - prev.oosReturn;
  return base + (improvement > 0 ? Math.round(improvement * 400) : 0);
}
