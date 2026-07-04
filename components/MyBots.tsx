"use client";

import { useEffect, useRef, useState } from "react";
import { Bar } from "@/lib/types";
import { colorOf, describeConfig, STRATEGY_LABELS } from "@/lib/bot";
import { SavedBot, loadBots, upsertBot, deleteBot, xpIntoLevel } from "@/lib/storage";
import { runToCompletion } from "@/lib/trainRun";
import { defaultPlan } from "@/lib/trainPlan";
import { initPaper, advancePaper } from "@/lib/paper";
import Mascot from "./Mascot";
import SceneBanner from "./SceneBanner";

const signed = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

function stratLabel(bot: SavedBot): string {
  return bot.config.custom ? `Custom · ${describeConfig(bot.config)}` : `${STRATEGY_LABELS[bot.config.strategy]} · ${describeConfig(bot.config)}`;
}

export default function MyBots({
  bots,
  setBots,
  onOpen,
  onNewBot,
  onOpenLab,
  onCompare,
  onGoLive,
  onOpenBot,
  onTrainBot,
  onLearn,
  onSignOut,
}: {
  bots: SavedBot[];
  setBots: (b: SavedBot[]) => void;
  onOpen: (bot: SavedBot) => void;
  onNewBot: () => void;
  onOpenLab: () => void;
  onCompare: (ids: string[]) => void;
  onGoLive: () => void;
  onOpenBot: (bot: SavedBot) => void;
  onTrainBot: (bot: SavedBot) => void;
  onLearn: () => void;
  onSignOut: () => void;
}) {
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [awayBanner, setAwayBanner] = useState<string | null>(null);
  const [deploying, setDeploying] = useState<string | null>(null);

  async function fetchBars(symbol: string, years = 5): Promise<Bar[]> {
    const res = await fetch(`/api/bars?symbol=${symbol}&years=${years}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't load prices");
    return data.bars as Bar[];
  }

  // Background "while you were away": finish any scheduled bot's run silently.
  const ranCatchUp = useRef(false);
  useEffect(() => {
    if (ranCatchUp.current) return;
    ranCatchUp.current = true;
    (async () => {
      const DAY = 86400000;
      let count = 0;
      for (const b of loadBots()) {
        const due = b.schedule.enabled && (!b.schedule.lastTrained || Date.now() - b.schedule.lastTrained > DAY);
        const hasPaused = b.activeRun && b.activeRun.status === "running";
        if (!due && !hasPaused) continue;
        try {
          const plan = b.activeRun?.plan ?? defaultPlan(b.config.strategy);
          const bars = await fetchBars(b.symbol, plan.years);
          const updated = runToCompletion(b, plan, bars);
          setBots(upsertBot(updated));
          count++;
        } catch { /* skip */ }
      }
      if (count > 0) setAwayBanner(`${count} bot${count > 1 ? "s" : ""} trained while you were away.`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deployBot(bot: SavedBot) {
    if (bot.paper) {
      onGoLive();
      return;
    }
    try {
      setDeploying(bot.id);
      const bars = await fetchBars(bot.symbol);
      let paper = initPaper(bot.config, bars);
      paper = advancePaper(paper, bars);
      setBots(upsertBot({ ...bot, paper }));
      onGoLive();
    } catch (e) {
      setMsg({ id: bot.id, text: e instanceof Error ? e.message : "Couldn't deploy" });
    } finally {
      setDeploying(null);
    }
  }

  function toggleSchedule(bot: SavedBot) {
    setBots(upsertBot({ ...bot, schedule: { ...bot.schedule, enabled: !bot.schedule.enabled } }));
  }
  function remove(bot: SavedBot) {
    if (typeof window !== "undefined" && window.confirm(`Delete ${bot.name}? This can't be undone.`)) {
      setBots(deleteBot(bot.id));
      setSelected((s) => s.filter((id) => id !== bot.id));
    }
  }
  function toggleSelect(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <main className="max-w-4xl mx-auto my-6">
      <SceneBanner title="Your bots" subtitle="Build them, train them, and climb the summit.">
        <button onClick={onNewBot} className="bg-brand text-white font-bold text-[12.5px] rounded-lg px-3 py-1.5 shadow">+ New bot</button>
        <button onClick={onGoLive} className="text-cream text-[12.5px] rounded-lg px-3 py-1.5 border border-white/15" style={{ background: "#0b4a4e" }}>⛰ Summit</button>
        <button onClick={onLearn} className="text-cream text-[12.5px] rounded-lg px-3 py-1.5 border border-white/15" style={{ background: "#0b4a4e" }}>📘 Field guide</button>
        <button onClick={onOpenLab} className="text-cream text-[12.5px] rounded-lg px-3 py-1.5 border border-white/15" style={{ background: "#0b4a4e" }}>Open lab</button>
        <button onClick={onSignOut} className="text-cream text-[12.5px] rounded-lg px-3 py-1.5 border border-white/15" style={{ background: "#0b4a4e" }}>Sign out</button>
      </SceneBanner>

      {awayBanner && (
        <div className="mt-3 bg-[#eaf6f1] border border-gain/30 text-[#0f6e56] rounded-xl px-4 py-2.5 text-[13px] flex justify-between">
          <span>🌙 {awayBanner}</span>
          <button onClick={() => setAwayBanner(null)} className="opacity-60">✕</button>
        </div>
      )}

      {selected.length >= 2 && (
        <div className="mt-3 bg-white border border-line rounded-xl px-4 py-2.5 text-[13px] flex justify-between items-center">
          <span>{selected.length} bots selected</span>
          <button onClick={() => onCompare(selected)} className="bg-ink text-white rounded-lg px-4 py-1.5 font-semibold">Compare →</button>
        </div>
      )}

      {bots.length === 0 ? (
        <div className="mt-6 bg-white border border-line rounded-2xl p-10 text-center">
          <Mascot size={64} />
          <p className="mt-3 font-bold text-[16px]">No bots yet</p>
          <p className="text-[13px] text-muted mt-1">Build your first one — it only takes a minute.</p>
          <button onClick={onNewBot} className="mt-4 bg-brand text-white font-bold rounded-lg px-5 py-2.5">Build a bot</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          {bots.map((bot) => {
            const cc = colorOf(bot.color);
            const running = !!bot.activeRun && bot.activeRun.status === "running";
            return (
              <div key={bot.id} className="bg-white border border-line rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <button onClick={() => onOpenBot(bot)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: cc.soft }}>
                      <Mascot size={36} color={cc.hex} soft="#ffffff" mood={running ? "think" : "happy"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-[15px] truncate">{bot.name}</p>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{ background: cc.soft, color: cc.deep }}>Lv. {bot.level}</span>
                      </div>
                      <p className="text-[11.5px] text-muted truncate">{bot.symbol} · {stratLabel(bot)} · <span style={{ color: cc.hex }}>view ›</span></p>
                    </div>
                  </button>
                  <input type="checkbox" checked={selected.includes(bot.id)} onChange={() => toggleSelect(bot.id)} className="mt-1 accent-ink" aria-label={`Select ${bot.name} to compare`} />
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <Mini label="Total" value={signed(bot.best?.totalReturn)} good={(bot.best?.totalReturn ?? 0) >= 0} />
                  <Mini label="Unseen" value={signed(bot.best?.oosReturn)} good={(bot.best?.oosReturn ?? 0) >= 0} />
                  <Mini label="Trainings" value={`${bot.trainings}`} />
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[10.5px] text-muted mb-1">
                    <span>{running ? "training in progress…" : "XP to next level"}</span><span>{xpIntoLevel(bot.xp)}/100</span>
                  </div>
                  <div className="h-1.5 bg-[#eef1f5] rounded-full">
                    <div className="h-1.5 rounded-full" style={{ width: `${xpIntoLevel(bot.xp)}%`, background: cc.hex }} />
                  </div>
                </div>

                {msg?.id === bot.id && <p className="text-[11.5px] mt-2" style={{ color: cc.deep }}>{msg.text}</p>}

                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => onTrainBot(bot)} className="flex-1 text-white font-bold text-[12.5px] rounded-lg py-2" style={{ background: cc.hex }}>
                    {running ? "⚡ View training" : "⚡ Train"}
                  </button>
                  <button onClick={() => onOpen(bot)} className="flex-1 border border-line text-[12.5px] font-semibold rounded-lg py-2">Open in lab</button>
                  <button onClick={() => remove(bot)} className="text-muted text-[12.5px] px-2 py-2 hover:text-loss" aria-label={`Delete ${bot.name}`}>✕</button>
                </div>

                <button onClick={() => deployBot(bot)} disabled={deploying === bot.id} className="w-full mt-2 border text-[12.5px] font-semibold rounded-lg py-2 disabled:opacity-60" style={{ borderColor: cc.hex, color: cc.deep, background: cc.soft }}>
                  {deploying === bot.id ? "Deploying…" : bot.paper ? "📈 Live — view" : "🚀 Go live (paper)"}
                </button>

                <label className="flex items-center gap-2 mt-2.5 text-[11.5px] text-muted cursor-pointer">
                  <input type="checkbox" checked={bot.schedule.enabled} onChange={() => toggleSchedule(bot)} style={{ accentColor: cc.hex }} />
                  Train automatically each day (while you&apos;re away)
                </label>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted text-center mt-4">
        Bots are saved to your account in the cloud. Training rewards settings that hold up across several unseen time periods — not ones that just flatter the past.
      </p>
    </main>
  );
}

function Mini({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const color = good === undefined ? "text-ink" : good ? "text-gain" : "text-loss";
  return (
    <div className="bg-soft border border-line rounded-lg px-2 py-1.5">
      <div className="text-[9.5px] text-muted uppercase tracking-wide font-semibold">{label}</div>
      <div className={`text-[14px] font-bold ${color}`}>{value}</div>
    </div>
  );
}
