// The training PLAN: what the user decides BEFORE a run, plus the level-scaled
// economics that decide how LONG and how HARD a run is.
//
// Clash-of-Clans-style progression: a Level-1 bot trains in minutes for big easy
// gains; each level the next training costs more real time, searches harder, and
// unlocks pro techniques (evolution, Monte-Carlo stress) — while the gains get
// smaller and more robust. Time is gated by level; an effort knob (Light /
// Standard / Max) lets you pick slight-vs-lots within a level.
//
// A plan defines a (potentially enormous) search space — the Cartesian product
// of every opened dimension's candidate values. We never materialize it: each
// integer index decodes deterministically into one config (mixed-radix), and a
// coprime stride scrambles the visiting order so a guided random sample covers
// the space and homes in on good regions over time.

import { BotConfig, StrategyId, DEFAULTS } from "./types";
import { customTunables, cloneCustom } from "./custom";

export type Intensity = "quick" | "standard" | "thorough" | "exhaustive";
export type Effort = "light" | "standard" | "max";
export type Resolution = "coarse" | "standard" | "fine";
export type DimGroup = "strategy" | "risk" | "fusion";
export type PhaseId = "scan" | "evolve" | "stress" | "generalize";

export interface Dim {
  key: string;
  label: string;
  group: DimGroup;
  help: string;
  values: (r: Resolution) => number[];
  apply: (cfg: BotConfig, v: number) => void;
  read: (cfg: BotConfig) => number;
  fmt: (v: number) => string;
}

export interface TrainPlan {
  /** dimension keys being optimized (everything else is locked at its value) */
  open: string[];
  intensity: Intensity;
  /** optional confirming second strategy to fuse in (null = none) */
  fusion: StrategyId | null;
  /** years of history to backtest over (depth) */
  years: number;
  /** number of walk-forward validation windows (robustness) */
  folds: number;
  /** how hard to push within this level's time budget */
  effort: Effort;
}

// ---- value grids -------------------------------------------------------------

const G = (coarse: number[], standard: number[], fine: number[]) => (r: Resolution) =>
  r === "coarse" ? coarse : r === "fine" ? fine : standard;

const pct = (v: number) => (v ? `${v}%` : "off");
const days = (v: number) => (v ? `${v}d` : "off");

const RISK_DIMS: Dim[] = [
  {
    key: "stopLoss", label: "Stop-loss", group: "risk",
    help: "Cuts a losing trade once it falls this far below entry (0 = off).",
    values: G([0, 10], [0, 5, 8, 10, 15, 20], [0, 3, 5, 7, 8, 10, 12, 15, 18, 20, 25]),
    apply: (c, v) => { c.risk = { ...(c.risk ?? DEFAULTS.risk), stopLoss: v }; },
    read: (c) => c.risk?.stopLoss ?? 0, fmt: pct,
  },
  {
    key: "takeProfit", label: "Take-profit", group: "risk",
    help: "Locks in a winner once it rises this far above entry (0 = off).",
    values: G([0, 20], [0, 10, 15, 20, 30, 50], [0, 8, 12, 15, 20, 25, 30, 40, 50, 65]),
    apply: (c, v) => { c.risk = { ...(c.risk ?? DEFAULTS.risk), takeProfit: v }; },
    read: (c) => c.risk?.takeProfit ?? 0, fmt: pct,
  },
  {
    key: "positionSize", label: "Trade size", group: "risk",
    help: "Fraction of available cash committed per trade.",
    values: G([50, 100], [25, 50, 75, 100], [25, 40, 50, 60, 75, 90, 100]),
    apply: (c, v) => { c.risk = { ...(c.risk ?? DEFAULTS.risk), positionSize: v / 100 }; },
    read: (c) => Math.round((c.risk?.positionSize ?? 1) * 100), fmt: (v) => `${v}%`,
  },
  {
    key: "trendFilter", label: "Trend filter", group: "risk",
    help: "Skips trades unless price is above this long average (0 = off).",
    values: G([0, 100], [0, 50, 100, 200], [0, 20, 50, 100, 150, 200]),
    apply: (c, v) => { c.risk = { ...(c.risk ?? DEFAULTS.risk), trendFilter: v }; },
    read: (c) => c.risk?.trendFilter ?? 0, fmt: days,
  },
];

const STRAT_DIMS: Record<StrategyId, Dim[]> = {
  ma: [
    { key: "ma.fast", label: "Fast MA", group: "strategy", help: "Short-term average — smaller reacts faster, trades more.",
      values: G([5, 10, 15, 20], [3, 5, 8, 10, 12, 15, 18, 22], [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 26, 30]),
      apply: (c, v) => { c.ma = { ...c.ma, fast: v }; }, read: (c) => c.ma.fast, fmt: String },
    { key: "ma.slow", label: "Slow MA", group: "strategy", help: "Long-term trend line the fast MA crosses.",
      values: G([30, 50, 100, 150], [30, 40, 50, 70, 90, 110, 140, 170, 200], [25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 140, 160, 180, 200]),
      apply: (c, v) => { c.ma = { ...c.ma, slow: v }; }, read: (c) => c.ma.slow, fmt: String },
  ],
  rsi: [
    { key: "rsi.period", label: "RSI period", group: "strategy", help: "Lookback for the momentum gauge.",
      values: G([7, 14, 21], [5, 7, 9, 11, 14, 18, 22, 26], [5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 26, 30]),
      apply: (c, v) => { c.rsi = { ...c.rsi, period: v }; }, read: (c) => c.rsi.period, fmt: String },
    { key: "rsi.oversold", label: "Buy below", group: "strategy", help: "RSI level treated as 'oversold' — a dip to buy.",
      values: G([20, 30], [15, 20, 25, 30, 35], [10, 15, 18, 20, 22, 25, 28, 30, 35, 40]),
      apply: (c, v) => { c.rsi = { ...c.rsi, oversold: v }; }, read: (c) => c.rsi.oversold, fmt: String },
    { key: "rsi.overbought", label: "Sell above", group: "strategy", help: "RSI level treated as 'overbought' — time to exit.",
      values: G([70, 80], [60, 65, 70, 75, 80, 85], [55, 60, 65, 68, 70, 72, 75, 78, 80, 85, 90]),
      apply: (c, v) => { c.rsi = { ...c.rsi, overbought: v }; }, read: (c) => c.rsi.overbought, fmt: String },
  ],
  macd: [
    { key: "macd.fast", label: "Fast EMA", group: "strategy", help: "Faster of the two trend lines.",
      values: G([8, 12], [6, 8, 10, 12, 16], [4, 6, 8, 10, 12, 14, 16, 20]),
      apply: (c, v) => { c.macd = { ...(c.macd ?? DEFAULTS.macd), fast: v }; }, read: (c) => c.macd?.fast ?? DEFAULTS.macd.fast, fmt: String },
    { key: "macd.slow", label: "Slow EMA", group: "strategy", help: "Slower trend line.",
      values: G([22, 30], [18, 22, 26, 30, 35], [16, 18, 20, 22, 26, 30, 35, 40]),
      apply: (c, v) => { c.macd = { ...(c.macd ?? DEFAULTS.macd), slow: v }; }, read: (c) => c.macd?.slow ?? DEFAULTS.macd.slow, fmt: String },
    { key: "macd.signal", label: "Signal", group: "strategy", help: "Smoothing of the MACD line that triggers trades.",
      values: G([9], [7, 9, 12], [5, 7, 9, 11, 14]),
      apply: (c, v) => { c.macd = { ...(c.macd ?? DEFAULTS.macd), signal: v }; }, read: (c) => c.macd?.signal ?? DEFAULTS.macd.signal, fmt: String },
  ],
  bollinger: [
    { key: "bollinger.period", label: "Period", group: "strategy", help: "Window for the average and the bands.",
      values: G([14, 20], [10, 14, 20, 26, 34], [8, 10, 12, 14, 17, 20, 24, 28, 34, 40]),
      apply: (c, v) => { c.bollinger = { ...(c.bollinger ?? DEFAULTS.bollinger), period: v }; }, read: (c) => c.bollinger?.period ?? DEFAULTS.bollinger.period, fmt: String },
    { key: "bollinger.k", label: "Band width", group: "strategy", help: "How many standard deviations wide the bands are.",
      values: G([2, 2.5], [1.5, 2, 2.5, 3], [1, 1.5, 2, 2.5, 3, 3.5]),
      apply: (c, v) => { c.bollinger = { ...(c.bollinger ?? DEFAULTS.bollinger), k: v }; }, read: (c) => c.bollinger?.k ?? DEFAULTS.bollinger.k, fmt: (v) => `${v}σ` },
  ],
  breakout: [
    { key: "breakout.entry", label: "Breakout window", group: "strategy", help: "Buys when price tops the highest high of this many days.",
      values: G([20, 40], [10, 15, 20, 30, 40, 55], [10, 14, 18, 22, 28, 34, 40, 48, 55, 65]),
      apply: (c, v) => { c.breakout = { ...(c.breakout ?? DEFAULTS.breakout), entry: v }; }, read: (c) => c.breakout?.entry ?? DEFAULTS.breakout.entry, fmt: days },
    { key: "breakout.exit", label: "Exit window", group: "strategy", help: "Exits when price drops below the lowest low of this many days.",
      values: G([10, 20], [5, 10, 15, 20], [5, 8, 10, 12, 15, 18, 20, 25]),
      apply: (c, v) => { c.breakout = { ...(c.breakout ?? DEFAULTS.breakout), exit: v }; }, read: (c) => c.breakout?.exit ?? DEFAULTS.breakout.exit, fmt: days },
  ],
  dip: [
    { key: "dip.long", label: "Trend MA", group: "strategy", help: "Only buys while price is above this long average.",
      values: G([100, 200], [50, 80, 100, 150, 200], [50, 70, 90, 100, 120, 150, 170, 200]),
      apply: (c, v) => { c.dip = { ...(c.dip ?? DEFAULTS.dip), long: v }; }, read: (c) => c.dip?.long ?? DEFAULTS.dip.long, fmt: String },
    { key: "dip.short", label: "Dip MA", group: "strategy", help: "Buys pullbacks below this short average.",
      values: G([10, 20], [5, 10, 15, 20, 30], [5, 8, 10, 12, 15, 20, 25, 30, 40]),
      apply: (c, v) => { c.dip = { ...(c.dip ?? DEFAULTS.dip), short: v }; }, read: (c) => c.dip?.short ?? DEFAULTS.dip.short, fmt: String },
  ],
};

export const STRATEGY_NAMES: Record<StrategyId, string> = {
  ma: "Moving-average crossover", rsi: "RSI mean-reversion", macd: "MACD trend",
  bollinger: "Bollinger reversion", breakout: "Donchian breakout", dip: "Buy-the-dip",
};

function fusionDim(strategy: StrategyId): Dim {
  return {
    key: "fusion.param", label: `Fusion: ${STRATEGY_NAMES[strategy]}`, group: "fusion",
    help: "The headline knob of the confirming second strategy fused onto this bot.",
    values: G([20, 100], [10, 20, 50, 100, 150, 200], [5, 10, 20, 30, 50, 80, 100, 130, 160, 200]),
    apply: (c, v) => { c.fusion = { strategy, param: v }; },
    read: (c) => c.fusion?.param ?? 50, fmt: String,
  };
}

/** Every dimension available for a plan, in stable order: strategy, risk, fusion. */
export function dimsForPlan(strategy: StrategyId, fusion: StrategyId | null): Dim[] {
  const dims = [...STRAT_DIMS[strategy], ...RISK_DIMS];
  if (fusion && fusion !== strategy) dims.push(fusionDim(fusion));
  return dims;
}

const periodGrid = G([10, 20], [5, 10, 14, 20, 30], [3, 5, 8, 10, 12, 14, 18, 22, 26, 30, 40, 50]);
const constGrid = G([30, 70], [10, 20, 30, 50, 70, 80], [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90]);

/** Dims generated from a user-composed strategy's tunable numbers, so training
 *  optimises the periods/thresholds of whatever rules the user built. */
export function customDims(config: BotConfig): Dim[] {
  if (!config.custom) return [];
  return customTunables(config.custom).map((t): Dim => ({
    key: `custom.${t.id}`,
    label: t.label,
    group: "strategy",
    help: "A number in your composed strategy that training tunes.",
    values: t.kind === "period" ? periodGrid : constGrid,
    apply: (cfg, v) => { if (cfg.custom) t.set(cfg.custom, v); },
    read: (cfg) => (cfg.custom ? t.get(cfg.custom) : 0),
    fmt: String,
  }));
}

/** Config-aware dims: custom strategies generate their own dims; built-ins use
 *  the fixed grids. Both then get the shared risk dials and optional fusion. */
export function dimsForConfig(config: BotConfig, fusion: StrategyId | null): Dim[] {
  const stratDims = config.custom ? customDims(config) : STRAT_DIMS[config.strategy];
  const dims = [...stratDims, ...RISK_DIMS];
  if (fusion && fusion !== config.strategy) dims.push(fusionDim(fusion));
  return dims;
}

export function resolutionOf(intensity: Intensity): Resolution {
  return intensity === "quick" ? "coarse" : intensity === "exhaustive" ? "fine" : "standard";
}

// ---- level-scaled economics (Clash-of-Clans-style) ---------------------------

/** Wall-clock the next training is paced to take, by current level — minutes at
 *  Lv1, climbing toward days. Effort tilts it within the level. */
export function trainDurationMs(level: number, effort: Effort): number {
  const MIN = 60_000, HR = 3_600_000;
  const ladder = [
    5 * MIN,    // Lv1 → 2
    15 * MIN,   // Lv2 → 3
    45 * MIN,   // Lv3 → 4
    1.5 * HR,   // Lv4 → 5
    3 * HR,     // Lv5 → 6
    6 * HR,     // Lv6 → 7
    12 * HR,    // Lv7 → 8
    18 * HR,    // Lv8 → 9
    24 * HR,    // Lv9 → 10
  ];
  const i = Math.max(1, Math.floor(level)) - 1;
  const base = i < ladder.length ? ladder[i] : 24 * HR + (i - ladder.length + 1) * 12 * HR; // +12h per level beyond
  const effMult = effort === "light" ? 0.55 : effort === "max" ? 1.7 : 1;
  return Math.round(base * effMult);
}

const INTENSITY_BUDGET: Record<Intensity, number> = { quick: 120, standard: 300, thorough: 650, exhaustive: 1300 };

/** How many distinct configs we actually backtest — grows with level (deeper
 *  search the higher you climb) and with effort. */
export function budgetOf(plan: TrainPlan, level: number): number {
  const base = INTENSITY_BUDGET[plan.intensity];
  const levelMult = 1 + (Math.max(1, level) - 1) * 0.7;
  const effMult = plan.effort === "light" ? 0.5 : plan.effort === "max" ? 2 : 1;
  return Math.round(base * levelMult * effMult);
}

export interface Phase { id: PhaseId; label: string; blurb: string; }
const ALL_PHASES: { phase: Phase; minLevel: number }[] = [
  { minLevel: 1, phase: { id: "scan", label: "Scan", blurb: "Broad walk-forward search across the parameter space." } },
  { minLevel: 3, phase: { id: "evolve", label: "Evolve", blurb: "Breed & hill-climb the best settings over generations." } },
  { minLevel: 6, phase: { id: "stress", label: "Stress", blurb: "Monte-Carlo resample the finalists; keep the robust one." } },
  { minLevel: 9, phase: { id: "generalize", label: "Generalize", blurb: "Field-test the winner across other stocks — does the edge travel?" } },
];
/** Which phases a bot of this level runs (unlocks climb with level). */
export function phasesForLevel(level: number): Phase[] {
  return ALL_PHASES.filter((p) => level >= p.minLevel).map((p) => p.phase);
}
export function nextUnlock(level: number): { phase: Phase; atLevel: number } | null {
  const next = ALL_PHASES.find((p) => level < p.minLevel);
  return next ? { phase: next.phase, atLevel: next.minLevel } : null;
}

export const INTENSITY_LABEL: Record<Intensity, string> = {
  quick: "Quick scan", standard: "Standard", thorough: "Thorough", exhaustive: "Exhaustive",
};
export const EFFORT_LABEL: Record<Effort, string> = {
  light: "Light · quicker, smaller gain", standard: "Standard", max: "Max · longer, bigger gain",
};

/** The full theoretical search-space size: product of each opened dimension's option count. */
export function spaceSize(config: BotConfig, plan: TrainPlan): number {
  const res = resolutionOf(plan.intensity);
  const dims = dimsForConfig(config, plan.fusion);
  let total = 1;
  for (const d of dims) {
    if (plan.open.includes(d.key)) total *= d.values(res).length;
  }
  return total;
}

export interface PlanMath {
  space: number;
  sampled: number;
  backtests: number;
  fullFidelitySeconds: number;
  openDims: number;
  durationMs: number;
  phases: Phase[];
}

const BARS_PER_YEAR = 252;

/** Honest "this is how big the job is" math shown on the setup screen. */
export function planMath(config: BotConfig, plan: TrainPlan, level: number): PlanMath {
  const space = spaceSize(config, plan);
  const sampled = Math.min(space, budgetOf(plan, level));
  const backtests = sampled * plan.folds;
  const msPerBacktest = plan.years * BARS_PER_YEAR * 0.003;
  const fullFidelitySeconds = (space * plan.folds * msPerBacktest) / 1000;
  return { space, sampled, backtests, fullFidelitySeconds, openDims: plan.open.length, durationMs: trainDurationMs(level, plan.effort), phases: phasesForLevel(level) };
}

export function humanDuration(seconds: number): string {
  if (seconds < 1) return "<1 sec";
  if (seconds < 90) return `${Math.round(seconds)} sec`;
  const m = seconds / 60;
  if (m < 90) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} hours`;
  const d = h / 24;
  return `${d.toFixed(d < 10 ? 1 : 0)} days`;
}

export function humanCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

/** Walk-forward split fractions for `folds` windows (more = more honest). */
export function foldFractions(folds: number): number[] {
  const n = Math.max(2, Math.min(10, folds));
  const lo = 0.5, hi = 0.85;
  return Array.from({ length: n }, (_, i) => +(lo + ((hi - lo) * i) / (n - 1)).toFixed(3));
}

/** Largest odd number < total that is coprime with total — a scramble stride for
 *  mixed-radix index visiting so the sample spreads across the whole space. */
function coprimeStride(total: number): number {
  if (total <= 2) return 1;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let s = Math.floor(total * 0.61803398875) | 1;
  let guard = 0;
  while (gcd(s, total) !== 1 && guard++ < 1000) s = (s + 2) % total || 1;
  return s < 1 ? 1 : s;
}

function cloneConfig(base: BotConfig): BotConfig {
  const cfg: BotConfig = { ...base, fusion: base.fusion ?? null };
  cfg.ma = { ...base.ma }; cfg.rsi = { ...base.rsi };
  if (base.macd) cfg.macd = { ...base.macd };
  if (base.bollinger) cfg.bollinger = { ...base.bollinger };
  if (base.breakout) cfg.breakout = { ...base.breakout };
  if (base.dip) cfg.dip = { ...base.dip };
  if (base.risk) cfg.risk = { ...base.risk };
  if (base.custom) cfg.custom = cloneCustom(base.custom);
  return cfg;
}

/** Decode a visit-order step `k` into a concrete config for the plan (Scan phase). */
export function decodeConfig(
  base: BotConfig, plan: TrainPlan, k: number, total: number, stride: number,
): BotConfig | null {
  const res = resolutionOf(plan.intensity);
  const dims = dimsForConfig(base, plan.fusion);
  const cfg = cloneConfig(base);
  let idx = total > 0 ? (k * stride) % total : 0;
  const openDims = dims.filter((d) => plan.open.includes(d.key));
  for (const d of openDims) {
    const opts = d.values(res);
    const choice = opts[idx % opts.length];
    idx = Math.floor(idx / opts.length);
    d.apply(cfg, choice);
  }
  if (plan.fusion && plan.fusion !== base.strategy && !plan.open.includes("fusion.param")) {
    cfg.fusion = { strategy: plan.fusion, param: base.fusion?.param ?? 50 };
  }
  if (!isValid(cfg)) return null;
  return cfg;
}

/** Neighbours of `center` for the Evolve phase: each opened dial nudged to its
 *  adjacent grid value(s), one (and a few pairs) at a time — coordinate
 *  hill-climbing / mutation around the current best. */
export function neighborConfigs(center: BotConfig, plan: TrainPlan, max = 24): BotConfig[] {
  const res = resolutionOf(plan.intensity);
  const dims = dimsForConfig(center, plan.fusion).filter((d) => plan.open.includes(d.key));
  const out: BotConfig[] = [];
  const seen = new Set<string>();
  const push = (cfg: BotConfig) => {
    if (!isValid(cfg)) return;
    const key = sig(cfg);
    if (seen.has(key) || key === sig(center)) return;
    seen.add(key); out.push(cfg);
  };
  // single-dial mutations
  for (const d of dims) {
    const opts = d.values(res);
    const cur = opts.indexOf(d.read(center));
    for (const j of [cur - 1, cur + 1]) {
      if (j < 0 || j >= opts.length) continue;
      const cfg = cloneConfig(center); d.apply(cfg, opts[j]); push(cfg);
    }
  }
  // a few random two-dial jumps for diversity
  for (let t = 0; t < dims.length && out.length < max; t++) {
    const a = dims[Math.floor(Math.random() * dims.length)];
    const b = dims[Math.floor(Math.random() * dims.length)];
    if (a === b) continue;
    const oa = a.values(res), ob = b.values(res);
    const ia = Math.max(0, Math.min(oa.length - 1, oa.indexOf(a.read(center)) + (Math.random() < 0.5 ? -1 : 1)));
    const ib = Math.max(0, Math.min(ob.length - 1, ob.indexOf(b.read(center)) + (Math.random() < 0.5 ? -1 : 1)));
    const cfg = cloneConfig(center); a.apply(cfg, oa[ia]); b.apply(cfg, ob[ib]); push(cfg);
  }
  return out.slice(0, max);
}

function sig(c: BotConfig): string {
  return JSON.stringify([c.ma, c.rsi, c.macd, c.bollinger, c.breakout, c.dip, c.risk, c.fusion, c.custom]);
}

export { coprimeStride };

function isValid(c: BotConfig): boolean {
  if (c.custom) return c.custom.entry.conds.length > 0; // structure fixed during training; numbers stay in-grid
  switch (c.strategy) {
    case "ma": if (c.ma.fast >= c.ma.slow) return false; break;
    case "rsi": if (c.rsi.oversold + 8 > c.rsi.overbought) return false; break;
    case "macd": if ((c.macd?.fast ?? 0) >= (c.macd?.slow ?? 1)) return false; break;
    case "breakout": if ((c.breakout?.exit ?? 0) > (c.breakout?.entry ?? 1)) return false; break;
    case "dip": if ((c.dip?.short ?? 0) >= (c.dip?.long ?? 1)) return false; break;
  }
  return true;
}

/** A sensible default plan: open the strategy params + stop-loss, standard
 *  intensity, 5y, 4 folds, standard effort. */
export function defaultPlan(strategy: StrategyId): TrainPlan {
  const open = STRAT_DIMS[strategy].map((d) => d.key);
  open.push("stopLoss");
  return { open, intensity: "standard", fusion: null, years: 5, folds: 4, effort: "standard" };
}

/** Default plan that also handles custom strategies (opens their tunables). */
export function defaultPlanForConfig(config: BotConfig): TrainPlan {
  if (!config.custom) return defaultPlan(config.strategy);
  const open = customDims(config).map((d) => d.key);
  open.push("stopLoss");
  return { open, intensity: "standard", fusion: null, years: 5, folds: 4, effort: "standard" };
}
