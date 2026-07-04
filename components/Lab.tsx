"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TICKERS } from "@/lib/tickers";
import { runBacktest, indicatorsFor } from "@/lib/backtest";
import { Bar, BacktestResult, BotConfig, StrategyId, DEFAULTS, RealismParams, DEFAULT_REALISM, CustomStrategy, ObjectiveId } from "@/lib/types";
import { colorOf } from "@/lib/bot";
import { defaultCustomStrategy } from "@/lib/custom";
import { LabSeed, BotMetrics } from "@/lib/storage";
import ChartPanel, { ChartSeries } from "./ChartPanel";
import StrategyBuilder from "./StrategyBuilder";

const OBJECTIVES: { id: ObjectiveId; label: string }[] = [
  { id: "calmar", label: "Best risk-adjusted (Calmar)" },
  { id: "return", label: "Maximum return" },
  { id: "cappedDD", label: "Cap the drawdown" },
  { id: "winRate", label: "Highest win rate" },
];

const signed = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
const plain = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);

const STRATEGY_OPTIONS: { id: StrategyId; label: string }[] = [
  { id: "ma", label: "Moving-Average Crossover" },
  { id: "rsi", label: "RSI Mean-Reversion" },
  { id: "macd", label: "MACD Trend" },
  { id: "bollinger", label: "Bollinger Band Reversion" },
  { id: "breakout", label: "Breakout (Donchian)" },
  { id: "dip", label: "Buy the Dip" },
];

function insightFor(r: BacktestResult): { msg: string; tone: string } {
  const o = r.overall;
  if (o.tradeCount === 0)
    return { msg: "Your bot never traded with these settings — it stayed in cash the whole time. Try loosening the rules.", tone: "warn" };
  if ((o.winRate ?? 0) > 0.55 && (o.expectancy ?? 0) <= 0)
    return { msg: "Win rate looks great, but you lost money. Your losing trades were bigger than your winners — proof that win rate isn't profit. Look at \"Avg / trade.\"", tone: "warn" };
  if (r.outOfSample.totalReturn < r.buyHoldOosReturn - 0.05 && o.totalReturn > r.buyHoldReturn)
    return { msg: "Careful — possible overfitting. Your bot beat buy & hold overall, but in the shaded unseen window it underperformed. It may have just memorized the past.", tone: "warn" };
  if (o.totalReturn > r.buyHoldReturn)
    return { msg: "Nice — your bot beat buy & hold on this stock. Stress-test it: drag the split, or try another stock, and see if it holds up.", tone: "good" };
  return { msg: "Buy & hold beat your bot here. That's the norm — most strategies don't beat simply holding. Tweak and keep experimenting.", tone: "" };
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <>
      <label className="block text-[13px] font-semibold mt-3 mb-1">{label} <span className="float-right font-bold text-brand">{value}</span></label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-brand" />
    </>
  );
}

export default function Lab({ seed, onHome, onSave }: { seed?: LabSeed | null; onHome: () => void; onSave: (p: { id?: string; name: string; color: string; symbol: string; config: BotConfig; metrics: BotMetrics }) => void }) {
  const sc = seed?.config;
  const [name, setName] = useState(seed?.name || "My First Bot");
  const [symbol, setSymbol] = useState(seed?.symbol || "AAPL");
  const [strategy, setStrategy] = useState<StrategyId>(sc?.strategy || "ma");
  const [capital, setCapital] = useState(sc?.capital ?? 10000);
  const [isCustom, setIsCustom] = useState(!!sc?.custom);
  const [custom, setCustom] = useState<CustomStrategy>(sc?.custom ?? defaultCustomStrategy());
  const [objective, setObjective] = useState<ObjectiveId>(sc?.objective ?? "calmar");

  const [fast, setFast] = useState(sc?.ma.fast ?? DEFAULTS.ma.fast);
  const [slow, setSlow] = useState(sc?.ma.slow ?? DEFAULTS.ma.slow);
  const [period, setPeriod] = useState(sc?.rsi.period ?? DEFAULTS.rsi.period);
  const [oversold, setOversold] = useState(sc?.rsi.oversold ?? DEFAULTS.rsi.oversold);
  const [overbought, setOverbought] = useState(sc?.rsi.overbought ?? DEFAULTS.rsi.overbought);
  const [macdF, setMacdF] = useState(sc?.macd?.fast ?? DEFAULTS.macd.fast);
  const [macdS, setMacdS] = useState(sc?.macd?.slow ?? DEFAULTS.macd.slow);
  const [macdSig, setMacdSig] = useState(sc?.macd?.signal ?? DEFAULTS.macd.signal);
  const [bbPeriod, setBbPeriod] = useState(sc?.bollinger?.period ?? DEFAULTS.bollinger.period);
  const [bbK, setBbK] = useState(sc?.bollinger?.k ?? DEFAULTS.bollinger.k);
  const [brEntry, setBrEntry] = useState(sc?.breakout?.entry ?? DEFAULTS.breakout.entry);
  const [brExit, setBrExit] = useState(sc?.breakout?.exit ?? DEFAULTS.breakout.exit);
  const [dipLong, setDipLong] = useState(sc?.dip?.long ?? DEFAULTS.dip.long);
  const [dipShort, setDipShort] = useState(sc?.dip?.short ?? DEFAULTS.dip.short);
  const [stopLoss, setStopLoss] = useState(sc?.risk?.stopLoss ?? DEFAULTS.risk.stopLoss);
  const [takeProfit, setTakeProfit] = useState(sc?.risk?.takeProfit ?? DEFAULTS.risk.takeProfit);
  const [positionSize, setPositionSize] = useState(sc?.risk?.positionSize ?? DEFAULTS.risk.positionSize);
  const [trendFilter, setTrendFilter] = useState(sc?.risk?.trendFilter ?? DEFAULTS.risk.trendFilter);
  const [showRisk, setShowRisk] = useState(false);

  // execution realism (Advanced panel)
  const [slippageBps, setSlippageBps] = useState(sc?.realism?.slippageBps ?? DEFAULT_REALISM.slippageBps);
  const [commission, setCommission] = useState(sc?.realism?.commission ?? DEFAULT_REALISM.commission);
  const [fillTiming, setFillTiming] = useState<RealismParams["fillTiming"]>(sc?.realism?.fillTiming ?? DEFAULT_REALISM.fillTiming);
  const [shareModel, setShareModel] = useState<RealismParams["shares"]>(sc?.realism?.shares ?? DEFAULT_REALISM.shares);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [ranConfig, setRanConfig] = useState<BotConfig | null>(null);
  const [splitFraction, setSplitFraction] = useState(0.7);
  const [showDetail, setShowDetail] = useState(false);
  const [saved, setSaved] = useState(false);

  const color = seed?.color || "coral";
  const accent = colorOf(color).hex;

  function currentConfig(): BotConfig {
    return {
      name,
      symbol,
      capital,
      strategy,
      ma: { fast, slow },
      rsi: { period, oversold, overbought },
      macd: { fast: macdF, slow: macdS, signal: macdSig },
      bollinger: { period: bbPeriod, k: bbK },
      breakout: { entry: brEntry, exit: brExit },
      dip: { long: dipLong, short: dipShort },
      risk: { stopLoss, takeProfit, positionSize, trendFilter },
      realism: { slippageBps, commission, fillTiming, shares: shareModel },
      custom: isCustom ? custom : null,
      objective,
    };
  }

  async function run() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/bars?symbol=${symbol}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch data");
      setBars(data.bars as Bar[]);
      setRanConfig(currentConfig());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBars(null);
      setRanConfig(null);
    } finally {
      setLoading(false);
    }
  }

  const didAuto = useRef(false);
  useEffect(() => {
    if (seed?.config && !didAuto.current) {
      didAuto.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = useMemo<BacktestResult | null>(() => {
    if (!bars || !ranConfig) return null;
    return runBacktest(ranConfig, bars, splitFraction);
  }, [bars, ranConfig, splitFraction]);

  const indicators = useMemo(() => (result && ranConfig ? indicatorsFor(ranConfig, result.prices) : null), [result, ranConfig]);

  const priceSeries = useMemo<ChartSeries[]>(() => {
    if (!result || !indicators) return [];
    return [
      { id: "price", color: "#9aa6b2", lineWidth: 2, values: result.prices },
      ...indicators.overlay.map((o) => ({ id: o.id, color: o.color, lineWidth: 2, values: o.values })),
    ];
  }, [result, indicators]);

  const paneSeries = useMemo<ChartSeries[]>(() => {
    if (!indicators?.pane) return [];
    return indicators.pane.series.map((s) => ({ id: s.id, color: s.color, lineWidth: 2, values: s.values }));
  }, [indicators]);

  const equitySeries = useMemo<ChartSeries[]>(() => {
    if (!result) return [];
    return [
      { id: "bh", color: "#3b6fb0", lineWidth: 2, values: result.buyHold },
      { id: "bot", color: accent, lineWidth: 2, values: result.equity },
    ];
  }, [result, accent]);

  const insight = result ? insightFor(result) : null;
  const inStart = result?.dates[0];
  const inEnd = result ? result.dates[result.splitIndex - 1] : undefined;
  const outStart = result ? result.dates[result.splitIndex] : undefined;
  const outEnd = result ? result.dates[result.dates.length - 1] : undefined;

  function handleSave() {
    if (!result || !ranConfig) return;
    onSave({
      id: seed?.id,
      name,
      color,
      symbol,
      config: ranConfig,
      metrics: {
        totalReturn: result.overall.totalReturn,
        oosReturn: result.outOfSample.totalReturn,
        maxDrawdown: result.overall.maxDrawdown,
        trades: result.overall.tradeCount,
      },
    });
    setSaved(true);
  }

  return (
    <main className="max-w-5xl mx-auto my-6 bg-white rounded-2xl overflow-hidden shadow-xl">
      <header className="bg-dark text-white px-7 py-4 flex justify-between items-center flex-wrap gap-2">
        <button onClick={onHome} className="text-[13px] opacity-80 hover:opacity-100">← My bots</button>
        <div className="font-extrabold text-lg">Strat<span className="text-brand">Lab</span> <span className="text-[12px] font-normal opacity-70">· lab</span></div>
        <button onClick={handleSave} disabled={!result} className="text-[13px] font-bold rounded-lg px-3.5 py-1.5 disabled:opacity-40" style={{ background: accent, color: "#fff" }}>
          {saved ? "✓ Saved" : "Save to roster"}
        </button>
      </header>

      <div className="grid md:grid-cols-[300px_1fr]">
        <div className="p-5 bg-soft border-b md:border-b-0 md:border-r border-line">
          <h2 className="text-xs uppercase tracking-wide text-muted font-semibold mb-3">Build your bot</h2>

          <label className="block text-[13px] font-semibold mt-3 mb-1">Bot name</label>
          <input className="w-full border border-line rounded-lg p-2 text-sm" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />

          <label className="block text-[13px] font-semibold mt-3 mb-1">Stock</label>
          <select className="w-full border border-line rounded-lg p-2 text-sm bg-white" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {TICKERS.map((t) => (<option key={t.symbol} value={t.symbol}>{t.name} ({t.symbol})</option>))}
          </select>

          <div className="flex gap-1 mt-3 mb-1 text-[12px] font-semibold">
            <button onClick={() => setIsCustom(false)} className={`flex-1 rounded-lg py-1.5 border ${!isCustom ? "text-white" : "text-muted"}`} style={!isCustom ? { background: accent, borderColor: accent } : { borderColor: "#e7e9ee" }}>Template</button>
            <button onClick={() => setIsCustom(true)} className={`flex-1 rounded-lg py-1.5 border ${isCustom ? "text-white" : "text-muted"}`} style={isCustom ? { background: accent, borderColor: accent } : { borderColor: "#e7e9ee" }}>🧪 Build your own</button>
          </div>

          {!isCustom && (<>
          <label className="block text-[13px] font-semibold mt-3 mb-1">Strategy</label>
          <select className="w-full border border-line rounded-lg p-2 text-sm bg-white" value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}>
            {STRATEGY_OPTIONS.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
          </select>

          {strategy === "ma" && (
            <div>
              <Slider label="Fast MA" value={fast} min={3} max={50} onChange={setFast} />
              <Slider label="Slow MA" value={slow} min={20} max={200} onChange={setSlow} />
              <p className="text-[11px] text-muted mt-1.5">Buy when the fast line crosses above the slow line; sell when it crosses below.</p>
            </div>
          )}
          {strategy === "rsi" && (
            <div>
              <Slider label="RSI period" value={period} min={5} max={30} onChange={setPeriod} />
              <Slider label="Buy below" value={oversold} min={10} max={45} onChange={setOversold} />
              <Slider label="Sell above" value={overbought} min={55} max={90} onChange={setOverbought} />
              <p className="text-[11px] text-muted mt-1.5">Buy when &quot;oversold,&quot; sell when &quot;overbought.&quot;</p>
            </div>
          )}
          {strategy === "macd" && (
            <div>
              <Slider label="Fast EMA" value={macdF} min={4} max={20} onChange={setMacdF} />
              <Slider label="Slow EMA" value={macdS} min={15} max={40} onChange={setMacdS} />
              <Slider label="Signal" value={macdSig} min={4} max={15} onChange={setMacdSig} />
              <p className="text-[11px] text-muted mt-1.5">Hold while the MACD line is above its signal line.</p>
            </div>
          )}
          {strategy === "bollinger" && (
            <div>
              <Slider label="Period" value={bbPeriod} min={8} max={40} onChange={setBbPeriod} />
              <Slider label="Band width (σ)" value={bbK} min={1} max={3.5} step={0.5} onChange={setBbK} />
              <p className="text-[11px] text-muted mt-1.5">Buy below the lower band; sell above the upper band.</p>
            </div>
          )}
          {strategy === "breakout" && (
            <div>
              <Slider label="Breakout window" value={brEntry} min={10} max={60} onChange={setBrEntry} />
              <Slider label="Exit window" value={brExit} min={5} max={30} onChange={setBrExit} />
              <p className="text-[11px] text-muted mt-1.5">Buy on a new N-day high; exit on a new M-day low.</p>
            </div>
          )}
          {strategy === "dip" && (
            <div>
              <Slider label="Trend MA (long)" value={dipLong} min={40} max={200} onChange={setDipLong} />
              <Slider label="Dip MA (short)" value={dipShort} min={5} max={40} onChange={setDipShort} />
              <p className="text-[11px] text-muted mt-1.5">Only while above the long MA, buy dips below the short MA.</p>
            </div>
          )}
          </>)}

          {isCustom && (
            <div className="mt-3">
              <label className="block text-[13px] font-semibold mb-1">Build your strategy</label>
              <StrategyBuilder value={custom} onChange={setCustom} accent={accent} />
            </div>
          )}

          <label className="block text-[13px] font-semibold mt-3 mb-1">Optimize for</label>
          <select className="w-full border border-line rounded-lg p-2 text-sm bg-white" value={objective} onChange={(e) => setObjective(e.target.value as ObjectiveId)}>
            {OBJECTIVES.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
          </select>
          <p className="text-[10.5px] text-muted mt-1">What training treats as &quot;better&quot; — your risk philosophy.</p>

          <button onClick={() => setShowRisk((s) => !s)} className="mt-3 text-[12px] text-muted underline">{showRisk ? "Hide" : "Show"} risk &amp; sizing</button>
          {showRisk && (
            <div className="mt-1 border border-line rounded-lg p-2.5 bg-white">
              <Slider label="Stop-loss %" value={stopLoss} min={0} max={25} onChange={setStopLoss} />
              <Slider label="Take-profit %" value={takeProfit} min={0} max={60} step={5} onChange={setTakeProfit} />
              <Slider label="Trade size %" value={Math.round(positionSize * 100)} min={25} max={100} step={5} onChange={(v) => setPositionSize(v / 100)} />
              <Slider label="Trend filter (days)" value={trendFilter} min={0} max={200} step={10} onChange={setTrendFilter} />
              <p className="text-[11px] text-muted mt-1.5">0 turns off stop-loss, take-profit, or the trend filter. These are the extra dials training tunes.</p>
            </div>
          )}

          <button onClick={() => setShowAdvanced((s) => !s)} className="mt-3 block text-[12px] text-muted underline">{showAdvanced ? "Hide" : "Show"} advanced — execution realism</button>
          {showAdvanced && (
            <div className="mt-1 border border-line rounded-lg p-2.5 bg-white">
              <p className="text-[11px] text-muted mb-2">Make the backtest reflect <b>real</b> trading, so a winning bot is actually deployable.</p>
              <Slider label="Slippage (bps)" value={slippageBps} min={0} max={25} onChange={setSlippageBps} />
              <p className="text-[10.5px] text-muted -mt-1 mb-1">The small cost on every fill (spread + price impact). 5 ≈ realistic for liquid stocks.</p>
              <label className="block text-[13px] font-semibold mt-2 mb-1">Commission ($/trade) <span className="float-right font-bold text-brand">${commission}</span></label>
              <input type="number" min={0} step={0.5} value={commission} onChange={(e) => setCommission(Math.max(0, +e.target.value))} className="w-full border border-line rounded-lg p-1.5 text-sm" />
              <label className="block text-[13px] font-semibold mt-2 mb-1">Fill timing</label>
              <select value={fillTiming} onChange={(e) => setFillTiming(e.target.value as RealismParams["fillTiming"])} className="w-full border border-line rounded-lg p-1.5 text-sm bg-white">
                <option value="nextOpen">Next bar&apos;s open (realistic — no look-ahead)</option>
                <option value="close">Same-bar close (optimistic)</option>
              </select>
              <label className="block text-[13px] font-semibold mt-2 mb-1">Shares</label>
              <select value={shareModel} onChange={(e) => setShareModel(e.target.value as RealismParams["shares"])} className="w-full border border-line rounded-lg p-1.5 text-sm bg-white">
                <option value="whole">Whole shares (most brokers)</option>
                <option value="fractional">Fractional (exact dollars)</option>
              </select>
            </div>
          )}

          <label className="block text-[13px] font-semibold mt-3 mb-1">Starting money ($)</label>
          <input type="number" min={100} step={100} value={capital} onChange={(e) => setCapital(+e.target.value)} className="w-full border border-line rounded-lg p-2 text-sm" />

          <button onClick={run} disabled={loading} className="w-full mt-4 bg-brand text-white font-bold rounded-lg py-3 disabled:opacity-60">
            {loading ? "Running…" : "▶ Run backtest"}
          </button>
        </div>

        <div className="p-5">
          {error && <div className="rounded-lg p-3.5 text-sm bg-[#fdecea] border-l-4 border-loss mb-3">{error}</div>}
          {!result && !error && !loading && (
            <div className="rounded-lg p-3.5 text-sm bg-soft border border-line text-muted">Pick your settings on the left and hit <b>Run backtest</b>.</div>
          )}
          {loading && !result && <div className="rounded-lg p-3.5 text-sm bg-soft border border-line text-muted">Loading real prices…</div>}

          {result && (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <Kpi label={name || "Your bot"} value={signed(result.overall.totalReturn)} good={result.overall.totalReturn >= 0} big />
                <Kpi label="Buy & hold" value={signed(result.buyHoldReturn)} good={result.buyHoldReturn >= 0} big />
                <Kpi label="Unseen (honest score)" value={signed(result.outOfSample.totalReturn)} good={result.outOfSample.totalReturn >= 0} big />
              </div>

              {insight && (
                <div className={`rounded-lg p-3.5 mt-3 text-sm border-l-4 ${insight.tone === "warn" ? "bg-[#fdecea] border-loss" : insight.tone === "good" ? "bg-[#eaf6f1] border-gain" : "bg-[#fff7f2] border-brand"}`}>
                  {insight.msg}
                </div>
              )}

              <div className="mt-4">
                <div className="text-[13px] font-bold mb-1">Your money over time</div>
                <div className="text-[11px] text-muted mb-2 flex flex-wrap gap-x-3">
                  <Legend color={accent} label="Your bot" />
                  <Legend color="#3b6fb0" label="Buy & hold" />
                  <span className="text-[#94a3b8]">▒ unseen →</span>
                </div>
                <ChartPanel dates={result.dates} series={equitySeries} splitIndex={result.splitIndex} height={210} />
              </div>

              <button onClick={() => setShowDetail((s) => !s)} className="mt-3 text-[12.5px] text-muted underline">
                {showDetail ? "Hide details" : "Show details — secondary stats, signals & split"}
              </button>

              {showDetail && (
                <>
                  <div className="grid grid-cols-3 gap-2.5 mt-3">
                    <Kpi label="Max drawdown" value={plain(result.overall.maxDrawdown)} good={false} />
                    <Kpi label="Win rate" value={result.overall.winRate === null ? "—" : `${(result.overall.winRate * 100).toFixed(0)}%`} />
                    <Kpi label="Avg / trade" value={signed(result.overall.expectancy)} good={(result.overall.expectancy ?? 0) >= 0} />
                  </div>

                  <div className="mt-4">
                    <div className="text-[13px] font-bold mb-1">Price &amp; signals — why your bot traded</div>
                    <div className="text-[11px] text-muted mb-2 flex flex-wrap gap-x-3 gap-y-1">
                      <Legend color="#9aa6b2" label={symbol} />
                      {indicators?.overlay.map((o) => (<Legend key={o.id} color={o.color} label={o.label} />))}
                      <Legend color="#1f8a70" label="Buy" />
                      <Legend color="#d8534f" label="Sell" />
                    </div>
                    <ChartPanel dates={result.dates} series={priceSeries} markers={result.marks} splitIndex={result.splitIndex} height={280} />
                  </div>

                  {indicators?.pane && (
                    <div className="mt-3">
                      <div className="text-[12px] font-semibold mb-1 text-muted">{indicators.pane.label}</div>
                      <ChartPanel dates={result.dates} series={paneSeries} guides={indicators.pane.guides} splitIndex={result.splitIndex} height={150} />
                    </div>
                  )}

                  <div className="mt-4 border border-line rounded-xl p-3.5 bg-soft">
                    <div className="flex justify-between items-center">
                      <span className="text-[12px] font-semibold">Where does the “unseen” data start?</span>
                      <span className="text-[12px] font-bold text-brand">{Math.round(splitFraction * 100)}% tested</span>
                    </div>
                    <input type="range" min={0.5} max={0.9} step={0.01} value={splitFraction} onChange={(e) => setSplitFraction(+e.target.value)} className="w-full accent-brand mt-2" />
                    <div className="grid grid-cols-2 gap-2.5 mt-1 text-[11.5px]">
                      <div className="text-muted"><b className="text-ink">Backtest window</b><br />{inStart} → {inEnd}</div>
                      <div className="text-muted"><b className="text-ink">Unseen (out-of-sample)</b><br />{outStart} → {outEnd}</div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Kpi({ label, value, good, big }: { label: string; value: string; good?: boolean; big?: boolean }) {
  const color = good === undefined ? "text-ink" : good ? "text-gain" : "text-loss";
  return (
    <div className="bg-soft border border-line rounded-xl px-3 py-2.5">
      <div className="text-[10.5px] text-muted uppercase tracking-wide font-semibold truncate">{label}</div>
      <div className={`${big ? "text-xl" : "text-lg"} font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
