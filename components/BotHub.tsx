"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BacktestResult } from "@/lib/types";
import { runBacktest, indicatorsFor } from "@/lib/backtest";
import { colorOf, STRATEGY_LABELS, paramList } from "@/lib/bot";
import { SavedBot, LabSeed, upsertBot, xpIntoLevel } from "@/lib/storage";
import { createRun } from "@/lib/trainRun";
import { TrainPlan } from "@/lib/trainPlan";
import { initPaper, advancePaper, paperReturn, daysLive, isHolding } from "@/lib/paper";
import { edgeFreshness, freshnessLabel, potentialPct, daysSinceTrained, needsRefresh, isProven } from "@/lib/progress";
import ChartPanel, { ChartSeries } from "./ChartPanel";
import Mascot from "./Mascot";
import InfoTip from "./InfoTip";
import TrainTestTimeline from "./TrainTestTimeline";
import TrainingSetup from "./TrainingSetup";
import TrainingArena from "./TrainingArena";
import TrainingReport from "./TrainingReport";
import DeployPanel from "./DeployPanel";

const signed = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const plain = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}%`;

type Tab = "overview" | "performance" | "training" | "settings" | "deploy";

async function fetchBars(symbol: string, years = 5): Promise<Bar[]> {
  const res = await fetch(`/api/bars?symbol=${symbol}&years=${years}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't load prices");
  return data.bars as Bar[];
}

export default function BotHub({
  bot,
  setBots,
  onBack,
  onOpenLab,
  initialTab,
}: {
  bot: SavedBot;
  setBots: (b: SavedBot[]) => void;
  onBack: () => void;
  onOpenLab: (seed: LabSeed) => void;
  initialTab?: Tab;
}) {
  const c = colorOf(bot.color);
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // training-run plumbing
  const [setupOpen, setSetupOpen] = useState(false);
  const [trainBars, setTrainBars] = useState<Bar[] | null>(null);
  const [launching, setLaunching] = useState(false);

  const running = !!bot.activeRun && bot.activeRun.status === "running";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await fetchBars(bot.symbol);
        if (!cancelled) setBars(b);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong");
      }
    })();
    return () => { cancelled = true; };
  }, [bot.symbol]);

  // load deep bars to resume an in-progress run
  useEffect(() => {
    if (running && !trainBars && !launching) {
      fetchBars(bot.symbol, bot.activeRun!.plan.years).then(setTrainBars).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, bot.symbol]);

  const result = useMemo<BacktestResult | null>(() => (bars ? runBacktest(bot.config, bars) : null), [bars, bot.config]);
  const indicators = useMemo(() => (result ? indicatorsFor(bot.config, result.prices) : null), [result, bot.config]);

  const priceSeries = useMemo<ChartSeries[]>(() => {
    if (!result || !indicators) return [];
    return [{ id: "price", color: "#9aa6b2", lineWidth: 2, values: result.prices }, ...indicators.overlay.map((o) => ({ id: o.id, color: o.color, lineWidth: 2, values: o.values }))];
  }, [result, indicators]);
  const paneSeries = useMemo<ChartSeries[]>(() => (indicators?.pane ? indicators.pane.series.map((s) => ({ id: s.id, color: s.color, lineWidth: 2, values: s.values })) : []), [indicators]);
  const equitySeries = useMemo<ChartSeries[]>(() => {
    if (!result) return [];
    return [{ id: "bh", color: "#3b6fb0", lineWidth: 2, values: result.buyHold }, { id: "bot", color: c.hex, lineWidth: 2, values: result.equity }];
  }, [result, c.hex]);

  async function launch(plan: TrainPlan) {
    setLaunching(true);
    setError(null);
    setNote(null);
    try {
      const tb = await fetchBars(bot.symbol, plan.years);
      const run = createRun(bot, plan, tb);
      setTrainBars(tb);
      setSetupOpen(false);
      setBots(upsertBot({ ...bot, activeRun: run }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start training");
    } finally {
      setLaunching(false);
    }
  }

  function onTrainingComplete(updated: SavedBot) {
    setTrainBars(null);
    setSetupOpen(false);
    setBots(upsertBot(updated));
    const d = updated.lastTraining;
    setNote(d && d.diffs.length ? `Training found ${d.diffs.length} better setting${d.diffs.length > 1 ? "s" : ""}.` : "Training run complete.");
  }

  function startSetup() {
    setSetupOpen(true);
    setTab("training");
  }

  function deploy() {
    if (!bars) return;
    let paper = initPaper(bot.config, bars);
    paper = advancePaper(paper, bars);
    setBots(upsertBot({ ...bot, paper }));
    setNote("Deployed to paper — see the Performance tab.");
  }

  const splitFrac = 0.7;
  const inStart = result?.dates[0];
  const inEnd = result ? result.dates[result.splitIndex - 1] : undefined;
  const outStart = result ? result.dates[result.splitIndex] : undefined;
  const outEnd = result ? result.dates[result.dates.length - 1] : undefined;

  return (
    <main className="max-w-3xl mx-auto my-6 bg-white rounded-2xl overflow-hidden shadow-xl">
      <header className="text-white px-6 py-4" style={{ background: "#2c3a1e" }}>
        <button onClick={onBack} className="text-[13px] opacity-80 hover:opacity-100">← My bots</button>
        <div className="flex items-center gap-3 mt-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: c.soft }}>
            <Mascot size={36} color={c.hex} soft="#ffffff" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-extrabold">{bot.name}</div>
            <div className="text-[12px] opacity-80">Level {bot.level} · {bot.symbol} · {bot.config.custom ? "Custom strategy" : STRATEGY_LABELS[bot.config.strategy]}</div>
          </div>
          {isProven(bot) && <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "#caa64a", color: "#3a2c08" }}>🏅 Proven</span>}
          {running && <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold" style={{ background: c.hex, color: "#fff" }}>⚡ Training</span>}
          {bot.paper && (
            <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "#0F6E56", color: "#fff" }}>
              Live {signed(paperReturn(bot.paper))}
            </span>
          )}
        </div>
      </header>

      <div className="flex gap-1 px-4 pt-3 border-b border-line text-[13px] overflow-x-auto">
        {(["overview", "performance", "training", "settings", "deploy"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-t-lg capitalize whitespace-nowrap ${tab === t ? "font-bold border-b-2" : "text-muted"}`} style={tab === t ? { borderColor: c.hex, color: c.deep } : {}}>
            {t}{t === "training" && running ? " ●" : ""}
          </button>
        ))}
      </div>

      <div className="p-5">
        {error && <div className="rounded-lg p-3.5 text-sm bg-[#fdecea] border-l-4 border-loss mb-3">{error}</div>}
        {note && <div className="rounded-lg p-2.5 text-[13px] mb-3" style={{ background: c.soft, color: c.deep }}>{note}</div>}

        {tab === "overview" && (
          !result ? <div className="text-sm text-muted">Loading prices…</div> : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="Total" value={signed(result.overall.totalReturn)} good={result.overall.totalReturn >= 0} help="Final value vs. what you started with, over the whole period." />
              <Stat label="Buy & hold" value={signed(result.buyHoldReturn)} good={result.buyHoldReturn >= 0} help="If you'd just bought the stock and held it the whole time. The bar to beat." />
              <Stat label="Unseen" value={signed(result.outOfSample.totalReturn)} good={result.outOfSample.totalReturn >= 0} help="How it did on the most recent data it never trained on. The honest score." />
            </div>

            <div className="mt-5">
              <div className="text-[13px] font-bold mb-2">What it learned from vs. was tested on</div>
              <TrainTestTimeline inStart={inStart} inEnd={inEnd} outStart={outStart} outEnd={outEnd} splitFrac={splitFrac} />
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-5">
              <div className="bg-soft border border-line rounded-xl px-3 py-2.5">
                <div className="text-[10.5px] text-muted uppercase tracking-wide font-semibold flex items-center justify-between">
                  Edge freshness
                  <button onClick={() => setBots(upsertBot({ ...bot, frozen: !bot.frozen }))} className="text-[10px] font-bold normal-case" style={{ color: c.deep }}>
                    {bot.frozen ? "❄ Frozen" : "Freeze"}
                  </button>
                </div>
                <div className="text-base font-bold mt-0.5" style={{ color: c.deep }}>{freshnessLabel(edgeFreshness(bot))} · {Math.round(edgeFreshness(bot) * 100)}%</div>
                <div className="h-1.5 bg-[#eef1f5] rounded-full mt-1"><div className="h-1.5 rounded-full" style={{ width: `${edgeFreshness(bot) * 100}%`, background: c.hex }} /></div>
                <div className="text-[10px] text-muted mt-1">trained {daysSinceTrained(bot)}d ago{bot.frozen ? " · decay paused" : " · markets drift, so retrain to refresh"}</div>
              </div>
              <div className="bg-soft border border-line rounded-xl px-3 py-2.5">
                <div className="text-[10.5px] text-muted uppercase tracking-wide font-semibold">Potential reached</div>
                <div className="text-base font-bold mt-0.5" style={{ color: c.deep }}>{Math.round(potentialPct(bot) * 100)}%</div>
                <div className="h-1.5 bg-[#eef1f5] rounded-full mt-1"><div className="h-1.5 rounded-full" style={{ width: `${potentialPct(bot) * 100}%`, background: c.hex }} /></div>
                <div className="text-[10px] text-muted mt-1">a bot can always get better — you never reach 100%</div>
              </div>
            </div>
            {needsRefresh(bot) && (
              <div className="mt-2 rounded-lg px-3 py-2 text-[12px] flex items-center justify-between" style={{ background: "#fff7f2", color: "#7a3b1a" }}>
                <span>⏳ This bot&apos;s edge has aged — a quick retrain refreshes it.</span>
                <button onClick={startSetup} className="font-bold underline">Retrain</button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-5">
              <button onClick={startSetup} className="text-white font-bold text-[13px] rounded-lg px-4 py-2.5" style={{ background: c.hex }}>
                {running ? "⚡ View training" : "⚡ Train"}
              </button>
              <button onClick={deploy} className="border text-[13px] font-semibold rounded-lg px-4 py-2.5" style={{ borderColor: c.hex, color: c.deep, background: c.soft }}>
                {bot.paper ? "Re-deploy paper" : "🚀 Go live (paper)"}
              </button>
              <button onClick={() => onOpenLab({ id: bot.id, name: bot.name, color: bot.color, symbol: bot.symbol, config: bot.config })} className="border border-line text-[13px] font-semibold rounded-lg px-4 py-2.5">Open in lab</button>
            </div>
          </>
          )
        )}

        {tab === "performance" && (
          !result ? <div className="text-sm text-muted">Loading prices…</div> : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="Max drawdown" value={plain(result.overall.maxDrawdown)} good={false} help="Worst peak-to-bottom drop along the way — the pain you'd have to sit through." />
              <Stat label="Win rate" value={result.overall.winRate === null ? "—" : `${(result.overall.winRate * 100).toFixed(0)}%`} help="Share of trades that made money. A high win rate can still lose if the losers are big." />
              <Stat label="Avg / trade" value={signed(result.overall.expectancy)} good={(result.overall.expectancy ?? 0) >= 0} help="Average % gain per trade (expectancy). Positive means a real edge." />
            </div>

            <div className="mt-4">
              <div className="text-[13px] font-bold mb-1">Money over time (backtest)</div>
              <ChartPanel dates={result.dates} series={equitySeries} splitIndex={result.splitIndex} height={200} />
            </div>
            <div className="mt-4">
              <div className="text-[13px] font-bold mb-1">Price &amp; signals</div>
              <ChartPanel dates={result.dates} series={priceSeries} markers={result.marks} splitIndex={result.splitIndex} height={240} />
            </div>
            {indicators?.pane && (
              <div className="mt-3">
                <div className="text-[12px] font-semibold mb-1 text-muted">{indicators.pane.label}</div>
                <ChartPanel dates={result.dates} series={paneSeries} guides={indicators.pane.guides} splitIndex={result.splitIndex} height={140} />
              </div>
            )}

            {bot.paper && bot.paper.equity.length > 1 && (
              <div className="mt-5">
                <div className="text-[13px] font-bold mb-1">Live forward (paper)</div>
                <div className="text-[12px] text-muted mb-2">{daysLive(bot.paper)}d live · {isHolding(bot.paper) ? "holding" : "in cash"} · forward {signed(paperReturn(bot.paper))}</div>
                <ChartPanel dates={bot.paper.equity.map((e) => e.t)} series={[{ id: "fwd", color: c.hex, lineWidth: 2, values: bot.paper.equity.map((e) => e.v) }]} splitIndex={bot.paper.equity.length} height={150} />
              </div>
            )}
          </>
          )
        )}

        {tab === "training" && (
          <>
            {running ? (
              trainBars ? (
                <TrainingArena bot={bot} bars={trainBars} color={c} onComplete={onTrainingComplete} />
              ) : (
                <div className="rounded-lg p-3.5 text-sm bg-soft border border-line text-muted">Loading {bot.activeRun!.plan.years} years of prices…</div>
              )
            ) : setupOpen ? (
              <TrainingSetup config={bot.config} level={bot.level} color={c} onLaunch={launch} onCancel={() => setSetupOpen(false)} />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-[13px] text-muted">
                    Set up a run: pick which dials to tune, how deep to backtest, and how long to search. It keeps training while you&apos;re away.
                  </p>
                  <button onClick={() => setSetupOpen(true)} disabled={launching} className="shrink-0 text-white font-bold text-[13px] rounded-lg px-4 py-2.5 disabled:opacity-60" style={{ background: c.hex }}>
                    {launching ? "Starting…" : "⚡ New run"}
                  </button>
                </div>

                {bot.lastTraining ? (
                  <TrainingReport last={bot.lastTraining} color={c} />
                ) : (
                  <p className="text-[13px] text-muted">No training runs yet. Start one to watch your bot search the parameter space and see exactly what it learns.</p>
                )}

                <div className="grid grid-cols-2 gap-2.5 mt-4">
                  <Stat label="Trainings" value={`${bot.trainings}`} help="How many times this bot has trained." />
                  <Stat label="Level / XP" value={`Lv ${bot.level} · ${xpIntoLevel(bot.xp)}/100`} help="XP grows when training improves the unseen score across windows." />
                </div>
              </>
            )}
          </>
        )}

        {tab === "settings" && (
          <>
            <p className="text-[13px] text-muted mb-3">Every dial this bot uses. Hover the <span className="font-semibold">i</span> for what each one does.</p>
            <div className="border border-line rounded-xl divide-y divide-line">
              {paramList(bot.config).map((p) => (
                <div key={p.key} className="flex justify-between items-center px-3.5 py-2.5">
                  <span className="text-[13px] text-ink">{p.label}<InfoTip text={p.help} /></span>
                  <span className="text-[13px] font-bold">{p.value}</span>
                </div>
              ))}
              {bot.config.fusion && (
                <div className="flex justify-between items-center px-3.5 py-2.5">
                  <span className="text-[13px] text-ink">Fused strategy<InfoTip text="A second strategy added by training as a confirming filter — the bot only buys when both agree." /></span>
                  <span className="text-[13px] font-bold capitalize">{bot.config.fusion.strategy} ({bot.config.fusion.param})</span>
                </div>
              )}
              <div className="flex justify-between items-center px-3.5 py-2.5">
                <span className="text-[13px] text-ink">Execution<InfoTip text="How fills are modelled so the backtest reflects real trading: slippage, commission, fill timing and share model. Tune these in the lab's Advanced panel." /></span>
                <span className="text-[13px] font-bold">
                  {(bot.config.realism?.slippageBps ?? 5)}bps · ${(bot.config.realism?.commission ?? 0)} · {bot.config.realism?.shares ?? "whole"}
                </span>
              </div>
            </div>
            <button onClick={() => onOpenLab({ id: bot.id, name: bot.name, color: bot.color, symbol: bot.symbol, config: bot.config })} className="mt-4 border border-line text-[13px] font-semibold rounded-lg px-4 py-2.5">Edit in lab</button>
          </>
        )}

        {tab === "deploy" && (
          <DeployPanel bot={bot} color={c} onGoLive={() => { if (bot.paper) setTab("performance"); else deploy(); }} />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, good, help }: { label: string; value: string; good?: boolean; help: string }) {
  const color = good === undefined ? "text-ink" : good ? "text-gain" : "text-loss";
  return (
    <div className="bg-soft border border-line rounded-xl px-3 py-2.5">
      <div className="text-[10.5px] text-muted uppercase tracking-wide font-semibold flex items-center">{label}<InfoTip text={help} /></div>
      <div className={`text-lg font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
