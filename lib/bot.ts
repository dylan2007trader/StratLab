import { BotConfig, StrategyId, DEFAULTS, DEFAULT_REALISM, DEFAULT_CONTROLS } from "./types";
import { describeCustom } from "./custom";

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  ma: "Trend follower",
  rsi: "Dip buyer (RSI)",
  macd: "MACD trend",
  bollinger: "Band reversion",
  breakout: "Breakout",
  dip: "Buy the dip",
};

/** One-line description of a config's headline settings. */
export function describeConfig(c: BotConfig): string {
  if (c.custom) return describeCustom(c.custom);
  switch (c.strategy) {
    case "ma": return `MA ${c.ma.fast}/${c.ma.slow}`;
    case "rsi": return `RSI ${c.rsi.period} (${c.rsi.oversold}/${c.rsi.overbought})`;
    case "macd": { const m = c.macd ?? DEFAULTS.macd; return `MACD ${m.fast}/${m.slow}/${m.signal}`; }
    case "bollinger": { const b = c.bollinger ?? DEFAULTS.bollinger; return `Bands ${b.period}, ${b.k}σ`; }
    case "breakout": { const b = c.breakout ?? DEFAULTS.breakout; return `Breakout ${b.entry}/${b.exit}`; }
    case "dip": { const d = c.dip ?? DEFAULTS.dip; return `Dip ${d.short}/${d.long}`; }
    default: return "";
  }
}

export interface ParamItem {
  key: string;
  label: string;
  value: string;
  /** plain-language meaning, for tooltips */
  help: string;
}

const fmtPct = (n: number) => (n ? `${n}%` : "off");

/** Full labeled parameter list for a config — used by the Settings view and to
 *  diff what training changed. Always 6+ entries (strategy params + risk). */
export function paramList(c: BotConfig): ParamItem[] {
  const out: ParamItem[] = [];
  switch (c.strategy) {
    case "ma":
      out.push(
        { key: "fast", label: "Fast MA", value: `${c.ma.fast}`, help: "Short-term average. Smaller reacts faster and trades more." },
        { key: "slow", label: "Slow MA", value: `${c.ma.slow}`, help: "Long-term average. The trend line the fast MA crosses." }
      );
      break;
    case "rsi":
      out.push(
        { key: "period", label: "RSI period", value: `${c.rsi.period}`, help: "Lookback for the momentum gauge." },
        { key: "oversold", label: "Buy below", value: `${c.rsi.oversold}`, help: "RSI level considered 'oversold' — a dip to buy." },
        { key: "overbought", label: "Sell above", value: `${c.rsi.overbought}`, help: "RSI level considered 'overbought' — time to exit." }
      );
      break;
    case "macd": {
      const m = c.macd ?? DEFAULTS.macd;
      out.push(
        { key: "mfast", label: "Fast EMA", value: `${m.fast}`, help: "Faster of the two trend lines." },
        { key: "mslow", label: "Slow EMA", value: `${m.slow}`, help: "Slower trend line." },
        { key: "msignal", label: "Signal", value: `${m.signal}`, help: "Smoothing of the MACD line that triggers trades." }
      );
      break;
    }
    case "bollinger": {
      const b = c.bollinger ?? DEFAULTS.bollinger;
      out.push(
        { key: "bperiod", label: "Period", value: `${b.period}`, help: "Window for the average and the bands." },
        { key: "bk", label: "Band width", value: `${b.k}σ`, help: "How many standard deviations wide the bands are." }
      );
      break;
    }
    case "breakout": {
      const b = c.breakout ?? DEFAULTS.breakout;
      out.push(
        { key: "bentry", label: "Breakout window", value: `${b.entry}d`, help: "Buys when price tops the highest high of this many days." },
        { key: "bexit", label: "Exit window", value: `${b.exit}d`, help: "Exits when price drops below the lowest low of this many days." }
      );
      break;
    }
    case "dip": {
      const d = c.dip ?? DEFAULTS.dip;
      out.push(
        { key: "dlong", label: "Trend MA", value: `${d.long}`, help: "Only buys while price is above this long average (uptrend)." },
        { key: "dshort", label: "Dip MA", value: `${d.short}`, help: "Buys pullbacks below this short average." }
      );
      break;
    }
  }
  const r = c.risk ?? DEFAULTS.risk;
  out.push(
    { key: "trendFilter", label: "Trend filter", value: r.trendFilter ? `${r.trendFilter}d` : "off", help: "Skips trades unless price is above this long average — avoids buying downtrends." },
    { key: "stopLoss", label: "Stop-loss", value: fmtPct(r.stopLoss), help: "Cuts a losing trade once it falls this far below entry." },
    { key: "takeProfit", label: "Take-profit", value: fmtPct(r.takeProfit), help: "Locks in a winner once it rises this far above entry." },
    { key: "positionSize", label: "Trade size", value: `${Math.round((r.positionSize ?? 1) * 100)}%`, help: "How much of available cash it commits per trade." }
  );
  return out;
}

export interface AvatarColor { id: string; label: string; hex: string; soft: string; deep: string; }
export const AVATAR_COLORS: AvatarColor[] = [
  { id: "purple", label: "Purple", hex: "#7F77DD", soft: "#EEEDFE", deep: "#26215C" },
  { id: "teal", label: "Teal", hex: "#1D9E75", soft: "#E1F5EE", deep: "#04342C" },
  { id: "coral", label: "Coral", hex: "#D85A30", soft: "#FAECE7", deep: "#4A1B0C" },
  { id: "blue", label: "Blue", hex: "#378ADD", soft: "#E6F1FB", deep: "#042C53" },
];
export function colorOf(id: string): AvatarColor { return AVATAR_COLORS.find((c) => c.id === id) ?? AVATAR_COLORS[0]; }

export interface BotIdentity { name: string; color: string; symbol: string; eagerness: number; }
export function maFromEagerness(eagerness: number): { fast: number; slow: number } {
  const t = Math.min(100, Math.max(0, eagerness)) / 100;
  return { fast: Math.round(22 - (22 - 5) * t), slow: Math.round(120 - (120 - 25) * t) };
}
export function toConfig(b: BotIdentity, capital = 10000): BotConfig {
  const { fast, slow } = maFromEagerness(b.eagerness);
  return {
    name: b.name || "My Bot", symbol: b.symbol, capital, strategy: "ma",
    ma: { fast, slow }, rsi: { period: 14, oversold: 30, overbought: 70 },
    risk: { stopLoss: 0, takeProfit: 0, positionSize: 1, trendFilter: 0 },
    realism: { ...DEFAULT_REALISM },
    controls: { ...DEFAULT_CONTROLS },
  };
}

/** Diff two configs into a list of changed parameters (for the training reveal). */
export function diffParams(before: BotConfig, after: BotConfig): { label: string; from: string; to: string }[] {
  const a = paramList(before);
  const b = paramList(after);
  const diffs: { label: string; from: string; to: string }[] = [];
  for (let i = 0; i < b.length; i++) {
    const pa = a.find((x) => x.key === b[i].key);
    if (pa && pa.value !== b[i].value) diffs.push({ label: b[i].label, from: pa.value, to: b[i].value });
  }
  return diffs;
}
