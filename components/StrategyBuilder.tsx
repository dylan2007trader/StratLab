"use client";

import { CustomStrategy, Condition, ConditionGroup, IndicatorRef, IndicatorKind, Comparator } from "@/lib/types";
import { describeCustom } from "@/lib/custom";

const OPS: { id: Comparator; label: string }[] = [
  { id: "lt", label: "is below" },
  { id: "gt", label: "is above" },
  { id: "crossesAbove", label: "crosses above" },
  { id: "crossesBelow", label: "crosses below" },
];
const KINDS: { id: IndicatorKind; label: string }[] = [
  { id: "price", label: "Price" },
  { id: "sma", label: "Moving avg" },
  { id: "rsi", label: "RSI" },
  { id: "const", label: "A number" },
];

const clone = (c: CustomStrategy): CustomStrategy => JSON.parse(JSON.stringify(c));

export default function StrategyBuilder({ value, onChange, accent }: { value: CustomStrategy; onChange: (c: CustomStrategy) => void; accent: string }) {
  function setGroup(which: "entry" | "exit", g: ConditionGroup) {
    const next = clone(value); next[which] = g; onChange(next);
  }
  return (
    <div className="space-y-3">
      <GroupEditor title="Buy when…" group={value.entry} onChange={(g) => setGroup("entry", g)} accent={accent} />
      <GroupEditor title="Sell when…" group={value.exit} onChange={(g) => setGroup("exit", g)} accent={accent} allowEmpty />
      <div className="text-[11px] text-muted bg-soft border border-line rounded-lg px-2.5 py-1.5">
        <b>Your rule:</b> {describeCustom(value)}
      </div>
      <p className="text-[10.5px] text-muted">You invent the logic — training tunes every number (the periods and thresholds) for you.</p>
    </div>
  );
}

function GroupEditor({ title, group, onChange, accent, allowEmpty }: { title: string; group: ConditionGroup; onChange: (g: ConditionGroup) => void; accent: string; allowEmpty?: boolean }) {
  function update(i: number, c: Condition) { const conds = group.conds.slice(); conds[i] = c; onChange({ ...group, conds }); }
  function remove(i: number) { onChange({ ...group, conds: group.conds.filter((_, k) => k !== i) }); }
  function add() {
    onChange({ ...group, conds: [...group.conds, { left: { kind: "rsi", period: 14 }, op: "lt", right: { kind: "const", value: 30 } }] });
  }
  return (
    <div className="border border-line rounded-lg p-2.5 bg-white">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-bold">{title}</span>
        {group.conds.length > 1 && (
          <button onClick={() => onChange({ ...group, logic: group.logic === "AND" ? "OR" : "AND" })}
            className="text-[10.5px] font-bold rounded px-2 py-0.5 border" style={{ borderColor: accent, color: accent }}>
            {group.logic === "AND" ? "ALL must be true" : "ANY can be true"}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {group.conds.map((c, i) => (
          <CondEditor key={i} cond={c} onChange={(nc) => update(i, nc)} onRemove={() => remove(i)} canRemove={allowEmpty || group.conds.length > 1} />
        ))}
        {group.conds.length === 0 && <p className="text-[11px] text-muted">No sell rule — the bot holds until a stop-loss or take-profit (set those under Risk).</p>}
      </div>
      <button onClick={add} className="mt-2 text-[11px] font-semibold" style={{ color: accent }}>+ add condition</button>
    </div>
  );
}

function CondEditor({ cond, onChange, onRemove, canRemove }: { cond: Condition; onChange: (c: Condition) => void; onRemove: () => void; canRemove: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11.5px]">
      <RefEditor r={cond.left} onChange={(r) => onChange({ ...cond, left: r })} />
      <select value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as Comparator })} className="border border-line rounded p-1 bg-white">
        {OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <RefEditor r={cond.right} onChange={(r) => onChange({ ...cond, right: r })} allowConst />
      {canRemove && <button onClick={onRemove} className="text-muted hover:text-loss px-1" aria-label="Remove condition">✕</button>}
    </div>
  );
}

function RefEditor({ r, onChange, allowConst }: { r: IndicatorRef; onChange: (r: IndicatorRef) => void; allowConst?: boolean }) {
  const kinds = allowConst ? KINDS : KINDS.filter((k) => k.id !== "const");
  function setKind(kind: IndicatorKind) {
    if (kind === "const") onChange({ kind, value: 30 });
    else if (kind === "price") onChange({ kind });
    else onChange({ kind, period: kind === "rsi" ? 14 : 20 });
  }
  return (
    <span className="inline-flex items-center gap-1">
      <select value={r.kind} onChange={(e) => setKind(e.target.value as IndicatorKind)} className="border border-line rounded p-1 bg-white">
        {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
      </select>
      {(r.kind === "sma" || r.kind === "rsi") && (
        <input type="number" min={2} max={200} value={r.period ?? 14} onChange={(e) => onChange({ ...r, period: Math.max(2, +e.target.value) })} className="w-14 border border-line rounded p-1" aria-label="period" />
      )}
      {r.kind === "const" && (
        <input type="number" value={r.value ?? 0} onChange={(e) => onChange({ ...r, value: +e.target.value })} className="w-16 border border-line rounded p-1" aria-label="value" />
      )}
    </span>
  );
}
