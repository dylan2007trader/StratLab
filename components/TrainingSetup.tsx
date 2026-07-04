"use client";

import { useMemo, useState } from "react";
import { BotConfig, StrategyId } from "@/lib/types";
import { AvatarColor } from "@/lib/bot";
import {
  TrainPlan, Intensity, Effort, dimsForConfig, planMath, humanCount, humanDuration,
  INTENSITY_LABEL, EFFORT_LABEL, STRATEGY_NAMES, defaultPlanForConfig, trainDurationMs,
  phasesForLevel, nextUnlock,
} from "@/lib/trainPlan";

const ALL_STRATS: StrategyId[] = ["ma", "rsi", "macd", "bollinger", "breakout", "dip"];

export default function TrainingSetup({
  config, level, color, onLaunch, onCancel,
}: {
  config: BotConfig;
  level: number;
  color: AvatarColor;
  onLaunch: (plan: TrainPlan) => void;
  onCancel: () => void;
}) {
  const [plan, setPlan] = useState<TrainPlan>(() => defaultPlanForConfig(config));
  const dims = useMemo(() => dimsForConfig(config, plan.fusion), [config, plan.fusion]);
  const math = useMemo(() => planMath(config, plan, level), [config, plan, level]);
  const phases = phasesForLevel(level);
  const unlock = nextUnlock(level);

  function toggle(key: string) {
    setPlan((p) => ({ ...p, open: p.open.includes(key) ? p.open.filter((k) => k !== key) : [...p.open, key] }));
  }
  function setFusion(s: StrategyId | null) {
    setPlan((p) => {
      const open = p.open.filter((k) => k !== "fusion.param");
      if (s) open.push("fusion.param");
      return { ...p, fusion: s, open };
    });
  }

  const stratDims = dims.filter((d) => d.group === "strategy");
  const riskDims = dims.filter((d) => d.group === "risk");
  const fusionDims = dims.filter((d) => d.group === "fusion");
  const canLaunch = plan.open.length > 0;

  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="px-4 py-3" style={{ background: color.soft }}>
        <div className="flex items-center justify-between gap-2">
          <div className="font-extrabold text-[15px]" style={{ color: color.deep }}>Train · Level {level} → {level + 1}</div>
          <div className="text-[12px] font-bold px-2.5 py-1 rounded-lg bg-white" style={{ color: color.deep }}>
            ⏱ {humanDuration(trainDurationMs(level, plan.effort) / 1000)}
          </div>
        </div>
        <p className="text-[11.5px] text-muted mt-1">
          Higher levels train longer and search harder — but the gains get smaller and more robust. Each run levels the bot up.
        </p>
      </div>

      <div className="p-4 space-y-4">
        <Section title="Training phases at this level" hint="Phases unlock as your bot levels up.">
          <div className="flex flex-wrap items-center gap-1.5">
            {phases.map((ph) => (
              <span key={ph.id} className="text-[11.5px] font-semibold rounded-full px-3 py-1" style={{ background: color.hex, color: "#fff" }} title={ph.blurb}>
                {ph.label}
              </span>
            ))}
            {unlock && (
              <span className="text-[11px] text-muted rounded-full px-3 py-1 border border-dashed border-line">
                🔒 {unlock.phase.label} unlocks at Lv {unlock.atLevel}
              </span>
            )}
          </div>
          <p className="text-[10.5px] text-muted mt-1.5">{phases.map((p) => `${p.label}: ${p.blurb}`).join("  ·  ")}</p>
        </Section>

        <Section title="What should it tune?" hint="Open a dial to search it; locked dials stay at their current value.">
          <DimGrid dims={stratDims} open={plan.open} cur={config} onToggle={toggle} color={color} />
        </Section>

        <Section title="Risk & sizing" hint="Let training discover stops, targets, sizing and a trend filter.">
          <DimGrid dims={riskDims} open={plan.open} cur={config} onToggle={toggle} color={color} />
        </Section>

        <Section title="Strategy fusion" hint="Layer a second strategy on top — the bot only buys when both agree.">
          <div className="flex flex-wrap gap-1.5">
            <Pill active={plan.fusion === null} onClick={() => setFusion(null)} color={color}>None</Pill>
            {ALL_STRATS.filter((s) => s !== config.strategy).map((s) => (
              <Pill key={s} active={plan.fusion === s} onClick={() => setFusion(s)} color={color}>{STRATEGY_NAMES[s]}</Pill>
            ))}
          </div>
          {fusionDims.length > 0 && (
            <p className="text-[11px] text-muted mt-2">
              Fusing in <b>{STRATEGY_NAMES[plan.fusion as StrategyId]}</b> as a confirming filter — its tuning is added to the search.
            </p>
          )}
        </Section>

        <div className="grid sm:grid-cols-3 gap-3">
          <Choice<Intensity>
            title="Search intensity" value={plan.intensity}
            options={["quick", "standard", "thorough", "exhaustive"]}
            label={(v) => INTENSITY_LABEL[v]} color={color}
            onChange={(v) => setPlan((p) => ({ ...p, intensity: v }))}
          />
          <Choice<number>
            title="Backtest depth" value={plan.years}
            options={[2, 5, 10, 15]} label={(v) => `${v} years`} color={color}
            onChange={(v) => setPlan((p) => ({ ...p, years: v }))}
            hint="Deeper history = older market regimes (crashes, bubbles) to survive."
          />
          <Choice<number>
            title="Robustness" value={plan.folds}
            options={[3, 4, 6, 8]} label={(v) => `${v} windows`} color={color}
            onChange={(v) => setPlan((p) => ({ ...p, folds: v }))}
            hint="More walk-forward windows = a more honest score, more compute."
          />
        </div>

        <Choice<Effort>
          title="Effort" value={plan.effort}
          options={["light", "standard", "max"]}
          label={(v) => EFFORT_LABEL[v]} color={color}
          onChange={(v) => setPlan((p) => ({ ...p, effort: v }))}
          hint="Within this level: Light is quicker for a smaller gain, Max searches far longer for a bigger, more robust gain."
          wide
        />

        <MathPanel math={math} effort={plan.effort} color={color} />

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => canLaunch && onLaunch(plan)} disabled={!canLaunch}
            className="flex-1 text-white font-bold text-[13px] rounded-lg py-2.5 disabled:opacity-40"
            style={{ background: color.hex }}
          >
            ⚡ Start training · {humanDuration(math.durationMs / 1000)}
          </button>
          <button onClick={onCancel} className="border border-line text-[13px] font-semibold rounded-lg px-4">Cancel</button>
        </div>
        {!canLaunch && <p className="text-[11px] text-loss">Open at least one dial to train.</p>}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold">{title}</div>
      <div className="text-[11px] text-muted mb-2">{hint}</div>
      {children}
    </div>
  );
}

function DimGrid({ dims, open, cur, onToggle, color }: {
  dims: ReturnType<typeof dimsForConfig>; open: string[]; cur: BotConfig; onToggle: (k: string) => void; color: AvatarColor;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {dims.map((d) => {
        const on = open.includes(d.key);
        return (
          <button key={d.key} onClick={() => onToggle(d.key)}
            className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition-colors"
            style={on ? { borderColor: color.hex, background: color.soft } : { borderColor: "#e7e9ee", background: "#fff" }}>
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold truncate">{d.label}</span>
              <span className="block text-[10.5px] text-muted">now {d.fmt(d.read(cur))}</span>
            </span>
            <span className="text-[11px] font-bold shrink-0 ml-1" style={{ color: on ? color.deep : "#aab" }}>
              {on ? "tuning" : "locked"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Pill({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: AvatarColor; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-[11.5px] font-semibold rounded-full px-3 py-1 border"
      style={active ? { background: color.hex, color: "#fff", borderColor: color.hex } : { borderColor: "#e7e9ee", color: "#3a4654" }}>
      {children}
    </button>
  );
}

function Choice<T extends string | number>({ title, value, options, label, onChange, color, hint, wide }: {
  title: string; value: T; options: T[]; label: (v: T) => string; onChange: (v: T) => void; color: AvatarColor; hint?: string; wide?: boolean;
}) {
  return (
    <div>
      <div className="text-[12px] font-bold mb-1">{title}</div>
      <div className={`grid ${wide ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"} gap-1.5`}>
        {options.map((o) => {
          const active = o === value;
          return (
            <button key={String(o)} onClick={() => onChange(o)}
              className="text-[11.5px] font-semibold rounded-lg border py-1.5 px-1"
              style={active ? { background: color.hex, color: "#fff", borderColor: color.hex } : { borderColor: "#e7e9ee", color: "#3a4654", background: "#fff" }}>
              {label(o)}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-[10.5px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

function MathPanel({ math, effort, color }: { math: ReturnType<typeof planMath>; effort: Effort; color: AvatarColor }) {
  return (
    <div className="rounded-xl border border-line bg-soft p-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Num label="Combinations" value={humanCount(math.space)} accent={color.deep} />
        <Num label="Backtests run" value={humanCount(math.backtests)} accent={color.deep} />
        <Num label="Paced over" value={humanDuration(math.durationMs / 1000)} accent={color.deep} />
      </div>
      <p className="text-[11px] text-muted mt-2.5 leading-snug">
        Brute-forcing all {humanCount(math.space)} combinations at full fidelity would take roughly <b>{humanDuration(math.fullFidelitySeconds)}</b> of compute.
        This run does a guided search — sampling <b>{humanCount(math.sampled)}</b> of the most informative settings across {math.phases.length} phase{math.phases.length > 1 ? "s" : ""},
        paced over the {humanDuration(math.durationMs / 1000)} above. It keeps going while you&apos;re away.
      </p>
    </div>
  );
}

function Num({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div className="text-[16px] font-extrabold" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wide font-semibold">{label}</div>
    </div>
  );
}
