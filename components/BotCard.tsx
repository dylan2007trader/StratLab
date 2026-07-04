"use client";

import { BotIdentity, colorOf, maFromEagerness } from "@/lib/bot";
import Mascot from "./Mascot";

export default function BotCard({
  bot,
  level = 1,
  footnote = true,
}: {
  bot: BotIdentity;
  level?: number;
  footnote?: boolean;
}) {
  const c = colorOf(bot.color);
  const { fast, slow } = maFromEagerness(bot.eagerness);
  const eager = Math.round(bot.eagerness);
  const patience = 100 - eager;

  return (
    <div className="bg-white border border-line rounded-xl p-3.5">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: c.soft }}
        >
          <Mascot size={36} color={c.hex} soft="#ffffff" mood="happy" />
        </div>
        <div>
          <p className="text-[15px] font-bold leading-tight">{bot.name || "Unnamed bot"}</p>
          <span
            className="text-[11px] px-2 py-0.5 rounded-md inline-block mt-0.5"
            style={{ background: c.soft, color: c.deep }}
          >
            Trend follower · Lv. {level}
          </span>
        </div>
      </div>

      <TraitBar label="Eagerness" value={eager} color="#D85A30" />
      <TraitBar label="Patience" value={patience} color="#1D9E75" />

      {footnote && (
        <p className="text-[11px] text-muted mt-3 leading-snug">
          Under the hood, that&apos;s a {fast}-day vs {slow}-day moving-average crossover. Traits{" "}
          <span className="text-ink">are</span> the strategy.
        </p>
      )}
    </div>
  );
}

function TraitBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] text-muted mb-1">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 bg-[#eef1f5] rounded-full">
        <div className="h-1.5 rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
