"use client";

import { LastTraining, ParamCurve } from "@/lib/storage";
import { AvatarColor } from "@/lib/bot";

const signed = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

function human(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

export default function TrainingReport({ last, color }: { last: LastTraining; color: AvatarColor }) {
  const improved = last.improvement > 0;
  return (
    <div className="rounded-xl border" style={{ borderColor: color.hex }}>
      <div className="px-4 py-3 rounded-t-xl" style={{ background: color.soft }}>
        <div className="text-[14px] font-extrabold flex items-center gap-1.5" style={{ color: color.deep }}>
          ⚡ {last.diffs.length ? "Training found stronger settings" : "Training run complete"}
        </div>
        <div className="text-[12px] mt-1" style={{ color: color.deep }}>
          Unseen score {signed(last.beforeOos)} → <b>{signed(last.afterOos)}</b>{" "}
          {improved ? `(+${(last.improvement * 100).toFixed(1)}% more robust)` : "(already near-optimal)"}
        </div>
        <div className="text-[11px] text-muted mt-0.5">
          Searched {last.space ? `${human(last.space)} combinations · ` : ""}{human(last.tested)} settings
          {last.years ? ` · ${last.years}y history` : ""}{last.folds ? ` · ${last.folds} windows` : ""}
          {last.generations ? ` · ${last.generations} generations` : ""}
          {last.fusionAdded ? ` · fused ${last.fusionAdded}` : ""}.
        </div>
        {last.phasesRun && last.phasesRun.length > 0 && (
          <div className="flex gap-1.5 mt-2">
            {last.phasesRun.map((p) => (
              <span key={p} className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-white" style={{ color: color.deep }}>✓ {p}</span>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {last.diffs.length > 0 && (
          <div>
            <div className="text-[12px] font-bold mb-1.5">What changed</div>
            <div className="flex flex-wrap gap-2 text-[12px]">
              {last.diffs.map((d, i) => (
                <span key={i} className="bg-soft border border-line rounded-md px-2.5 py-1">
                  {d.label} <span className="text-muted">{d.from}</span> → <span className="font-bold text-gain">{d.to}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {last.curves && last.curves.length > 0 && (
          <div>
            <div className="text-[12px] font-bold mb-1.5">What it learned — why each value won</div>
            <div className="grid grid-cols-2 gap-3">
              {last.curves.map((c) => <Curve key={c.key} curve={c} color={color} />)}
            </div>
            <p className="text-[10.5px] text-muted mt-1.5">Each line is the best score seen at every value tested. The peak is the setting training kept.</p>
          </div>
        )}

        {last.oosByFold && last.oosByFold.length > 1 && (
          <div>
            <div className="text-[12px] font-bold mb-1.5">How it held up across windows</div>
            <Folds vals={last.oosByFold} color={color} />
            <p className="text-[10.5px] text-muted mt-1.5">Out-of-sample return in each walk-forward window. Consistent green = it generalizes, not memorizes.</p>
          </div>
        )}

        {(last.riskAdjusted !== undefined || last.monteCarlo || last.overfitHaircut !== undefined || last.generalize) && (
          <div>
            <div className="text-[12px] font-bold mb-1.5">Robustness &amp; honesty</div>
            <div className="grid grid-cols-3 gap-2.5">
              {last.riskAdjusted !== undefined && (
                <Metric label="Risk-adjusted" value={last.riskAdjusted.toFixed(2)} hint="Return per unit of drawdown (Calmar). Higher = smoother ride." color={color} />
              )}
              {last.plateau !== undefined && (
                <Metric label="Plateau" value={`${Math.round(last.plateau * 100)}%`} hint="How broad/stable the winning region is. High = not a fragile spike." color={color} />
              )}
              {last.overfitHaircut !== undefined && (
                <Metric label="Confidence-adj." value={signed(last.afterOos - last.overfitHaircut)} hint="The unseen score after discounting for how hard we searched (overfit haircut). The number to actually trust." color={color} />
              )}
            </div>
            {last.monteCarlo && (
              <div className="mt-3 rounded-lg border border-line p-2.5">
                <div className="text-[11.5px] font-semibold mb-1">Monte-Carlo: {last.monteCarlo.samples.length} alternate market histories</div>
                <MCBars samples={last.monteCarlo.samples} p05={last.monteCarlo.p05} color={color} />
                <div className="text-[10.5px] text-muted mt-1.5">
                  Worst-case (5th pct) <b className={last.monteCarlo.p05 >= 0 ? "text-gain" : "text-loss"}>{signed(last.monteCarlo.p05)}</b> ·
                  median <b>{signed(last.monteCarlo.median)}</b> · {Math.round(last.monteCarlo.profitableFrac * 100)}% stayed profitable.
                  A robust bot survives reshuffled history, not just the one path it trained on.
                </div>
              </div>
            )}
            {last.generalize && last.generalize.perTicker.length > 0 && (
              <div className="mt-3 rounded-lg border border-line p-2.5">
                <div className="text-[11.5px] font-semibold mb-1">Generalize: edge travelled to {Math.round(last.generalize.traveled * 100)}% of other stocks</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  {last.generalize.perTicker.map((p) => (
                    <div key={p.symbol} className="flex justify-between"><span className="font-mono">{p.symbol}</span><span className={`font-bold ${p.oos >= 0 ? "text-gain" : "text-loss"}`}>{signed(p.oos)}</span></div>
                  ))}
                </div>
                <div className="text-[10.5px] text-muted mt-1.5">A real edge works on stocks it never trained on — not just the one it was fit to.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, hint, color }: { label: string; value: string; hint: string; color: AvatarColor }) {
  return (
    <div className="bg-soft border border-line rounded-xl px-3 py-2">
      <div className="text-[10px] text-muted uppercase tracking-wide font-semibold truncate">{label}</div>
      <div className="text-base font-bold" style={{ color: color.deep }}>{value}</div>
      <div className="text-[9.5px] text-muted leading-tight mt-0.5">{hint}</div>
    </div>
  );
}

function MCBars({ samples, p05, color }: { samples: number[]; p05: number; color: AvatarColor }) {
  const W = 280, H = 64, pad = 3, bins = 26;
  if (samples.length === 0) return null;
  const min = Math.min(...samples), max = Math.max(...samples);
  const span = max - min || 1;
  const counts = new Array(bins).fill(0);
  for (const s of samples) counts[Math.min(bins - 1, Math.floor(((s - min) / span) * bins))]++;
  const cmax = Math.max(...counts);
  const bw = (W - 2 * pad) / bins;
  const p05x = pad + ((p05 - min) / span) * (W - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-soft rounded" style={{ height: 64 }}>
      {counts.map((c, i) => {
        const h = (c / cmax) * (H - 2 * pad);
        const binMid = min + ((i + 0.5) / bins) * span;
        return <rect key={i} x={pad + i * bw + 0.4} y={H - pad - h} width={Math.max(1, bw - 1)} height={h} fill={binMid >= 0 ? color.hex : "#d8534f"} opacity={0.75} />;
      })}
      <line x1={p05x} y1={0} x2={p05x} y2={H} stroke={color.deep} strokeWidth={1.5} />
    </svg>
  );
}

function Curve({ curve, color }: { curve: ParamCurve; color: AvatarColor }) {
  const W = 150, H = 74, pad = 6;
  const pts = curve.points;
  const xs = pts.map((p) => p.v), ys = pts.map((p) => p.score);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const sx = (x: number) => pad + ((x - xmin) / (xmax - xmin || 1)) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - ymin) / (ymax - ymin || 1)) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.v).toFixed(1)},${sy(p.score).toFixed(1)}`).join(" ");
  const bestPt = pts.reduce((a, b) => (b.score > a.score ? b : a), pts[0]);
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] font-semibold truncate">{curve.label}</span>
        <span className="text-[11px] font-bold" style={{ color: color.deep }}>{curve.fmtBest}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-soft rounded" style={{ height: 74 }}>
        <path d={d} fill="none" stroke={color.hex} strokeWidth={1.8} />
        <line x1={sx(bestPt.v)} y1={pad} x2={sx(bestPt.v)} y2={H - pad} stroke={color.hex} strokeDasharray="2 2" opacity={0.4} />
        <circle cx={sx(bestPt.v)} cy={sy(bestPt.score)} r={3} fill={color.hex} />
      </svg>
    </div>
  );
}

function Folds({ vals, color }: { vals: number[]; color: AvatarColor }) {
  const max = Math.max(...vals.map((v) => Math.abs(v)), 0.01);
  return (
    <div className="flex items-end gap-1.5 h-[60px]">
      {vals.map((v, i) => {
        const h = (Math.abs(v) / max) * 50 + 4;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className="w-full rounded-t" style={{ height: h, background: v >= 0 ? "#1f8a70" : "#d8534f", opacity: 0.85 }} />
            <span className="text-[9px] text-muted mt-0.5">{signed(v)}</span>
          </div>
        );
      })}
    </div>
  );
}
