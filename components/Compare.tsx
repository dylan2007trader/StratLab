"use client";

import { SavedBot } from "@/lib/storage";
import { colorOf, describeConfig, STRATEGY_LABELS } from "@/lib/bot";
import { paperReturn } from "@/lib/paper";
import Mascot from "./Mascot";
import InfoTip from "./InfoTip";
import SceneBanner from "./SceneBanner";

const signed = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export default function Compare({ bots, onBack }: { bots: SavedBot[]; onBack: () => void }) {
  // Honest ranking: by UNSEEN (out-of-sample) return, not the headline number.
  const ranked = [...bots].sort((a, b) => (b.best?.oosReturn ?? -Infinity) - (a.best?.oosReturn ?? -Infinity));
  const maxAbs = Math.max(0.0001, ...ranked.map((b) => Math.abs(b.best?.oosReturn ?? 0)));
  const anyLive = ranked.some((b) => b.paper);
  const winner = ranked.find((b) => b.best != null);

  return (
    <main className="max-w-3xl mx-auto my-6">
      <SceneBanner
        title="Compare bots"
        subtitle="Ranked by the honest score: how they did on data they never trained on."
        back={<button onClick={onBack} className="bg-black/30 text-cream text-[12.5px] rounded-lg px-3 py-1.5">← Back</button>}
      />

      {winner && (
        <div className="mt-3 rounded-xl px-4 py-3 text-[13px] border" style={{ background: colorOf(winner.color).soft, borderColor: colorOf(winner.color).hex, color: colorOf(winner.color).deep }}>
          <b>{winner.name}</b> leads on the honest score — {signed(winner.best?.oosReturn)} on unseen data. The headline return can mislead; this is the one that matters.
        </div>
      )}

      {/* diverging unseen bars */}
      <div className="bg-white border border-line rounded-2xl p-4 mt-3">
        {ranked.map((bot, i) => {
          const c = colorOf(bot.color);
          const oos = bot.best?.oosReturn ?? 0;
          const w = (Math.abs(oos) / maxAbs) * 50;
          return (
            <div key={bot.id} className={`py-2.5 ${i ? "border-t border-line" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-muted w-5">{i + 1}</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.soft }}><Mascot size={22} color={c.hex} soft="#ffffff" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13.5px] truncate">{bot.name} <span className="text-[11px] font-normal text-muted">Lv {bot.level} · {bot.symbol}</span></p>
                  <div className="h-2 mt-1 bg-[#eef1f5] rounded-full relative">
                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#c2c8d0]" />
                    <div className="h-2 rounded-full absolute top-0" style={{ width: `${w}%`, left: oos >= 0 ? "50%" : `${50 - w}%`, background: oos >= 0 ? "#1f8a70" : "#d8534f" }} />
                  </div>
                </div>
                <div className={`text-[15px] font-bold shrink-0 ${oos >= 0 ? "text-gain" : "text-loss"}`}>{signed(bot.best?.oosReturn)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* full metric table */}
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-[12.5px] bg-white border border-line rounded-2xl">
          <thead>
            <tr className="text-muted text-left">
              <th className="p-2.5 font-semibold">Bot</th>
              <th className="p-2.5 font-semibold">Strategy</th>
              <th className="p-2.5 font-semibold text-right">Total<InfoTip text="Whole-period return. Flattering, because the bot was tuned on most of it." /></th>
              <th className="p-2.5 font-semibold text-right">Unseen<InfoTip text="Return on data it never trained on. The honest score to rank by." /></th>
              <th className="p-2.5 font-semibold text-right">Max drop<InfoTip text="Worst peak-to-bottom fall. Lower is calmer to hold." /></th>
              <th className="p-2.5 font-semibold text-right">Trades</th>
              {anyLive && <th className="p-2.5 font-semibold text-right">Forward<InfoTip text="Live paper result since it was deployed — the most honest of all." /></th>}
            </tr>
          </thead>
          <tbody>
            {ranked.map((bot) => (
              <tr key={bot.id} className={`border-t border-line ${bot.id === winner?.id ? "bg-soft" : ""}`}>
                <td className="p-2.5 font-semibold">{bot.name}</td>
                <td className="p-2.5 text-muted">{STRATEGY_LABELS[bot.config.strategy]}<br /><span className="text-[11px]">{describeConfig(bot.config)}</span></td>
                <td className="p-2.5 text-right">{signed(bot.best?.totalReturn)}</td>
                <td className={`p-2.5 text-right font-bold ${(bot.best?.oosReturn ?? 0) >= 0 ? "text-gain" : "text-loss"}`}>{signed(bot.best?.oosReturn)}</td>
                <td className="p-2.5 text-right">{signed(bot.best?.maxDrawdown)}</td>
                <td className="p-2.5 text-right">{bot.best ? bot.best.trades : "—"}</td>
                {anyLive && <td className="p-2.5 text-right">{bot.paper ? signed(paperReturn(bot.paper)) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted text-center mt-3">
        Bots not yet run or trained show “—”. Open one and train or deploy it to fill in its scores.
      </p>
    </main>
  );
}
