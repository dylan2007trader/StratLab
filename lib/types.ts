// Core domain types for StratLab's backtest engine.

export interface Bar {
  t: string;  // ISO date YYYY-MM-DD
  c: number;  // adjusted close
  o?: number; // adjusted open — used for realistic next-bar fills (optional for back-compat)
}

export type StrategyId = "ma" | "rsi" | "macd" | "bollinger" | "breakout" | "dip";

export interface MaParams { fast: number; slow: number; }
export interface RsiParams { period: number; oversold: number; overbought: number; }
export interface MacdParams { fast: number; slow: number; signal: number; }
export interface BollingerParams { period: number; k: number; }
export interface BreakoutParams { entry: number; exit: number; }
export interface DipParams { long: number; short: number; }

/** Risk + sizing controls shared by every strategy. Together with each
 *  strategy's own params, this gives every bot 6+ tunable parameters. */
export interface RiskParams {
  /** sell if price falls this % below entry (0 = off) */
  stopLoss: number;
  /** sell if price rises this % above entry (0 = off) */
  takeProfit: number;
  /** fraction of available cash committed per trade (0.05–1) */
  positionSize: number;
  /** only enter while price is above this SMA (0 = off) */
  trendFilter: number;
}

/** Execution realism — what makes a backtest reflect live trading, so a winning
 *  bot is actually deployable. Applied identically in backtests and paper. */
export interface RealismParams {
  /** price impact + spread paid on every fill, in basis points (1bp = 0.01%) */
  slippageBps: number;
  /** flat commission charged per trade, in dollars */
  commission: number;
  /** when orders fill: "nextOpen" = next bar's open (no look-ahead, realistic);
   *  "close" = same-bar close (legacy, optimistic) */
  fillTiming: "nextOpen" | "close";
  /** "whole" = integer shares only (leftover stays cash); "fractional" = exact $ */
  shares: "whole" | "fractional";
}

/** Honest defaults for a deployable bot: ~5bps slippage, $0 commission,
 *  next-bar-open fills, whole shares. */
export const DEFAULT_REALISM: RealismParams = {
  slippageBps: 5, commission: 0, fillTiming: "nextOpen", shares: "whole",
};

/** Frictionless model — reproduces the original same-bar, costless behaviour.
 *  Used only when no realism is supplied (keeps legacy callers/tests identical). */
export const FRICTIONLESS: RealismParams = {
  slippageBps: 0, commission: 0, fillTiming: "close", shares: "fractional",
};

export const DEFAULTS = {
  ma: { fast: 10, slow: 40 } as MaParams,
  rsi: { period: 14, oversold: 30, overbought: 70 } as RsiParams,
  macd: { fast: 12, slow: 26, signal: 9 } as MacdParams,
  bollinger: { period: 20, k: 2 } as BollingerParams,
  breakout: { entry: 20, exit: 10 } as BreakoutParams,
  dip: { long: 100, short: 20 } as DipParams,
  risk: { stopLoss: 0, takeProfit: 0, positionSize: 1, trendFilter: 0 } as RiskParams,
};

// ---- Custom strategies (the Strategy Builder) -------------------------------
// Users compose entry/exit rules from indicator + comparator + operand blocks.
// A composed strategy is just a signal with tunable numbers, so the whole
// training engine optimises it unchanged.

export type Comparator = "lt" | "gt" | "crossesAbove" | "crossesBelow";
export type IndicatorKind = "price" | "sma" | "rsi" | "const";
export interface IndicatorRef {
  kind: IndicatorKind;
  period?: number; // for sma / rsi
  value?: number;  // for const
}
export interface Condition { left: IndicatorRef; op: Comparator; right: IndicatorRef; }
export interface ConditionGroup { logic: "AND" | "OR"; conds: Condition[]; }
export interface CustomStrategy { entry: ConditionGroup; exit: ConditionGroup; }

/** What the bot optimises for — lets users express their risk philosophy. */
export type ObjectiveId = "return" | "calmar" | "cappedDD" | "winRate";

/** Safety rails for real-money deployment (guidance for the user's executor). */
export interface RiskControls {
  /** halt the bot if total drawdown exceeds this % */
  maxDrawdownStop: number;
  /** never commit more than this % of the account to one position */
  maxPositionPct: number;
  /** stop trading for the day after this % account loss */
  dailyLossLimit: number;
  /** leverage cap (1 = cash only, no margin) */
  maxLeverage: number;
}

export const DEFAULT_CONTROLS: RiskControls = {
  maxDrawdownStop: 25, maxPositionPct: 100, dailyLossLimit: 5, maxLeverage: 1,
};

/** An optional second strategy layered on top of the primary one as a
 *  confirming filter: the bot may only enter when BOTH the primary strategy AND
 *  the fusion strategy want to be in. Training can "fuse" a new strategy onto a
 *  bot and tune its parameter too. `param` is the fusion strategy's single
 *  headline knob (interpreted per strategy in baseSignal). */
export interface FusionParams {
  strategy: StrategyId;
  param: number;
}

export interface BotConfig {
  name: string;
  symbol: string;
  capital: number;
  strategy: StrategyId;
  ma: MaParams;
  rsi: RsiParams;
  macd?: MacdParams;
  bollinger?: BollingerParams;
  breakout?: BreakoutParams;
  dip?: DipParams;
  risk?: RiskParams;
  /** optional confirming second strategy added by "strategy fusion" training */
  fusion?: FusionParams | null;
  /** execution realism (costs, fills, share model); defaults applied if absent */
  realism?: RealismParams;
  /** a user-composed strategy; when present it overrides `strategy` for signals */
  custom?: CustomStrategy | null;
  /** what training optimises toward (default "calmar") */
  objective?: ObjectiveId;
  /** real-money safety rails (used when exporting to a broker) */
  controls?: RiskControls;
}

export interface TradeMark {
  i: number;
  type: "buy" | "sell";
  /** why the sell happened (for teaching) */
  reason?: "signal" | "stop" | "target";
}

export interface BacktestRun {
  equity: number[];
  trades: number[];
  marks: TradeMark[];
  /** still holding a position at the end? */
  holding: boolean;
}

export interface Stats {
  totalReturn: number;
  maxDrawdown: number;
  tradeCount: number;
  winRate: number | null;
  expectancy: number | null;
}

export interface BacktestResult {
  prices: number[];
  dates: string[];
  splitIndex: number;
  equity: number[];
  buyHold: number[];
  marks: TradeMark[];
  overall: Stats;
  outOfSample: Stats;
  buyHoldReturn: number;
  buyHoldOosReturn: number;
}
