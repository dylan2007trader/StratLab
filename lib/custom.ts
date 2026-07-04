// The Strategy Builder engine. A CustomStrategy is entry/exit rules composed from
// indicator + comparator + operand blocks. We turn it into a desired-position
// signal (identical interface to the built-in strategies), enumerate its tunable
// numbers so the training engine can optimise them, and describe/validate it.

import { CustomStrategy, Condition, IndicatorRef, ConditionGroup, Comparator } from "./types";
import { sma, rsi } from "./indicators";

const OP_LABEL: Record<Comparator, string> = { lt: "<", gt: ">", crossesAbove: "crosses above", crossesBelow: "crosses below" };

function evalIndicator(ref: IndicatorRef, prices: number[]): number[] {
  switch (ref.kind) {
    case "price": return prices;
    case "sma": return sma(prices, Math.max(1, ref.period ?? 20));
    case "rsi": return rsi(prices, Math.max(2, ref.period ?? 14));
    case "const": return prices.map(() => ref.value ?? 0);
    default: return prices;
  }
}

function evalCondition(cond: Condition, prices: number[]): boolean[] {
  const L = evalIndicator(cond.left, prices);
  const R = evalIndicator(cond.right, prices);
  const out: boolean[] = new Array(prices.length).fill(false);
  for (let i = 0; i < prices.length; i++) {
    const l = L[i], r = R[i];
    if (Number.isNaN(l) || Number.isNaN(r)) { out[i] = false; continue; }
    switch (cond.op) {
      case "lt": out[i] = l < r; break;
      case "gt": out[i] = l > r; break;
      case "crossesAbove": out[i] = i > 0 && !Number.isNaN(L[i - 1]) && !Number.isNaN(R[i - 1]) && L[i - 1] <= R[i - 1] && l > r; break;
      case "crossesBelow": out[i] = i > 0 && !Number.isNaN(L[i - 1]) && !Number.isNaN(R[i - 1]) && L[i - 1] >= R[i - 1] && l < r; break;
    }
  }
  return out;
}

function combine(group: ConditionGroup, prices: number[]): boolean[] {
  if (!group.conds.length) return new Array(prices.length).fill(false);
  const series = group.conds.map((c) => evalCondition(c, prices));
  return prices.map((_, i) => (group.logic === "AND" ? series.every((s) => s[i]) : series.some((s) => s[i])));
}

/** Desired position (1 = want in) from a custom strategy: enter when the entry
 *  group fires, exit when the exit group fires. Exit with no conditions = hold. */
export function customSignal(custom: CustomStrategy, prices: number[]): number[] {
  const entry = combine(custom.entry, prices);
  const exit = custom.exit.conds.length ? combine(custom.exit, prices) : new Array(prices.length).fill(false);
  const out = new Array(prices.length).fill(0);
  let inPos = false;
  for (let i = 0; i < prices.length; i++) {
    if (!inPos && entry[i]) inPos = true;
    else if (inPos && exit[i]) inPos = false;
    out[i] = inPos ? 1 : 0;
  }
  return out;
}

function refLabel(r: IndicatorRef): string {
  if (r.kind === "price") return "price";
  if (r.kind === "const") return `${r.value ?? 0}`;
  return `${r.kind.toUpperCase()}(${r.period ?? "?"})`;
}
function condLabel(c: Condition): string { return `${refLabel(c.left)} ${OP_LABEL[c.op]} ${refLabel(c.right)}`; }
function groupLabel(g: ConditionGroup): string { return g.conds.map(condLabel).join(g.logic === "AND" ? " AND " : " OR "); }

export function describeCustom(c: CustomStrategy): string {
  return `Buy: ${groupLabel(c.entry) || "—"} · Sell: ${groupLabel(c.exit) || "—"}`;
}

export function validateCustom(c: CustomStrategy | null | undefined): boolean {
  if (!c) return false;
  if (!c.entry.conds.length) return false;
  const okRef = (r: IndicatorRef) =>
    r.kind === "price" || (r.kind === "const" && r.value !== undefined) || ((r.kind === "sma" || r.kind === "rsi") && (r.period ?? 0) >= 1);
  return [...c.entry.conds, ...c.exit.conds].every((cd) => okRef(cd.left) && okRef(cd.right));
}

/** A friendly starter: classic RSI dip-buyer, fully editable. */
export function defaultCustomStrategy(): CustomStrategy {
  return {
    entry: { logic: "AND", conds: [{ left: { kind: "rsi", period: 14 }, op: "lt", right: { kind: "const", value: 30 } }] },
    exit: { logic: "OR", conds: [{ left: { kind: "rsi", period: 14 }, op: "gt", right: { kind: "const", value: 70 } }] },
  };
}

// ---- Tunables: the numbers training is allowed to optimise --------------------

export interface Tunable {
  id: string;
  label: string;
  kind: "period" | "const";
  get(c: CustomStrategy): number;
  set(c: CustomStrategy, v: number): void;
}

function refsOf(c: CustomStrategy): { ref: IndicatorRef; where: string }[] {
  const out: { ref: IndicatorRef; where: string }[] = [];
  c.entry.conds.forEach((cd, i) => { out.push({ ref: cd.left, where: `entry.${i}.L` }); out.push({ ref: cd.right, where: `entry.${i}.R` }); });
  c.exit.conds.forEach((cd, i) => { out.push({ ref: cd.left, where: `exit.${i}.L` }); out.push({ ref: cd.right, where: `exit.${i}.R` }); });
  return out;
}

function refAt(c: CustomStrategy, where: string): IndicatorRef {
  const [grp, idx, side] = where.split(".");
  const cond = (grp === "entry" ? c.entry.conds : c.exit.conds)[Number(idx)];
  return side === "L" ? cond.left : cond.right;
}

/** Every editable number in a custom strategy, as a get/set tunable. */
export function customTunables(c: CustomStrategy): Tunable[] {
  const out: Tunable[] = [];
  for (const { ref, where } of refsOf(c)) {
    if (ref.kind === "sma" || ref.kind === "rsi") {
      out.push({
        id: `${where}.period`, label: `${ref.kind.toUpperCase()} period (${where.startsWith("entry") ? "buy" : "sell"})`, kind: "period",
        get: (s) => refAt(s, where).period ?? 14,
        set: (s, v) => { refAt(s, where).period = v; },
      });
    } else if (ref.kind === "const") {
      out.push({
        id: `${where}.value`, label: `Threshold (${where.startsWith("entry") ? "buy" : "sell"})`, kind: "const",
        get: (s) => refAt(s, where).value ?? 0,
        set: (s, v) => { refAt(s, where).value = v; },
      });
    }
  }
  return out;
}

/** Deep-clone a custom strategy (so training mutations don't touch the original). */
export function cloneCustom(c: CustomStrategy): CustomStrategy {
  return JSON.parse(JSON.stringify(c));
}
