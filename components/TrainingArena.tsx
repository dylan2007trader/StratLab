"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar } from "@/lib/types";
import { AvatarColor } from "@/lib/bot";
import { SavedBot, TrainingRun, upsertBot } from "@/lib/storage";
import { stepRun, finalizeRun, runProgress, etaSeconds } from "@/lib/trainRun";
import { phasesForLevel } from "@/lib/trainPlan";
import { TICKERS } from "@/lib/tickers";
import Mascot from "./Mascot";

const signed = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString();

function fmtEta(s: number | null): string {
  if (s === null) return "done";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function TrainingArena({
  bot, bars, color, onComplete,
}: {
  bot: SavedBot;
  bars: Bar[];
  color: AvatarColor;
  onComplete: (updated: SavedBot) => void;
}) {
  const runRef = useRef<TrainingRun>(bot.activeRun!);
  const [, force] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const tickCount = useRef(0);
  const completedRef = useRef(false);
  const basketRef = useRef<{ symbol: string; bars: Bar[] }[]>([]);

  const run = runRef.current;

  // For the Generalize phase (Lv9+), pre-fetch a basket of other stocks.
  useEffect(() => {
    if (bot.activeRun!.level < 9) return;
    const others = TICKERS.filter((t) => t.symbol !== bot.symbol).slice(0, 4);
    Promise.all(
      others.map(async (t) => {
        try {
          const res = await fetch(`/api/bars?symbol=${t.symbol}&years=${bot.activeRun!.plan.years}`);
          const d = await res.json();
          return res.ok ? { symbol: t.symbol, bars: d.bars as Bar[] } : null;
        } catch { return null; }
      })
    ).then((rs) => { basketRef.current = rs.filter((x): x is { symbol: string; bars: Bar[] } => !!x); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const r = runRef.current;
      if (r.status === "done") return;
      stepRun(r, bot.config, bars, 200, basketRef.current);
      tickCount.current++;
      if (tickCount.current % 8 === 0) upsertBot({ ...bot, activeRun: { ...r } });
      force((n) => n + 1);
      // stepRun mutates r.status; re-read defeats stale control-flow narrowing
      if ((r.status as string) === "done") complete();
    }, 120);
    return () => {
      clearInterval(id);
      // persist partial progress so a reload resumes where we left off
      if (!completedRef.current && runRef.current.status !== "done") {
        upsertBot({ ...bot, activeRun: { ...runRef.current } });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function complete() {
    if (completedRef.current) return;
    completedRef.current = true;
    setFinishing(true);
    const updated = finalizeRun(bot, runRef.current);
    upsertBot(updated);
    setTimeout(() => onComplete(updated), 650);
  }

  function stopNow() {
    runRef.current.status = "done";
    complete();
  }

  const progress = runProgress(run);
  const eta = etaSeconds(run);
  const pct = Math.round(progress * 100);
  const improvement = run.bestMetrics.oosReturn - run.baseOos;

  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: color.soft }}>
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#fff" }}>
          <Mascot size={34} color={color.hex} soft="#ffffff" mood="think" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[15px]" style={{ color: color.deep }}>
            {finishing ? "Locking in the most robust setting…" : `${bot.name} is training`}
          </div>
          <div className="text-[11.5px] text-muted">
            Lv.{run.level} · {run.plan.years}y history · {run.plan.folds} windows{run.plan.fusion ? ` · fused ${run.plan.fusion}` : ""} · sampling {num(run.sampled)} settings
          </div>
        </div>
        {run.status !== "done" && (
          <button onClick={stopNow} className="text-[11.5px] font-semibold rounded-lg px-3 py-1.5 border" style={{ borderColor: color.hex, color: color.deep }}>
            Stop &amp; apply best
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* progress */}
        <div>
          <div className="h-2.5 bg-[#eef1f5] rounded-full overflow-hidden">
            <div className="h-2.5 rounded-full transition-all duration-150" style={{ width: `${pct}%`, background: color.hex }} />
          </div>
          <div className="flex justify-between text-[11.5px] text-muted mt-1.5">
            <span>{num(run.tested)} / {num(run.sampled)} settings · {pct}%</span>
            <span>{run.status === "done" ? "complete" : `~${fmtEta(eta)} left`}</span>
          </div>
        </div>

        {/* phase tracker */}
        <PhaseTracker run={run} color={color} />

        {/* headline stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Best unseen" value={signed(run.bestMetrics.oosReturn)} good={run.bestMetrics.oosReturn >= 0} big color={color} />
          <Stat label="Improvement" value={improvement > 0 ? `+${(improvement * 100).toFixed(1)}%` : "—"} good={improvement > 0} big color={color} />
          <Stat label={run.phase === "evolve" ? "Generation" : "Backtests"} value={run.phase === "evolve" ? `${run.generation}` : num(run.tested * run.plan.folds)} color={color} />
        </div>

        {run.monteCarlo && (
          <div className="rounded-xl border border-line p-3">
            <div className="text-[12px] font-bold mb-1.5">Monte-Carlo stress test · {run.monteCarlo.samples.length} resampled markets</div>
            <Histogram samples={run.monteCarlo.samples} p05={run.monteCarlo.p05} color={color} />
            <div className="text-[11px] text-muted mt-1.5">
              Worst-case (5th pct) <b className={run.monteCarlo.p05 >= 0 ? "text-gain" : "text-loss"}>{signed(run.monteCarlo.p05)}</b> ·
              median <b>{signed(run.monteCarlo.median)}</b> · {Math.round(run.monteCarlo.profitableFrac * 100)}% of alternate histories stayed profitable.
            </div>
          </div>
        )}

        {run.generalize && (
          <div className="rounded-xl border border-line p-3">
            <div className="text-[12px] font-bold mb-1.5">Generalize · does the edge travel to other stocks?</div>
            <div className="text-[11px] text-muted mb-2">Held up on <b>{Math.round(run.generalize.traveled * 100)}%</b> of other stocks · average {signed(run.generalize.score)}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
              {run.generalize.perTicker.map((p) => (
                <div key={p.symbol} className="flex justify-between"><span className="font-mono">{p.symbol}</span><span className={`font-bold ${p.oos >= 0 ? "text-gain" : "text-loss"}`}>{signed(p.oos)}</span></div>
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* exploration scatter */}
          <div>
            <div className="text-[12px] font-bold mb-1">Exploring the parameter space</div>
            {run.axis ? (
              <Scatter run={run} color={color} />
            ) : (
              <div className="text-[11.5px] text-muted">Open two or more dials to see the search map.</div>
            )}
            {run.axis && (
              <div className="text-[10.5px] text-muted mt-1 flex justify-between">
                <span>← {run.axis.xLabel} →</span>
                <span>↑ {run.axis.yLabel}</span>
              </div>
            )}
          </div>

          {/* climbing curve */}
          <div>
            <div className="text-[12px] font-bold mb-1">Best unseen score over time</div>
            <Sparkline values={run.scoreCurve} color={color} />
            <div className="text-[10.5px] text-muted mt-1">Started at {signed(run.baseOos)} — climbs as training finds more robust settings.</div>
          </div>
        </div>

        {/* leaderboard */}
        <div>
          <div className="text-[12px] font-bold mb-1.5">Top settings found</div>
          <div className="rounded-lg border border-line divide-y divide-line">
            {run.leaderboard.map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                <span className="w-4 text-muted">{i + 1}</span>
                <span className="flex-1 font-mono text-[11.5px] truncate">{e.label}</span>
                <span className={`font-bold ${e.oos >= 0 ? "text-gain" : "text-loss"}`}>{signed(e.oos)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* event feed */}
        <div>
          <div className="text-[12px] font-bold mb-1.5">Training log</div>
          <div className="rounded-lg bg-[#0f1722] text-[#cdd6e0] p-2.5 font-mono text-[11px] max-h-[150px] overflow-y-auto space-y-0.5">
            {[...run.log].reverse().map((e, i) => (
              <div key={i} className={e.kind === "best" ? "text-[#7ee2b8]" : e.kind === "milestone" ? "text-[#f5c66b]" : "text-[#8aa0b8]"}>
                {e.kind === "best" ? "★ " : e.kind === "milestone" ? "› " : "· "}{e.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseTracker({ run, color }: { run: TrainingRun; color: AvatarColor }) {
  const phases = phasesForLevel(run.level);
  const order = ["scan", "evolve", "stress", "generalize"];
  const curIdx = run.phase === "done" ? order.length : order.indexOf(run.phase);
  return (
    <div className="flex items-center gap-1.5">
      {phases.map((ph) => {
        const done = order.indexOf(ph.id) < curIdx;
        const active = ph.id === run.phase;
        return (
          <div key={ph.id} className="flex-1 rounded-lg px-2 py-1.5 text-center border"
            style={active ? { background: color.hex, color: "#fff", borderColor: color.hex }
              : done ? { background: color.soft, color: color.deep, borderColor: color.soft }
              : { background: "#fff", color: "#aab", borderColor: "#eef1f5" }}>
            <div className="text-[11.5px] font-bold">{done ? "✓ " : active ? "● " : ""}{ph.label}</div>
            <div className="text-[9.5px] opacity-80 leading-tight truncate">{ph.blurb}</div>
          </div>
        );
      })}
    </div>
  );
}

function Histogram({ samples, p05, color }: { samples: number[]; p05: number; color: AvatarColor }) {
  const W = 300, H = 80, pad = 4, bins = 28;
  if (samples.length === 0) return null;
  const min = Math.min(...samples), max = Math.max(...samples);
  const span = max - min || 1;
  const counts = new Array(bins).fill(0);
  for (const s of samples) counts[Math.min(bins - 1, Math.floor(((s - min) / span) * bins))]++;
  const cmax = Math.max(...counts);
  const bw = (W - 2 * pad) / bins;
  const p05x = pad + ((p05 - min) / span) * (W - 2 * pad);
  const zeroX = min < 0 && max > 0 ? pad + ((0 - min) / span) * (W - 2 * pad) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-soft" style={{ height: 80 }}>
      {counts.map((c, i) => {
        const h = (c / cmax) * (H - 2 * pad);
        const binMid = min + ((i + 0.5) / bins) * span;
        return <rect key={i} x={pad + i * bw + 0.5} y={H - pad - h} width={Math.max(1, bw - 1)} height={h} fill={binMid >= 0 ? color.hex : "#d8534f"} opacity={0.75} />;
      })}
      {zeroX !== null && <line x1={zeroX} y1={pad} x2={zeroX} y2={H - pad} stroke="#9aa6b2" strokeDasharray="2 2" />}
      <line x1={p05x} y1={0} x2={p05x} y2={H} stroke={color.deep} strokeWidth={1.5} />
    </svg>
  );
}

function Stat({ label, value, good, big, color }: { label: string; value: string; good?: boolean; big?: boolean; color: AvatarColor }) {
  const cls = good === undefined ? "text-ink" : good ? "text-gain" : "text-loss";
  return (
    <div className="bg-soft border border-line rounded-xl px-3 py-2">
      <div className="text-[10px] text-muted uppercase tracking-wide font-semibold truncate">{label}</div>
      <div className={`${big ? "text-lg" : "text-base"} font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function Scatter({ run, color }: { run: TrainingRun; color: AvatarColor }) {
  const W = 300, H = 150, pad = 6;
  const pts = run.explore;
  const { xs, ys, ss } = useMemo(() => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), ss = pts.map((p) => p.s);
    return { xs, ys, ss };
  }, [pts]);
  if (pts.length === 0) {
    return <div className="rounded-lg border border-line bg-soft h-[150px] flex items-center justify-center text-[11px] text-muted">warming up…</div>;
  }
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const smin = Math.min(...ss), smax = Math.max(...ss);
  const sx = (x: number) => pad + ((x - xmin) / (xmax - xmin || 1)) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - ymin) / (ymax - ymin || 1)) * (H - 2 * pad);
  const heat = (s: number) => {
    const t = (s - smin) / (smax - smin || 1); // 0 worst .. 1 best
    const r = Math.round(216 - t * (216 - 31));
    const g = Math.round(83 + t * (138 - 83));
    const b = Math.round(79 + t * (112 - 79));
    return `rgb(${r},${g},${b})`;
  };
  const bestIdx = ss.indexOf(smax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-line bg-white" style={{ height: 150 }}>
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={i === bestIdx ? 4.5 : 2.4}
          fill={heat(p.s)} opacity={i === bestIdx ? 1 : 0.7}
          stroke={i === bestIdx ? color.deep : "none"} strokeWidth={i === bestIdx ? 1.5 : 0} />
      ))}
    </svg>
  );
}

function Sparkline({ values, color }: { values: number[]; color: AvatarColor }) {
  const W = 300, H = 150, pad = 8;
  if (values.length < 2) {
    return <div className="rounded-lg border border-line bg-soft h-[150px] flex items-center justify-center text-[11px] text-muted">warming up…</div>;
  }
  const min = Math.min(...values, 0), max = Math.max(...values);
  const sx = (i: number) => pad + (i / (values.length - 1)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const zeroY = sy(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-line bg-white" style={{ height: 150 }}>
      {min < 0 && max > 0 && <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="#e7e9ee" strokeDasharray="3 3" />}
      <path d={`${d} L${sx(values.length - 1)},${H - pad} L${sx(0)},${H - pad} Z`} fill={color.hex} opacity={0.08} />
      <path d={d} fill="none" stroke={color.hex} strokeWidth={2} />
      <circle cx={sx(values.length - 1)} cy={sy(values[values.length - 1])} r={3.5} fill={color.hex} />
    </svg>
  );
}
