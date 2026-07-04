// The backtest engine. A single simulate() drives both backtests (score the
// past) and forward paper-trading, honoring each strategy's entry/exit signal
// plus the shared risk controls: trend filter, position size, stop-loss,
// take-profit.

import { BotConfig, BacktestRun, BacktestResult, Stats, TradeMark, DEFAULTS, RealismParams, DEFAULT_REALISM, FRICTIONLESS } from "./types";
import {
  desiredMA,
  desiredRSI,
  desiredMACD,
  desiredBollinger,
  desiredBreakout,
  desiredDip,
} from "./strategies";
import { sma, rsi, macd, bollinger, donchian } from "./indicators";
import { customSignal } from "./custom";

export const IN_SAMPLE_FRACTION = 0.7;

/** A confirming "want in" signal for a fused second strategy, driven by its
 *  single headline knob (`param`). Sensible defaults fill the rest. Used to
 *  AND-filter the primary strategy's entries. */
export function fusionSignal(strategy: BotConfig["strategy"], param: number, prices: number[]): number[] {
  const p = Math.max(2, Math.round(param));
  switch (strategy) {
    case "ma": return desiredMA(prices, Math.max(3, Math.round(p / 3)), Math.max(p, Math.round(p / 3) + 2));
    case "rsi": return desiredRSI(prices, p, 30, 70);
    case "macd": return desiredMACD(prices, p, p * 2, 9);
    case "bollinger": return desiredBollinger(prices, p, 2);
    case "breakout": return desiredBreakout(prices, p, Math.max(3, Math.round(p / 2)));
    case "dip": return desiredDip(prices, Math.max(p, 40), Math.max(5, Math.round(p / 4)));
    default: return prices.map(() => 1);
  }
}

/** The raw entry/exit signal (1 = want in, 0 = want out) for a strategy,
 *  before risk controls are applied. Applies strategy fusion if configured. */
export function baseSignal(config: BotConfig, prices: number[]): number[] {
  const primary = primarySignal(config, prices);
  if (config.fusion && config.fusion.strategy !== config.strategy) {
    const conf = fusionSignal(config.fusion.strategy, config.fusion.param, prices);
    // Confirming filter: only "in" when both agree.
    return primary.map((v, i) => (v === 1 && conf[i] === 1 ? 1 : 0));
  }
  return primary;
}

function primarySignal(config: BotConfig, prices: number[]): number[] {
  if (config.custom) return customSignal(config.custom, prices);
  switch (config.strategy) {
    case "ma": {
      let { fast, slow } = config.ma;
      if (fast >= slow) slow = fast + 10;
      return desiredMA(prices, fast, slow);
    }
    case "rsi":
      return desiredRSI(prices, config.rsi.period, config.rsi.oversold, config.rsi.overbought);
    case "macd": {
      const m = config.macd ?? DEFAULTS.macd;
      return desiredMACD(prices, m.fast, m.slow, m.signal);
    }
    case "bollinger": {
      const b = config.bollinger ?? DEFAULTS.bollinger;
      return desiredBollinger(prices, b.period, b.k);
    }
    case "breakout": {
      const b = config.breakout ?? DEFAULTS.breakout;
      return desiredBreakout(prices, b.entry, b.exit);
    }
    case "dip": {
      const d = config.dip ?? DEFAULTS.dip;
      return desiredDip(prices, d.long, d.short);
    }
    default:
      return desiredMA(prices, config.ma.fast, config.ma.slow);
  }
}

/** Back-compat alias used by older callers/tests. */
export const desiredFor = baseSignal;

export interface SimResult {
  equity: number[];
  trades: number[];
  marks: TradeMark[];
  holding: boolean;
}

export interface SimOpts {
  /** per-bar open prices (aligned with `prices`); enables next-bar-open fills */
  opens?: number[];
  /** execution realism; omitted = FRICTIONLESS (legacy same-bar, costless) */
  realism?: RealismParams;
}

/**
 * Walk the strategy forward applying risk controls and execution realism.
 * Decisions are made on the close of bar i (signals are causal — no look-ahead),
 * and orders fill on the NEXT bar's open when realism.fillTiming === "nextOpen",
 * paying slippage + commission, sized in whole or fractional shares. `startIdx`
 * lets paper trading begin partway through the series.
 */
export function simulate(config: BotConfig, prices: number[], capital: number, startIdx = 0, opts: SimOpts = {}): SimResult {
  const signal = baseSignal(config, prices);
  const r = config.risk ?? DEFAULTS.risk;
  const stop = r.stopLoss > 0 ? r.stopLoss / 100 : 0;
  const tp = r.takeProfit > 0 ? r.takeProfit / 100 : 0;
  const size = Math.min(1, Math.max(0.05, r.positionSize || 1));
  const trendMa = r.trendFilter > 0 ? sma(prices, r.trendFilter) : null;

  const realism = opts.realism ?? FRICTIONLESS;
  const opens = opts.opens;
  const slip = realism.slippageBps / 10000;
  const nextOpen = realism.fillTiming === "nextOpen";
  const whole = realism.shares === "whole";
  const fee = realism.commission;
  const n = prices.length;

  // Fill price for an order executing AT bar i (slippage worsens the price).
  const fillPx = (i: number, side: "buy" | "sell") => {
    const base = opens && opens[i] != null ? opens[i] : prices[i];
    return side === "buy" ? base * (1 + slip) : base * (1 - slip);
  };
  const buy = (px: number, cash: number) => {
    const invest = cash * size;
    let sh = invest / px;
    if (whole) sh = Math.floor(sh);
    return sh;
  };

  let cash = capital;
  let shares = 0;
  let entry: number | null = null;
  const equity: number[] = [];
  const trades: number[] = [];
  const marks: TradeMark[] = [];
  let blockUntilFlat = false;
  let pending: { side: "buy" | "sell"; reason: TradeMark["reason"] } | null = null;

  for (let i = startIdx; i < n; i++) {
    // 1) execute an order queued on the previous bar, at THIS bar's open
    if (pending) {
      const side = pending.side;
      const px = fillPx(i, side);
      if (side === "buy") {
        const sh = buy(px, cash);
        if (sh > 0 && sh * px + fee <= cash) {
          cash -= sh * px + fee; shares = sh; entry = px;
          marks.push({ i, type: "buy" });
        }
      } else if (shares > 0 && entry !== null) {
        cash += shares * px - fee;
        trades.push((px - entry) / entry);
        shares = 0; entry = null;
        marks.push({ i, type: "sell", reason: pending.reason });
      }
      pending = null;
    }

    const px = prices[i];

    // 2) decide on the close of bar i
    let wantExit = false;
    let exitReason: TradeMark["reason"] = "signal";
    if (shares > 0 && entry !== null) {
      if (stop && px <= entry * (1 - stop)) { wantExit = true; exitReason = "stop"; }
      else if (tp && px >= entry * (1 + tp)) { wantExit = true; exitReason = "target"; }
      else if (signal[i] === 0) { wantExit = true; exitReason = "signal"; }
    }
    if (signal[i] === 0) blockUntilFlat = false;
    const trendOk = !trendMa || (!isNaN(trendMa[i]) && px > trendMa[i]);
    const wantEntry = shares === 0 && signal[i] === 1 && trendOk && !blockUntilFlat && !pending;

    if (nextOpen) {
      if (wantExit) { pending = { side: "sell", reason: exitReason }; if (signal[i] === 1) blockUntilFlat = true; }
      else if (wantEntry) pending = { side: "buy", reason: "signal" };
    } else {
      // same-bar close fill (legacy / frictionless)
      if (wantExit && entry !== null) {
        const fp = px * (1 - slip);
        cash += shares * fp - fee;
        trades.push((fp - entry) / entry);
        shares = 0; entry = null;
        marks.push({ i, type: "sell", reason: exitReason });
        if (signal[i] === 1) blockUntilFlat = true;
      }
      if (shares === 0 && signal[i] === 1 && trendOk && !blockUntilFlat) {
        const fp = px * (1 + slip);
        const sh = buy(fp, cash);
        if (sh > 0 && sh * fp + fee <= cash) {
          cash -= sh * fp + fee; shares = sh; entry = fp;
          marks.push({ i, type: "buy" });
        }
      }
    }

    // 3) mark to market on the close
    equity.push(cash + shares * px);
  }

  if (shares > 0 && entry !== null) {
    trades.push((prices[n - 1] - entry) / entry);
  }
  return { equity, trades, marks, holding: shares > 0 };
}

export function maxDD(eq: number[]): number {
  let peak = -Infinity;
  let dd = 0;
  for (const v of eq) {
    if (v > peak) peak = v;
    dd = Math.min(dd, v / peak - 1);
  }
  return dd;
}

function summarize(equity: number[], trades: number[], capital: number): Stats {
  const totalReturn = equity.length ? equity[equity.length - 1] / capital - 1 : 0;
  const wins = trades.filter((t) => t > 0).length;
  const winRate = trades.length ? wins / trades.length : null;
  const expectancy = trades.length ? trades.reduce((a, b) => a + b, 0) / trades.length : null;
  return { totalReturn, maxDrawdown: maxDD(equity), tradeCount: trades.length, winRate, expectancy };
}

export function runBacktest(
  config: BotConfig,
  bars: { t: string; c: number }[],
  splitFraction: number = IN_SAMPLE_FRACTION
): BacktestResult {
  const prices = bars.map((b) => b.c);
  const opens = bars.map((b) => b.o ?? b.c);
  const dates = bars.map((b) => b.t);
  const n = prices.length;
  const capital = Math.max(100, config.capital || 10000);
  const frac = Math.min(0.95, Math.max(0.3, splitFraction));
  const splitIndex = Math.max(1, Math.min(n - 2, Math.floor(n * frac)));

  const { equity, trades, marks } = simulate(config, prices, capital, 0, { opens, realism: config.realism ?? DEFAULT_REALISM });

  const bhShares = capital / prices[0];
  const buyHold = prices.map((v) => bhShares * v);

  const oosTrades: number[] = [];
  let openBuyIdx: number | null = null;
  for (const m of marks) {
    if (m.type === "buy") openBuyIdx = m.i;
    if (m.type === "sell" && openBuyIdx !== null) {
      if (openBuyIdx >= splitIndex) oosTrades.push((prices[m.i] - prices[openBuyIdx]) / prices[openBuyIdx]);
      openBuyIdx = null;
    }
  }
  if (openBuyIdx !== null && openBuyIdx >= splitIndex) {
    oosTrades.push((prices[n - 1] - prices[openBuyIdx]) / prices[openBuyIdx]);
  }
  const oosEquity = equity.slice(splitIndex);
  const oosCapitalBase = equity[splitIndex] || capital;
  const outOfSample = summarize(oosEquity, oosTrades, oosCapitalBase);

  return {
    prices,
    dates,
    splitIndex,
    equity,
    buyHold,
    marks,
    overall: summarize(equity, trades, capital),
    outOfSample,
    buyHoldReturn: buyHold[n - 1] / capital - 1,
    buyHoldOosReturn: buyHold[n - 1] / buyHold[splitIndex] - 1,
  };
}

// ---- Indicators to draw so the user can SEE why the bot traded ----

export interface OverlayLine { id: string; label: string; color: string; values: number[]; }
export interface PaneSeries { id: string; label: string; color: string; values: number[]; }
export interface PaneGuide { value: number; color: string; title: string; }
export interface IndicatorPane { label: string; series: PaneSeries[]; guides: PaneGuide[]; }
export interface IndicatorSeries { overlay: OverlayLine[]; pane?: IndicatorPane; }

export function indicatorsFor(config: BotConfig, prices: number[]): IndicatorSeries {
  let base: IndicatorSeries;
  if (config.custom) base = { overlay: [] };
  else switch (config.strategy) {
    case "ma": {
      let { fast, slow } = config.ma;
      if (fast >= slow) slow = fast + 10;
      base = { overlay: [
        { id: "fast", label: `Fast MA (${fast})`, color: "#ff6b35", values: sma(prices, fast) },
        { id: "slow", label: `Slow MA (${slow})`, color: "#f5a623", values: sma(prices, slow) },
      ] };
      break;
    }
    case "rsi":
      base = { overlay: [], pane: {
        label: `RSI (${config.rsi.period})`,
        series: [{ id: "rsi", label: "RSI", color: "#7c3aed", values: rsi(prices, config.rsi.period) }],
        guides: [
          { value: config.rsi.oversold, color: "#1f8a70", title: `Buy < ${config.rsi.oversold}` },
          { value: config.rsi.overbought, color: "#d8534f", title: `Sell > ${config.rsi.overbought}` },
        ],
      } };
      break;
    case "macd": {
      const m = config.macd ?? DEFAULTS.macd;
      const calc = macd(prices, m.fast, m.slow, m.signal);
      base = { overlay: [], pane: {
        label: `MACD (${m.fast}/${m.slow}/${m.signal})`,
        series: [
          { id: "macd", label: "MACD", color: "#378add", values: calc.macd },
          { id: "signal", label: "Signal", color: "#d8534f", values: calc.signal },
        ],
        guides: [{ value: 0, color: "#9aa6b2", title: "0" }],
      } };
      break;
    }
    case "bollinger": {
      const b = config.bollinger ?? DEFAULTS.bollinger;
      const bb = bollinger(prices, b.period, b.k);
      base = { overlay: [
        { id: "upper", label: "Upper band", color: "#d8534f", values: bb.upper },
        { id: "mid", label: `Middle (${b.period})`, color: "#f5a623", values: bb.middle },
        { id: "lower", label: "Lower band", color: "#1f8a70", values: bb.lower },
      ] };
      break;
    }
    case "breakout": {
      const b = config.breakout ?? DEFAULTS.breakout;
      const ch = donchian(prices, b.entry, b.exit);
      base = { overlay: [
        { id: "upper", label: `${b.entry}-day high`, color: "#1f8a70", values: ch.upper },
        { id: "lower", label: `${b.exit}-day low`, color: "#d8534f", values: ch.lower },
      ] };
      break;
    }
    case "dip": {
      const d = config.dip ?? DEFAULTS.dip;
      base = { overlay: [
        { id: "long", label: `Trend MA (${d.long})`, color: "#3b6fb0", values: sma(prices, d.long) },
        { id: "short", label: `Dip MA (${d.short})`, color: "#ff6b35", values: sma(prices, d.short) },
      ] };
      break;
    }
    default:
      base = { overlay: [] };
  }

  // Show the risk trend-filter line too, if enabled.
  const tf = config.risk?.trendFilter ?? 0;
  if (tf > 0) {
    base.overlay.push({ id: "trend", label: `Trend filter (${tf})`, color: "#888780", values: sma(prices, tf) });
  }
  return base;
}
