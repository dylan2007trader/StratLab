"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar } from "@/lib/types";
import { colorOf, describeConfig } from "@/lib/bot";
import { SavedBot, upsertBot } from "@/lib/storage";
import { advancePaper, paperReturn, daysLive, isHolding } from "@/lib/paper";
import ChartPanel, { ChartSeries } from "./ChartPanel";
import Mascot from "./Mascot";
import SceneBanner from "./SceneBanner";

const signed = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export default function LiveDesk({
  bots,
  setBots,
  onBack,
}: {
  bots: SavedBot[];
  setBots: (b: SavedBot[]) => void;
  onBack: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const ran = useRef(false);

  const live = useMemo(() => bots.filter((b) => b.paper), [bots]);

  // Catch up every live bot to the latest available data on open.
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const toSync = bots.filter((b) => b.paper);
      if (toSync.length === 0) return;
      setSyncing(true);
      for (const b of toSync) {
        try {
          const res = await fetch(`/api/bars?symbol=${b.symbol}`);
          const data = await res.json();
          if (!res.ok) continue;
          const advanced = advancePaper(b.paper!, data.bars as Bar[]);
          setBots(upsertBot({ ...b, paper: advanced }));
        } catch {
          // skip on error
        }
      }
      setSyncing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ranked = useMemo(
    () => [...live].sort((a, b) => paperReturn(b.paper!) - paperReturn(a.paper!)),
    [live]
  );

  return (
    <main className="max-w-3xl mx-auto my-6">
      <SceneBanner
        title="The summit"
        subtitle="Bots ranked on real forward results — data they traded after you built them."
        back={<button onClick={onBack} className="bg-black/30 text-cream text-[12.5px] rounded-lg px-3 py-1.5">← Back</button>}
      />

      {syncing && (
        <div className="mt-3 bg-soft border border-line rounded-xl px-4 py-2.5 text-[13px] text-muted">
          Updating live bots with the latest prices…
        </div>
      )}

      {ranked.length === 0 ? (
        <div className="mt-6 bg-white border border-line rounded-2xl p-10 text-center">
          <Mascot size={64} />
          <p className="mt-3 font-bold text-[16px]">No bots are live yet</p>
          <p className="text-[13px] text-muted mt-1">Open My bots and hit “Go live” on one to start forward paper-trading it.</p>
          <button onClick={onBack} className="mt-4 bg-brand text-white font-bold rounded-lg px-5 py-2.5">Go to My bots</button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {ranked.map((bot, i) => {
            const c = colorOf(bot.color);
            const ps = bot.paper!;
            const fwd = paperReturn(ps);
            const dates = ps.equity.map((e) => e.t);
            const series: ChartSeries[] = [{ id: "eq", color: c.hex, lineWidth: 2, values: ps.equity.map((e) => e.v) }];
            return (
              <div key={bot.id} className="bg-white border border-line rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <span className="text-[14px] font-bold text-muted w-5">{i + 1}</span>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.soft }}>
                    <Mascot size={28} color={c.hex} soft="#ffffff" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[14px] truncate">{bot.name} <span className="text-[11px] font-normal text-muted">Lv. {bot.level} · {bot.symbol} · {describeConfig(bot.config)}</span></p>
                    <p className="text-[11px] text-muted">
                      {daysLive(ps)}d live · {isHolding(ps) ? "holding" : "in cash"} · {ps.trades} trade{ps.trades === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[18px] font-bold ${fwd >= 0 ? "text-gain" : "text-loss"}`}>{signed(fwd)}</div>
                    <div className="text-[10.5px] text-muted">forward</div>
                  </div>
                </div>

                {dates.length > 1 && (
                  <div className="mt-2">
                    <ChartPanel dates={dates} series={series} splitIndex={dates.length} height={110} />
                  </div>
                )}

                <div className="mt-2 text-[11.5px] text-muted bg-soft border border-line rounded-lg px-3 py-2">
                  Backtest said{" "}
                  <b className={(bot.best?.oosReturn ?? 0) >= 0 ? "text-gain" : "text-loss"}>{signed(bot.best?.oosReturn)}</b>{" "}
                  on unseen data · trading forward it&apos;s actually{" "}
                  <b className={fwd >= 0 ? "text-gain" : "text-loss"}>{signed(fwd)}</b>.
                  {bot.best != null && Math.abs(fwd - (bot.best.oosReturn ?? 0)) > 0.15 && " A big gap is the honest reality check — backtests flatter."}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted text-center mt-4">
        Paper money only. Bots advance as new daily prices arrive — the longer they run, the more honest the ranking.
      </p>
    </main>
  );
}
