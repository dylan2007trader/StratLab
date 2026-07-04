// Broker bridge: turn a trained bot into a portable, broker-agnostic strategy
// spec plus plain-English deploy instructions. Claude never trades — this hands
// the user everything they need to run the bot themselves, paper first.

import { BotConfig, RiskControls, DEFAULT_CONTROLS } from "./types";
import { SavedBot } from "./storage";
import { describeConfig } from "./bot";
import { describeCustom } from "./custom";

export type BrokerId = "alpaca" | "ibkr" | "generic";
export const BROKERS: { id: BrokerId; name: string }[] = [
  { id: "alpaca", name: "Alpaca" },
  { id: "ibkr", name: "Interactive Brokers" },
  { id: "generic", name: "Other / generic" },
];

const pct = (n: number) => `${n}%`;

/** Plain-English description of exactly what the bot does. */
export function humanRules(c: BotConfig): string[] {
  const lines: string[] = [];
  if (c.custom) lines.push(describeCustom(c.custom));
  else lines.push(`Strategy: ${describeConfig(c)}`);
  const r = c.risk;
  if (r) {
    lines.push(`Position size: ${Math.round((r.positionSize ?? 1) * 100)}% of available cash per trade`);
    if (r.stopLoss) lines.push(`Stop-loss: exit at -${r.stopLoss}%`);
    if (r.takeProfit) lines.push(`Take-profit: exit at +${r.takeProfit}%`);
    if (r.trendFilter) lines.push(`Trend filter: only buy while price is above its ${r.trendFilter}-day average`);
  }
  if (c.realism) lines.push(`Assumed fills: ${c.realism.fillTiming === "nextOpen" ? "next bar's open" : "same-bar close"}, ${c.realism.shares} shares, ~${c.realism.slippageBps}bps slippage, $${c.realism.commission}/trade`);
  return lines;
}

/** A portable, broker-agnostic strategy spec (downloadable JSON). */
export function exportSpec(bot: SavedBot): Record<string, unknown> {
  const c = bot.config;
  const controls = c.controls ?? DEFAULT_CONTROLS;
  return {
    schema: "stratlab.bot.v1",
    exportedAt: new Date().toISOString(),
    name: bot.name,
    symbol: bot.symbol,
    timeframe: "1Day",
    level: bot.level,
    type: c.custom ? "custom" : "template",
    strategy: c.custom ? { kind: "custom", custom: c.custom } : { kind: c.strategy, params: strategyParams(c) },
    objective: c.objective ?? "calmar",
    risk: c.risk,
    realism: c.realism,
    riskControls: controls,
    humanRules: humanRules(c),
    backtest: bot.best
      ? { outOfSampleReturn: bot.best.oosReturn, totalReturn: bot.best.totalReturn, maxDrawdown: bot.best.maxDrawdown, trades: bot.best.trades }
      : null,
    generalize: bot.lastTraining?.generalize ?? null,
    disclaimer: "Past backtested performance does not predict future results. Trade paper first. This is not financial advice.",
  };
}

function strategyParams(c: BotConfig): Record<string, unknown> {
  switch (c.strategy) {
    case "ma": return c.ma;
    case "rsi": return c.rsi;
    case "macd": return c.macd ?? {};
    case "bollinger": return c.bollinger ?? {};
    case "breakout": return c.breakout ?? {};
    case "dip": return c.dip ?? {};
    default: return {};
  }
}

/** Step-by-step, broker-specific deployment guidance (markdown-ish text). */
export function deployInstructions(bot: SavedBot, broker: BrokerId): string {
  const c = bot.config;
  const ctrl = c.controls ?? DEFAULT_CONTROLS;
  const rules = humanRules(c).map((l) => `   - ${l}`).join("\n");
  const brokerName = BROKERS.find((b) => b.id === broker)?.name ?? "your broker";

  const acct =
    broker === "alpaca"
      ? "1. **Open an Alpaca account** at alpaca.markets and create API keys. Start with the **paper** (fake-money) endpoint `https://paper-api.alpaca.markets` — Alpaca is commission-free and supports fractional or whole shares."
      : broker === "ibkr"
      ? "1. **Open an Interactive Brokers account** and enable the API (TWS or IB Gateway). Use a **paper trading** account first. Note IBKR charges commissions — keep your slippage/fee assumptions realistic."
      : "1. **Pick a broker with an API** (Alpaca, IBKR, Tradier, etc.) and create credentials. Use the broker's **paper / demo** mode first.";

  return `# Deploy "${bot.name}" to ${brokerName}

> ⚠️ Trade **paper (fake money) first** for several weeks. Only consider real money once it performs forward on data it never trained on. This is not financial advice; past performance does not predict the future.

${acct}

2. **Implement the bot's rules.** Each trading day, after the close, evaluate on daily bars:
${rules}
   Submit the resulting buy/sell **at the next session's open** (that's how it was backtested).

3. **Size positions and set safety rails:**
   - Max per position: **${pct(ctrl.maxPositionPct)}** of the account
   - Stop the bot if total drawdown exceeds **${pct(ctrl.maxDrawdownStop)}**
   - Halt for the day after a **${pct(ctrl.dailyLossLimit)}** account loss
   - Leverage: **${ctrl.maxLeverage}x**${ctrl.maxLeverage === 1 ? " (cash only — no margin)" : ""}

4. **Automate it** with a daily scheduled job (a small script hitting ${brokerName}'s API, or a no-code tool). Run it once per day after the market closes.

5. **Monitor and keep a kill switch.** Check fills daily; if behaviour diverges from the backtest, pause and re-paper. Markets drift — retrain the bot here periodically and re-export.

6. **Start tiny.** Deploy with an amount you can afford to lose while you build confidence.

— Generated from StratLab. Download the JSON spec to keep the exact parameters.`;
}
