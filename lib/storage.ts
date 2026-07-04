// Bot persistence. Backed by Supabase (per-user, cloud) but exposed through the
// same synchronous API the rest of the app already uses: an in-memory cache is
// the source of truth for the UI, and writes are mirrored to Supabase in the
// background. Call setUser() + fetchBots() after sign-in to fill the cache.

import { BotConfig } from "./types";
import { TrainPlan, PhaseId } from "./trainPlan";
import { supabase } from "./supabase";

export interface BotMetrics {
  totalReturn: number;
  oosReturn: number;
  maxDrawdown: number;
  trades: number;
}

export interface TrainSchedule {
  enabled: boolean;
  lastTrained: number | null;
}

export interface PaperState {
  config: BotConfig;
  startDate: string;
  capital: number;
  deployedAt: number;
  equity: { t: string; v: number }[];
  trades: number;
  holding: boolean;
  lastDate: string | null;
}

export interface ParamDiff { label: string; from: string; to: string; }

/** A "why" curve for one optimized parameter: best score seen at each value. */
export interface ParamCurve {
  key: string;
  label: string;
  best: number;          // value training converged to
  points: { v: number; score: number }[];
  fmtBest: string;       // pre-formatted best value (e.g. "90", "10%")
}

/** Monte-Carlo robustness distribution for the chosen setting. */
export interface MonteCarlo {
  samples: number[];      // resampled total returns
  p05: number;            // 5th-percentile (worst-case) return
  median: number;
  profitableFrac: number; // share of resamples that finished profitable
}

/** Cross-ticker "does the edge travel?" field test (Generalize phase). */
export interface Generalize {
  perTicker: { symbol: string; oos: number }[];
  score: number;     // mean out-of-sample across the basket
  traveled: number;  // fraction of other stocks where it stayed profitable
}

export interface LastTraining {
  diffs: ParamDiff[];
  improvement: number;
  beforeOos: number;
  afterOos: number;
  tested: number;
  at: number;
  // ---- richer transparency (optional; older runs omit these) ----
  space?: number;            // theoretical combinations searched
  curves?: ParamCurve[];     // per-parameter "what it learned"
  fusionAdded?: string | null;
  years?: number;
  folds?: number;
  oosByFold?: number[];      // robustness across windows
  riskAdjusted?: number;     // Calmar-like return ÷ drawdown of the winner
  plateau?: number;          // 0..1 — how broad/robust the winning region is
  overfitHaircut?: number;   // confidence discount from how hard we searched
  monteCarlo?: MonteCarlo | null;
  generalize?: Generalize | null;
  phasesRun?: string[];      // e.g. ["Scan","Evolve","Stress"]
  generations?: number;      // evolution generations completed
}

/** A leaderboard entry shown live during a run. */
export interface RunEntry { label: string; score: number; oos: number; total: number; }
export interface RunEvent { at: number; kind: "best" | "milestone" | "phase"; text: string; }
export interface ExplorePoint { x: number; y: number; s: number; }

/** A persisted, resumable training run. Time-paced: progress is credited from
 *  elapsed wall-clock, so a bot keeps "training" while the user is away. */
export interface TrainingRun {
  plan: TrainPlan;
  symbol: string;
  level: number;        // bot level when the run started (gates phases/time)
  total: number;        // theoretical search space
  sampled: number;      // configs we will actually backtest
  stride: number;       // scramble stride over the index space
  cursor: number;       // next visit index k
  tested: number;       // valid configs evaluated so far
  startedAt: number;
  updatedAt: number;
  durationMs: number;   // paced wall-clock target
  baseOos: number;      // starting out-of-sample return
  bestConfig: BotConfig;
  bestScore: number;
  bestMetrics: BotMetrics;
  bestOosByFold: number[];
  leaderboard: RunEntry[];
  scoreCurve: number[]; // best-score sampled over progress
  explore: ExplorePoint[];
  axis: { xKey: string; xLabel: string; yKey: string; yLabel: string } | null;
  paramBest: Record<string, Record<string, number>>; // key -> valueStr -> best score
  log: RunEvent[];
  // ---- phased engine state ----
  phase: PhaseId | "done";
  generation: number;          // evolution generation counter
  evolveQueue: BotConfig[];    // pending neighbours to evaluate in Evolve
  monteCarlo: MonteCarlo | null;
  stressTicks: number;         // dwell counter so the Stress phase is visible
  generalize: Generalize | null;
  generalized: boolean;
  generalizeTicks: number;
  status: "running" | "done";
}

export interface SavedBot {
  id: string;
  name: string;
  color: string;
  symbol: string;
  config: BotConfig;
  createdAt: number;
  level: number;
  xp: number;
  trainings: number;
  best: BotMetrics | null;
  schedule: TrainSchedule;
  paper?: PaperState | null;
  lastTraining?: LastTraining | null;
  /** an in-progress (possibly paused) training run */
  activeRun?: TrainingRun | null;
  /** freeze alpha-decay (the user is happy with this bot as-is) */
  frozen?: boolean;
  /** shared to the public Summit leaderboard */
  published?: boolean;
}

export interface LabSeed {
  id?: string;
  name: string;
  color: string;
  symbol: string;
  config?: BotConfig;
}

const LOCAL_KEY = "stratlab.bots.v1";

let cache: SavedBot[] = [];
let uid: string | null = null;

/** Set (or clear) the signed-in user. Clears the cache on sign-out. */
export function setUser(userId: string | null): void {
  uid = userId;
  if (!userId) cache = [];
}

/** Load this user's bots from Supabase into the cache. */
export async function fetchBots(): Promise<SavedBot[]> {
  if (!uid || !supabase) return cache;
  const { data, error } = await supabase
    .from("bots")
    .select("data")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[storage] fetch", error.message);
    return cache;
  }
  cache = (data || []).map((r: { data: SavedBot }) => r.data);
  return cache;
}

/** One-time migration: if the cloud is empty but this browser has local bots
 *  (from before sign-in), upload them, then clear local. */
export async function migrateLocalBots(): Promise<number> {
  if (!uid || !supabase || cache.length > 0) return 0;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_KEY) : null;
    const local: SavedBot[] = raw ? JSON.parse(raw) : [];
    if (local.length === 0) return 0;
    const rows = local.map(toRow);
    const { error } = await supabase.from("bots").upsert(rows);
    if (error) {
      console.error("[storage] migrate", error.message);
      return 0;
    }
    cache = local;
    window.localStorage.removeItem(LOCAL_KEY);
    return local.length;
  } catch {
    return 0;
  }
}

function toRow(bot: SavedBot) {
  return {
    id: bot.id,
    user_id: uid,
    data: bot,
    published: !!bot.published,
    display_name: bot.name,
    symbol: bot.symbol,
    oos_return: bot.best?.oosReturn ?? null,
    forward_return: bot.paper ? bot.paper.equity.at(-1)?.v != null ? bot.paper.equity.at(-1)!.v / bot.paper.capital - 1 : null : null,
    updated_at: new Date().toISOString(),
  };
}

function persist(bot: SavedBot): void {
  if (!uid || !supabase) return;
  supabase
    .from("bots")
    .upsert(toRow(bot))
    .then(({ error }) => {
      if (error) console.error("[storage] save", error.message);
    });
}

/** Synchronous read of the cache (populated by fetchBots after sign-in). */
export function loadBots(): SavedBot[] {
  return cache;
}

export function saveBots(bots: SavedBot[]): void {
  cache = bots;
}

export function upsertBot(bot: SavedBot): SavedBot[] {
  const i = cache.findIndex((b) => b.id === bot.id);
  if (i >= 0) cache[i] = bot;
  else cache.unshift(bot);
  cache = [...cache];
  persist(bot);
  return cache;
}

export function deleteBot(id: string): SavedBot[] {
  cache = cache.filter((b) => b.id !== id);
  if (uid && supabase) {
    supabase.from("bots").delete().eq("id", id).eq("user_id", uid).then(({ error }) => {
      if (error) console.error("[storage] delete", error.message);
    });
  }
  return cache;
}

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / 100);
}
export function xpIntoLevel(xp: number): number {
  return Math.max(0, xp) % 100;
}
export function newId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}
