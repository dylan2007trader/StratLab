"use client";

import { useMemo, useState } from "react";
import { SavedBot } from "@/lib/storage";
import { AvatarColor } from "@/lib/bot";
import { isProven } from "@/lib/progress";
import { BROKERS, BrokerId, deployInstructions, exportSpec, humanRules } from "@/lib/export";

const signed = (x: number | null | undefined) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);

export default function DeployPanel({ bot, color, onGoLive }: { bot: SavedBot; color: AvatarColor; onGoLive: () => void }) {
  const [broker, setBroker] = useState<BrokerId>("alpaca");
  const [copied, setCopied] = useState(false);
  const rules = useMemo(() => humanRules(bot.config), [bot.config]);
  const instructions = useMemo(() => deployInstructions(bot, broker), [bot, broker]);
  const spec = useMemo(() => JSON.stringify(exportSpec(bot), null, 2), [bot]);

  async function copySpec() {
    try { await navigator.clipboard.writeText(spec); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }
  function downloadSpec() {
    const blob = new Blob([spec], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${bot.name.replace(/\s+/g, "-").toLowerCase()}.stratlab.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-3.5 text-[12.5px]" style={{ background: "#fff7f2", color: "#7a3b1a" }}>
        <b>Practice with fake money first.</b> Deploy to the paper sandbox, watch it trade forward on live data for a few weeks, and only consider real money once it holds up. This is not financial advice.
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={onGoLive} className="text-white font-bold text-[13px] rounded-lg px-4 py-2.5" style={{ background: color.hex }}>
          {bot.paper ? "📈 View paper trading" : "🚀 Deploy to paper (fake money)"}
        </button>
        {isProven(bot) ? (
          <span className="text-[12px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "#f6efd6", color: "#5b4708" }}>🏅 Proven — its edge travelled to other stocks</span>
        ) : (
          <span className="text-[12px] text-muted">Reach Level 9 and pass the Generalize phase to earn the “Proven” badge.</span>
        )}
      </div>

      <div>
        <div className="text-[13px] font-bold mb-1.5">What this bot does</div>
        <div className="border border-line rounded-xl divide-y divide-line text-[12.5px]">
          {rules.map((r, i) => <div key={i} className="px-3 py-2">{r}</div>)}
        </div>
        {bot.best && (
          <div className="text-[11.5px] text-muted mt-1.5">
            Backtest: unseen {signed(bot.best.oosReturn)} · total {signed(bot.best.totalReturn)} · max drawdown {signed(bot.best.maxDrawdown)} · {bot.best.trades} trades.
          </div>
        )}
      </div>

      <div>
        <div className="text-[13px] font-bold mb-1.5">When you&apos;re ready for real money</div>
        <div className="flex gap-1.5 mb-2">
          {BROKERS.map((b) => (
            <button key={b.id} onClick={() => setBroker(b.id)} className="text-[12px] font-semibold rounded-lg px-3 py-1.5 border"
              style={broker === b.id ? { background: color.hex, color: "#fff", borderColor: color.hex } : { borderColor: "#e7e9ee", color: "#3a4654" }}>
              {b.name}
            </button>
          ))}
        </div>
        <pre className="text-[11.5px] leading-relaxed whitespace-pre-wrap bg-soft border border-line rounded-xl p-3 max-h-[320px] overflow-y-auto">{instructions}</pre>
      </div>

      <div className="flex gap-2">
        <button onClick={copySpec} className="border border-line text-[12.5px] font-semibold rounded-lg px-4 py-2.5">{copied ? "✓ Copied" : "Copy strategy JSON"}</button>
        <button onClick={downloadSpec} className="border border-line text-[12.5px] font-semibold rounded-lg px-4 py-2.5">⬇ Download spec</button>
      </div>
    </div>
  );
}
