// Forward paper-trading: trade a frozen bot FORWARD on data that arrived after
// it was deployed. Uses the same simulate() as backtests (with startIdx) so the
// behaviour is identical — no separate code path to drift.

import { Bar, BotConfig, DEFAULT_REALISM } from "./types";
import { PaperState } from "./storage";
import { simulate } from "./backtest";

export const DEFAULT_LOOKBACK = 252; // ~1 trading year

export function initPaper(config: BotConfig, bars: Bar[], capital = 10000, lookback = DEFAULT_LOOKBACK): PaperState {
  const startIdx = Math.max(0, bars.length - lookback);
  const startDate = bars.length ? bars[startIdx].t : "";
  return { config, startDate, capital, deployedAt: Date.now(), equity: [], trades: 0, holding: false, lastDate: null };
}

/** Recompute the forward run from startDate through the latest bar. Idempotent. */
export function advancePaper(state: PaperState, bars: Bar[]): PaperState {
  const prices = bars.map((b) => b.c);
  const opens = bars.map((b) => b.o ?? b.c);
  const dates = bars.map((b) => b.t);
  let startIdx = dates.findIndex((d) => d >= state.startDate);
  if (startIdx < 0) startIdx = 0;
  const sim = simulate(state.config, prices, state.capital, startIdx, { opens, realism: state.config.realism ?? DEFAULT_REALISM });
  const equity = sim.equity.map((v, k) => ({ t: dates[startIdx + k], v }));
  return {
    ...state,
    equity,
    trades: sim.trades.length,
    holding: sim.holding,
    lastDate: dates.length ? dates[dates.length - 1] : state.lastDate,
  };
}

export function paperValue(state: PaperState): number {
  return state.equity.length ? state.equity[state.equity.length - 1].v : state.capital;
}
export function paperReturn(state: PaperState): number {
  return paperValue(state) / state.capital - 1;
}
export function daysLive(state: PaperState): number {
  return Math.max(0, Math.round((Date.now() - state.deployedAt) / 86400000));
}
export function isHolding(state: PaperState): boolean {
  return state.holding;
}
