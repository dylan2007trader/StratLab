// The resumable, time-paced training ENGINE. A run grinds through phases that
// unlock with the bot's level — Scan (broad walk-forward search), Evolve
// (genetic hill-climb on the best), Stress (Monte-Carlo resample of the
// finalists). Scoring is risk-adjusted (return ÷ drawdown) and rewards robust
// parameter regions over fragile spikes; the reported result is discounted by an
// overfit "haircut" that grows with how hard we searched. Progress is paced to
// the level-scaled wall-clock, and because pacing is derived from elapsed real
// time, a run keeps advancing across reloads — leave it overnight, come back to
// a stronger bot.

import { BotConfig } from "./types";
import { runBacktest } from "./backtest";
import { describeConfig, diffParams, paramList } from "./bot";
import {
  SavedBot, BotMetrics, TrainingRun, LastTraining, ParamCurve, RunEvent, ExplorePoint, MonteCarlo, Generalize,
  levelFromXp, upsertBot,
} from "./storage";
import {
  TrainPlan, dimsForConfig, resolutionOf, spaceSize, budgetOf, trainDurationMs,
  foldFractions, coprimeStride, decodeConfig, neighborConfigs, phasesForLevel, STRATEGY_NAMES,
} from "./trainPlan";

const MAX_EXPLORE = 140;
const MAX_CURVE = 80;
const MAX_LOG = 44;
const LEADER_N = 6;
const SCAN_FRACTION = 0.6; // share of the budget spent on broad scan before Evolve

export interface Scored {
  config: BotConfig;
  score: number;
  metrics: BotMetrics;
  oosByFold: number[];
  mean: number;
  std: number;
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stdev = (a: number[]) => { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };

/** Score one config across the plan's fold windows. Risk-adjusted: rewards
 *  return per unit drawdown and penalises inconsistency across windows (a proxy
 *  for a fragile, overfit setting) and trade-starved configs. */
export function scoreConfig(config: BotConfig, bars: { t: string; c: number }[], fractions: number[]): Scored {
  const cap = Math.max(100, config.capital || 10000);
  const oosByFold: number[] = [];
  let metrics: BotMetrics | null = null;
  let winRate = 0;
  const mid = fractions[Math.floor(fractions.length / 2)];
  for (const f of fractions) {
    const r = runBacktest(config, bars, f);
    const oos = r.outOfSample.totalReturn;
    oosByFold.push(oos);
    if (f === mid) {
      metrics = { totalReturn: r.overall.totalReturn, oosReturn: oos, maxDrawdown: r.overall.maxDrawdown, trades: r.overall.tradeCount };
      winRate = r.overall.winRate ?? 0;
    }
  }
  if (!metrics) {
    const r = runBacktest(config, bars, 0.7);
    metrics = { totalReturn: r.overall.totalReturn, oosReturn: r.outOfSample.totalReturn, maxDrawdown: r.overall.maxDrawdown, trades: r.overall.tradeCount };
    winRate = r.overall.winRate ?? 0;
  }
  const mean = avg(oosByFold);
  const sd = stdev(oosByFold);
  const ddFactor = 1 / (1 + Math.abs(metrics.maxDrawdown) * 3); // Calmar-like
  const tradePenalty = metrics.trades < 3 ? 0.05 : 0;            // distrust 1-2 lucky trades
  // The objective decides what "better" means — the user's risk philosophy.
  let goodness: number;
  switch (config.objective ?? "calmar") {
    case "return": goodness = mean; break;
    case "cappedDD": goodness = mean - (Math.abs(metrics.maxDrawdown) > 0.2 ? (Math.abs(metrics.maxDrawdown) - 0.2) * 2.5 : 0); break;
    case "winRate": goodness = winRate * 0.5 + mean * ddFactor * 0.5; break;
    case "calmar": default: goodness = mean * ddFactor; break;
  }
  const score = goodness - 0.5 * sd - tradePenalty;
  return { config, score, metrics, oosByFold, mean, std: sd };
}

/** Build a fresh run for a bot + plan. Evaluates the baseline immediately. */
export function createRun(bot: SavedBot, plan: TrainPlan, bars: { t: string; c: number }[]): TrainingRun {
  const level = Math.max(1, bot.level);
  const total = spaceSize(bot.config, plan);
  const sampled = Math.min(total, budgetOf(plan, level));
  const fractions = foldFractions(plan.folds);
  const base = scoreConfig(bot.config, bars, fractions);

  const dims = dimsForConfig(bot.config, plan.fusion).filter((d) => plan.open.includes(d.key));
  const axis = dims.length >= 2
    ? { xKey: dims[0].key, xLabel: dims[0].label, yKey: dims[1].key, yLabel: dims[1].label }
    : null;

  const now = Date.now();
  const phaseNames = phasesForLevel(level).map((p) => p.label).join(" → ");
  const run: TrainingRun = {
    plan, symbol: bot.symbol, level, total, sampled,
    stride: coprimeStride(total), cursor: 0, tested: 0,
    startedAt: now, updatedAt: now, durationMs: trainDurationMs(level, plan.effort),
    baseOos: base.metrics.oosReturn,
    bestConfig: base.config, bestScore: base.score, bestMetrics: base.metrics, bestOosByFold: base.oosByFold,
    leaderboard: [entryOf(base)], scoreCurve: [base.metrics.oosReturn], explore: [], axis,
    paramBest: {}, phase: "scan", generation: 0, evolveQueue: [], monteCarlo: null, stressTicks: 0,
    generalize: null, generalized: false, generalizeTicks: 0, status: "running",
    log: [{ at: now, kind: "phase", text: `Lv.${level} training · phases: ${phaseNames} · ${fmt(total)} combinations` }],
  };
  return run;
}

function entryOf(s: Scored): { label: string; score: number; oos: number; total: number } {
  return { label: describeConfig(s.config), score: s.score, oos: s.metrics.oosReturn, total: s.metrics.totalReturn };
}

export function pacedTarget(run: TrainingRun, now = Date.now()): number {
  const t = Math.min(1, Math.max(0, (now - run.startedAt) / run.durationMs));
  return Math.ceil(run.sampled * t);
}
export function runProgress(run: TrainingRun): number {
  return run.sampled ? Math.min(1, run.tested / run.sampled) : 1;
}
export function etaSeconds(run: TrainingRun, now = Date.now()): number | null {
  if (run.status === "done") return null;
  const remMs = (1 - runProgress(run)) * run.durationMs;
  return Math.max(0, Math.round(remMs / 1000));
}

/** Advance the run within wall-clock pacing, up to `maxConfigs` evaluations. */
export function stepRun(
  run: TrainingRun, base: BotConfig, bars: { t: string; c: number }[], maxConfigs = 200,
  basket: { symbol: string; bars: { t: string; c: number }[] }[] = [],
): TrainingRun {
  if (run.status === "done") return run;
  const now = Date.now();
  const target = pacedTarget(run, now);
  const fractions = foldFractions(run.plan.folds);
  const dims = dimsForConfig(base, run.plan.fusion).filter((d) => run.plan.open.includes(d.key));
  const axisX = dims.find((d) => d.key === run.axis?.xKey) || null;
  const axisY = dims.find((d) => d.key === run.axis?.yKey) || null;
  let scanEnd = run.level >= 3 ? Math.floor(run.sampled * SCAN_FRACTION) : run.sampled;

  let evaluated = 0;
  while (run.tested < target && run.tested < run.sampled && evaluated < maxConfigs) {
    let cfg: BotConfig | null;
    if (run.tested < scanEnd) {
      if (run.phase !== "scan") run.phase = "scan";
      if (run.cursor >= run.total) {
        if (run.level >= 3) { scanEnd = run.tested; continue; } // space exhausted → hand off to Evolve
        break;                                                   // scan-only and nothing left
      }
      cfg = decodeConfig(base, run.plan, run.cursor++, run.total, run.stride);
      if (!cfg) continue;
    } else {
      // Evolve: hill-climb / mutate around the current best
      if (run.phase !== "evolve") {
        run.phase = "evolve";
        pushLog(run.log, { at: Date.now(), kind: "phase", text: "Phase: Evolve — breeding the best settings." });
      }
      if (run.evolveQueue.length === 0) {
        run.evolveQueue = neighborConfigs(run.bestConfig, run.plan);
        run.generation++;
        pushLog(run.log, { at: Date.now(), kind: "milestone", text: `Generation ${run.generation} · ${run.evolveQueue.length} mutations` });
        if (run.evolveQueue.length === 0) { run.tested = run.sampled; break; } // nowhere left to climb → finish
      }
      cfg = run.evolveQueue.shift()!;
    }

    const s = scoreConfig(cfg, bars, fractions);
    run.tested++;
    evaluated++;
    for (const d of dims) {
      const v = d.read(cfg);
      const rec = run.paramBest[d.key] || (run.paramBest[d.key] = {});
      const vs = String(v);
      if (rec[vs] === undefined || s.score > rec[vs]) rec[vs] = s.score;
    }
    if (axisX && axisY) pushExplore(run.explore, { x: axisX.read(cfg), y: axisY.read(cfg), s: s.score });
    if (s.score > run.bestScore) {
      run.bestScore = s.score; run.bestConfig = s.config; run.bestMetrics = s.metrics; run.bestOosByFold = s.oosByFold;
      run.evolveQueue = []; // re-seed mutations around the new best next loop
      pushLog(run.log, { at: Date.now(), kind: "best", text: `New best · ${describeConfig(s.config)} · unseen ${pctStr(s.metrics.oosReturn)}` });
      updateLeaderboard(run.leaderboard, s);
    }
  }

  if (run.scoreCurve.length < MAX_CURVE) run.scoreCurve.push(run.bestMetrics.oosReturn);
  else run.scoreCurve[run.scoreCurve.length - 1] = run.bestMetrics.oosReturn;

  run.updatedAt = now;

  // Out of budget → run the unlocked late phases in order, dwelling on each so
  // they animate, then finish.
  const scanExhausted = run.level < 3 && run.cursor >= run.total;
  if (run.tested >= run.sampled || scanExhausted) {
    // Stress (Lv6+): Monte-Carlo the best setting.
    if (run.level >= 6) {
      if (!run.monteCarlo) {
        run.phase = "stress";
        pushLog(run.log, { at: Date.now(), kind: "phase", text: "Phase: Stress — Monte-Carlo resampling the best setting." });
        run.monteCarlo = monteCarlo(run.bestConfig, bars, 160);
        pushLog(run.log, { at: Date.now(), kind: "milestone", text: `Monte-Carlo: worst-case ${pctStr(run.monteCarlo.p05)} · ${Math.round(run.monteCarlo.profitableFrac * 100)}% of runs profitable` });
        return run;
      }
      if (run.stressTicks < 8) { run.stressTicks++; run.updatedAt = now; return run; }
    }
    // Generalize (Lv9+): does the edge travel to other stocks?
    if (run.level >= 9 && basket.length) {
      if (!run.generalized) {
        run.phase = "generalize";
        pushLog(run.log, { at: Date.now(), kind: "phase", text: `Phase: Generalize — field-testing on ${basket.length} other stocks.` });
        run.generalize = generalizeTest(run.bestConfig, basket);
        run.generalized = true;
        pushLog(run.log, { at: Date.now(), kind: "milestone", text: `Edge travelled to ${Math.round(run.generalize.traveled * 100)}% of other stocks · avg ${pctStr(run.generalize.score)}` });
        return run;
      }
      if (run.generalizeTicks < 8) { run.generalizeTicks++; run.updatedAt = now; return run; }
    }
    run.phase = "done";
    run.status = "done";
    pushLog(run.log, { at: now, kind: "phase", text: `Done · ${run.tested} settings · gen ${run.generation} · best unseen ${pctStr(run.bestMetrics.oosReturn)}` });
  }
  return run;
}

/** Field-test a config across a basket of other stocks — the honest test of
 *  whether an edge is real or just curve-fit to one ticker. */
function generalizeTest(config: BotConfig, basket: { symbol: string; bars: { t: string; c: number }[] }[]): Generalize {
  const perTicker = basket.map((b) => ({ symbol: b.symbol, oos: runBacktest(config, b.bars).outOfSample.totalReturn }));
  const score = perTicker.length ? perTicker.reduce((a, b) => a + b.oos, 0) / perTicker.length : 0;
  const traveled = perTicker.length ? perTicker.filter((p) => p.oos > 0).length / perTicker.length : 0;
  return { perTicker, score, traveled };
}

/** Bootstrap resample of daily returns → synthetic price paths → backtest. */
export function monteCarlo(config: BotConfig, bars: { t: string; c: number }[], K = 160): MonteCarlo {
  const closes = bars.map((b) => b.c);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1]);
  const L = Math.min(rets.length, 800);
  let seed = 0x9e3779b9 ^ Math.round((config.ma.fast + config.ma.slow + (config.risk?.stopLoss ?? 0)) * 2654435761);
  const rng = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const samples: number[] = [];
  for (let k = 0; k < K; k++) {
    const synth: { t: string; c: number }[] = [{ t: "", c: 100 }];
    let px = 100;
    for (let i = 0; i < L; i++) { px *= rets[Math.floor(rng() * rets.length)]; synth.push({ t: "", c: px }); }
    samples.push(runBacktest(config, synth, 0.7).overall.totalReturn);
  }
  samples.sort((a, b) => a - b);
  const pct5 = samples[Math.floor(samples.length * 0.05)] ?? samples[0] ?? 0;
  const median = samples[Math.floor(samples.length * 0.5)] ?? 0;
  const profitableFrac = samples.filter((x) => x > 0).length / Math.max(1, samples.length);
  return { samples, p05: pct5, median, profitableFrac };
}

function pushExplore(arr: ExplorePoint[], p: ExplorePoint): void { arr.push(p); if (arr.length > MAX_EXPLORE) arr.splice(0, arr.length - MAX_EXPLORE); }
function pushLog(log: RunEvent[], e: RunEvent): void { log.push(e); if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG); }
function updateLeaderboard(lb: TrainingRun["leaderboard"], s: Scored): void {
  lb.push(entryOf(s)); lb.sort((a, b) => b.score - a.score); if (lb.length > LEADER_N) lb.length = LEADER_N;
}

/** Plateau 0..1: how consistent the winner is across windows (broad region vs spike). */
function plateauOf(oosByFold: number[]): number {
  const m = avg(oosByFold), sd = stdev(oosByFold);
  return Math.max(0, 1 - Math.min(1, sd / (Math.abs(m) + 0.05)));
}
/** Overfit haircut: discount the winner the harder we searched (deflation). */
function overfitHaircut(tested: number, oosByFold: number[]): number {
  const sd = stdev(oosByFold);
  return 0.018 * Math.sqrt(2 * Math.log(Math.max(2, tested))) * (0.5 + sd);
}

export function runXp(prevBest: BotMetrics | null, run: TrainingRun): number {
  const base = 12;
  if (!prevBest) return base + 15;
  const improvement = run.bestMetrics.oosReturn - run.baseOos;
  const robustness = run.bestOosByFold.filter((x) => x > 0).length / Math.max(1, run.bestOosByFold.length);
  const mcBonus = run.monteCarlo ? Math.round(run.monteCarlo.profitableFrac * 10) : 0;
  return base + (improvement > 0 ? Math.round(improvement * 500) : 0) + Math.round(robustness * 10) + mcBonus;
}

export function buildCurves(run: TrainingRun, base: BotConfig): ParamCurve[] {
  const dims = dimsForConfig(base, run.plan.fusion).filter((d) => run.plan.open.includes(d.key));
  const curves: ParamCurve[] = [];
  for (const d of dims) {
    const rec = run.paramBest[d.key];
    if (!rec) continue;
    const points = Object.entries(rec).map(([v, score]) => ({ v: Number(v), score })).filter((p) => Number.isFinite(p.v)).sort((a, b) => a.v - b.v);
    if (points.length < 2) continue;
    const bestVal = d.read(run.bestConfig);
    curves.push({ key: d.key, label: d.label, best: bestVal, points, fmtBest: d.fmt(bestVal) });
  }
  return curves;
}

export function finalizeRun(bot: SavedBot, run: TrainingRun): SavedBot {
  const before = bot.config;
  const gain = runXp(bot.best, run);
  const xp = bot.xp + gain;
  const last: LastTraining = {
    diffs: diffParams(before, run.bestConfig),
    improvement: run.bestMetrics.oosReturn - run.baseOos,
    beforeOos: run.baseOos,
    afterOos: run.bestMetrics.oosReturn,
    tested: run.tested,
    at: Date.now(),
    space: run.total,
    curves: buildCurves(run, before),
    fusionAdded: run.plan.fusion && run.plan.fusion !== before.strategy ? STRATEGY_NAMES[run.plan.fusion] : null,
    years: run.plan.years,
    folds: run.plan.folds,
    oosByFold: run.bestOosByFold,
    riskAdjusted: run.bestMetrics.oosReturn / (Math.abs(run.bestMetrics.maxDrawdown) + 0.05),
    plateau: plateauOf(run.bestOosByFold),
    overfitHaircut: overfitHaircut(run.tested, run.bestOosByFold),
    monteCarlo: run.monteCarlo,
    generalize: run.generalize,
    phasesRun: phasesForLevel(run.level).map((p) => p.label),
    generations: run.generation,
  };
  return {
    ...bot,
    config: run.bestConfig,
    best: run.bestMetrics,
    xp,
    level: levelFromXp(xp),
    trainings: bot.trainings + 1,
    schedule: { ...bot.schedule, lastTrained: Date.now() },
    lastTraining: last,
    activeRun: null,
  };
}

/** Run a plan to completion synchronously (background "while away" training). */
export function runToCompletion(bot: SavedBot, plan: TrainPlan, bars: { t: string; c: number }[]): SavedBot {
  let run = createRun(bot, plan, bars);
  run.durationMs = 1; // collapse pacing
  let guard = 0;
  while (run.status === "running" && guard++ < 4000) run = stepRun(run, bot.config, bars, 400);
  return finalizeRun(bot, run);
}

function pctStr(x: number): string { return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`; }
function fmt(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

export { paramList };
