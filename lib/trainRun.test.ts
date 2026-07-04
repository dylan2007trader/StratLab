import { describe, it, expect } from "vitest";
import { Bar, BotConfig } from "./types";
import { SavedBot } from "./storage";
import {
  spaceSize, decodeConfig, coprimeStride, defaultPlan, foldFractions, dimsForPlan, planMath,
  trainDurationMs, budgetOf, phasesForLevel, nextUnlock, neighborConfigs, TrainPlan,
} from "./trainPlan";
import { createRun, stepRun, runProgress, runToCompletion } from "./trainRun";

function series(seed: number, n = 360): Bar[] {
  let a = seed;
  const rng = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const randn = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out: Bar[] = []; let lp = Math.log(100);
  for (let i = 0; i < n; i++) { lp += 0.0006 + 0.013 * randn(); out.push({ t: "2021-01-" + String((i % 28) + 1).padStart(2, "0"), c: Math.exp(lp) }); }
  return out;
}
const bars = series(11);
const cfg: BotConfig = {
  name: "T", symbol: "X", capital: 10000, strategy: "ma",
  ma: { fast: 10, slow: 40 }, rsi: { period: 14, oversold: 30, overbought: 70 },
  risk: { stopLoss: 0, takeProfit: 0, positionSize: 1, trendFilter: 0 },
};
function bot(level = 1): SavedBot {
  return { id: "b1", name: "T", color: "teal", symbol: "X", config: cfg, createdAt: 0, level, xp: (level - 1) * 100, trainings: 0, best: null, schedule: { enabled: false, lastTrained: null } };
}
const plan = (over: Partial<TrainPlan> = {}): TrainPlan => ({ open: ["ma.fast", "ma.slow", "stopLoss"], intensity: "standard", fusion: null, years: 5, folds: 4, effort: "standard", ...over });

describe("trainPlan", () => {
  it("space size is the product of opened dimension option counts", () => {
    const dims = dimsForPlan("ma", null);
    const fast = dims.find((d) => d.key === "ma.fast")!.values("standard").length;
    const slow = dims.find((d) => d.key === "ma.slow")!.values("standard").length;
    expect(spaceSize(cfg, plan({ open: ["ma.fast", "ma.slow"] }))).toBe(fast * slow);
  });

  it("decodeConfig keeps locked dials fixed and rejects invalid combos", () => {
    const p = plan({ open: ["ma.fast", "ma.slow"] });
    const total = spaceSize(cfg, p);
    const stride = coprimeStride(total);
    let valid = 0;
    for (let k = 0; k < total; k++) {
      const c = decodeConfig(cfg, p, k, total, stride);
      if (!c) continue;
      valid++;
      expect(c.ma.fast).toBeLessThan(c.ma.slow);
      expect(c.risk!.stopLoss).toBe(cfg.risk!.stopLoss);
    }
    expect(valid).toBeGreaterThan(0);
  });

  it("neighbourConfigs are valid mutations adjacent to the centre", () => {
    const ns = neighborConfigs(cfg, plan({ open: ["ma.fast", "ma.slow"] }));
    expect(ns.length).toBeGreaterThan(0);
    for (const n of ns) expect(n.ma.fast).toBeLessThan(n.ma.slow);
  });

  it("training time and search budget grow with level; effort tilts time", () => {
    expect(trainDurationMs(6, "standard")).toBeGreaterThan(trainDurationMs(1, "standard"));
    expect(budgetOf(plan(), 6)).toBeGreaterThan(budgetOf(plan(), 1));
    expect(trainDurationMs(3, "light")).toBeLessThan(trainDurationMs(3, "standard"));
    expect(trainDurationMs(3, "max")).toBeGreaterThan(trainDurationMs(3, "standard"));
  });

  it("phases unlock with level", () => {
    expect(phasesForLevel(1).map((p) => p.id)).toEqual(["scan"]);
    expect(phasesForLevel(3).map((p) => p.id)).toEqual(["scan", "evolve"]);
    expect(phasesForLevel(6).map((p) => p.id)).toEqual(["scan", "evolve", "stress"]);
    expect(phasesForLevel(9).map((p) => p.id)).toEqual(["scan", "evolve", "stress", "generalize"]);
    expect(nextUnlock(1)?.atLevel).toBe(3);
  });

  it("planMath samples within the space and reports duration + phases", () => {
    const m = planMath(cfg, plan(), 6);
    expect(m.sampled).toBeLessThanOrEqual(m.space);
    expect(m.backtests).toBe(m.sampled * 4);
    expect(m.durationMs).toBe(trainDurationMs(6, "standard"));
    expect(m.phases.length).toBe(3);
  });

  it("foldFractions returns the requested count, ascending and in range", () => {
    const f = foldFractions(6);
    expect(f).toHaveLength(6);
    expect(f[0]).toBeGreaterThanOrEqual(0.5);
    expect(f[f.length - 1]).toBeLessThanOrEqual(0.85);
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeGreaterThan(f[i - 1]);
  });
});

describe("training engine", () => {
  it("a Level-1 run does Scan only and completes; search never regresses", () => {
    const run = createRun(bot(1), plan(), bars);
    run.durationMs = 1;
    const baseScore = run.bestScore;
    let guard = 0;
    while (run.status === "running" && guard++ < 3000) stepRun(run, cfg, bars, 100);
    expect(run.status).toBe("done");
    expect(run.generation).toBe(0);       // no Evolve at Lv1
    expect(run.monteCarlo).toBeNull();    // no Stress at Lv1
    expect(runProgress(run)).toBeCloseTo(1, 1);
    expect(run.bestScore).toBeGreaterThanOrEqual(baseScore);
  });

  it("a Level-6 run runs Scan→Evolve→Stress with a Monte-Carlo distribution", () => {
    const run = createRun(bot(6), plan(), bars);
    run.durationMs = 1;
    const seen = new Set<string>();
    let guard = 0;
    while (run.status === "running" && guard++ < 6000) { stepRun(run, cfg, bars, 100); seen.add(run.phase); }
    expect(run.status).toBe("done");
    expect(seen.has("evolve")).toBe(true);
    expect(seen.has("stress")).toBe(true);
    expect(run.generation).toBeGreaterThan(0);
    expect(run.monteCarlo).not.toBeNull();
    expect(run.monteCarlo!.samples.length).toBeGreaterThan(0);
    expect(run.monteCarlo!.profitableFrac).toBeGreaterThanOrEqual(0);
  });

  it("runToCompletion finalizes with a rich report, robustness stats and XP", () => {
    const updated = runToCompletion(bot(6), plan(), bars);
    expect(updated.activeRun).toBeNull();
    expect(updated.trainings).toBe(1);
    expect(updated.xp).toBeGreaterThan(0);
    const lt = updated.lastTraining!;
    expect(lt.afterOos).toBeGreaterThanOrEqual(lt.beforeOos);
    expect(lt.riskAdjusted).toBeDefined();
    expect(lt.plateau).toBeGreaterThanOrEqual(0);
    expect(lt.overfitHaircut).toBeGreaterThan(0);
    expect(lt.phasesRun).toContain("Stress");
    expect(lt.monteCarlo).not.toBeNull();
  });

  it("fusion runs end-to-end and records the fused strategy", () => {
    const updated = runToCompletion(bot(3), plan({ open: ["ma.fast", "ma.slow", "fusion.param"], fusion: "rsi", folds: 3 }), bars);
    expect(updated.lastTraining!.fusionAdded).toBeTruthy();
  });
});
