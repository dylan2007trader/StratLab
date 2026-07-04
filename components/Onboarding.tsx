"use client";

import { useEffect, useMemo, useState } from "react";
import { TICKERS } from "@/lib/tickers";
import { runBacktest, indicatorsFor } from "@/lib/backtest";
import { Bar, BacktestResult } from "@/lib/types";
import { AVATAR_COLORS, BotIdentity, colorOf, toConfig } from "@/lib/bot";
import ChartPanel, { ChartSeries } from "./ChartPanel";
import Mascot from "./Mascot";
import SceneBanner from "./SceneBanner";
import BotCard from "./BotCard";

const TOTAL = 6;
const STARTER_TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "SPY"];
const fmtPct = (x: number | null) =>
  x === null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export default function Onboarding({
  onComplete,
  onSkip,
}: {
  onComplete: (bot: BotIdentity) => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0); // 0..5
  const [bot, setBot] = useState<BotIdentity>({
    name: "Pip",
    color: "purple",
    symbol: "AAPL",
    eagerness: 64,
  });

  const [bars, setBars] = useState<Bar[] | null>(null);
  const [barsSymbol, setBarsSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = colorOf(bot.color);

  // Fetch real prices once we reach the "tune" step (and refetch if the stock
  // changed). Data is needed for steps 4–6.
  useEffect(() => {
    if (step < 3) return;
    if (barsSymbol === bot.symbol && bars) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bars?symbol=${bot.symbol}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load prices");
        if (cancelled) return;
        setBars(data.bars as Bar[]);
        setBarsSymbol(bot.symbol);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, bot.symbol, bars, barsSymbol]);

  const result = useMemo<BacktestResult | null>(() => {
    if (!bars) return null;
    return runBacktest(toConfig(bot), bars);
  }, [bars, bot]);

  const indicators = useMemo(
    () => (result ? indicatorsFor(toConfig(bot), result.prices) : null),
    [result, bot]
  );

  const priceSeries = useMemo<ChartSeries[]>(() => {
    if (!result || !indicators) return [];
    return [
      { id: "price", color: "#9aa6b2", lineWidth: 2, values: result.prices },
      ...indicators.overlay.map((o) => ({ id: o.id, color: o.color, lineWidth: 2, values: o.values })),
    ];
  }, [result, indicators]);

  const equitySeries = useMemo<ChartSeries[]>(() => {
    if (!result) return [];
    return [
      { id: "bh", color: "#3b6fb0", lineWidth: 2, values: result.buyHold },
      { id: "bot", color: c.hex, lineWidth: 2, values: result.equity },
    ];
  }, [result, c.hex]);

  const next = () => setStep((s) => Math.min(TOTAL - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const dataPending = step >= 3 && (loading || (!result && !error));

  return (
    <div className="max-w-2xl mx-auto my-6 bg-white rounded-2xl shadow-xl overflow-hidden">
      <SceneBanner title="Build your first bot" subtitle="A quick, friendly walkthrough — no real money." height="h-24" rounded={false} />
      {/* top bar: progress + skip */}
      <div className="px-6 pt-4 pb-3 flex items-center justify-between">
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === step ? 26 : 16, background: i <= step ? c.hex : "#e6eaef" }}
            />
          ))}
        </div>
        <button onClick={onSkip} className="text-[12px] text-muted hover:text-ink">
          Skip intro →
        </button>
      </div>

      <div className="px-6 pb-6">
        {/* STEP 1 — welcome + name + look */}
        {step === 0 && (
          <Step
            mascotColor={c}
            mood="happy"
            title={`Hi! Let's build your first trading bot.`}
            body="It's a little robot that buys and sells one stock for you. We'll use pretend money the whole time, so you can't lose a cent — just learn. What should we call it?"
          >
            <label className="block text-[12px] font-semibold mt-1 mb-1">Bot name</label>
            <input
              value={bot.name}
              onChange={(e) => setBot({ ...bot, name: e.target.value })}
              className="w-full border border-line rounded-lg p-2.5 text-sm"
              placeholder="e.g. Pip"
            />
            <label className="block text-[12px] font-semibold mt-3 mb-1.5">Pick a colour</label>
            <div className="flex gap-2.5">
              {AVATAR_COLORS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setBot({ ...bot, color: a.id })}
                  aria-label={a.label}
                  className="w-9 h-9 rounded-full border-2 flex items-center justify-center"
                  style={{
                    background: a.soft,
                    borderColor: bot.color === a.id ? a.hex : "transparent",
                  }}
                >
                  <span className="w-4 h-4 rounded-full" style={{ background: a.hex }} />
                </button>
              ))}
            </div>
          </Step>
        )}

        {/* STEP 2 — pick a stock */}
        {step === 1 && (
          <Step
            mascotColor={c}
            mood="happy"
            title="What should your bot trade?"
            body="A stock is a tiny slice of a real company — if the company does well, the slice is worth more. Pick one you've heard of. You can always change it later."
          >
            <div className="grid grid-cols-2 gap-2.5">
              {STARTER_TICKERS.map((sym) => {
                const t = TICKERS.find((x) => x.symbol === sym)!;
                const on = bot.symbol === sym;
                return (
                  <button
                    key={sym}
                    onClick={() => setBot({ ...bot, symbol: sym })}
                    className="text-left border-2 rounded-xl px-3 py-2.5"
                    style={{
                      borderColor: on ? c.hex : "#e6eaef",
                      background: on ? c.soft : "#fff",
                    }}
                  >
                    <div className="text-[14px] font-bold">{t.symbol}</div>
                    <div className="text-[11.5px] text-muted">{t.name}</div>
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        {/* STEP 3 — choose instinct (strategy) */}
        {step === 2 && (
          <Step
            mascotColor={c}
            mood="think"
            title="Give your bot an instinct."
            body="Every bot needs a rule for when to buy. Yours will be a trend follower: it waits for the price to start climbing, hops in, and steps out when it cools off. Simple and a great place to start."
          >
            <div className="border-2 rounded-xl px-3.5 py-3 mb-2.5" style={{ borderColor: c.hex, background: c.soft }}>
              <div className="text-[13.5px] font-bold" style={{ color: c.deep }}>
                Trend follower
              </div>
              <div className="text-[12px]" style={{ color: c.deep }}>
                Buys when the trend turns up, sells when it turns down.
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["Buy the dip", "Breakout", "MACD"].map((s) => (
                <div key={s} className="text-center text-[11px] text-muted border border-dashed border-line rounded-lg py-2">
                  🔒 {s}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-2">More instincts unlock as you learn.</p>
          </Step>
        )}

        {/* STEP 4 — tune eagerness + SEE it */}
        {step === 3 && (
          <Step
            mascotColor={c}
            mood="happy"
            title="How eager is your bot?"
            body="Eager bots trade a lot (and rack up little mistakes). Patient bots wait for strong moves. Slide it and watch the green buy / red sell marks — and the trade count — change."
          >
            {dataPending ? (
              <Loading color={c.hex} />
            ) : error ? (
              <ErrorBox msg={error} />
            ) : result ? (
              <>
                <div className="flex justify-between text-[11px] text-muted mb-1">
                  <span>Patient</span>
                  <span>Eager</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={bot.eagerness}
                  onChange={(e) => setBot({ ...bot, eagerness: +e.target.value })}
                  className="w-full accent-brand"
                />
                <p className="text-[12.5px] text-muted mt-1 mb-2">
                  Your bot would make{" "}
                  <span className="font-bold text-ink">{result.overall.tradeCount} trades</span> over this period.
                </p>
                <ChartPanel
                  dates={result.dates}
                  series={priceSeries}
                  markers={result.marks}
                  splitIndex={result.splitIndex}
                  height={220}
                />
              </>
            ) : null}
          </Step>
        )}

        {/* STEP 5 — run it + read the result */}
        {step === 4 && (
          <Step
            mascotColor={c}
            mood="think"
            title="How did your bot do?"
            body="Here's your bot versus simply buying the stock and holding it the whole time. Beating buy-and-hold is genuinely hard — if you didn't, that's normal and worth knowing."
          >
            {dataPending ? (
              <Loading color={c.hex} />
            ) : error ? (
              <ErrorBox msg={error} />
            ) : result ? (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  <Kpi label={bot.name} value={fmtPct(result.overall.totalReturn)} good={result.overall.totalReturn >= 0} />
                  <Kpi label="Buy & hold" value={fmtPct(result.buyHoldReturn)} good={result.buyHoldReturn >= 0} />
                  <Kpi label="Worst drop" value={fmtPct(result.overall.maxDrawdown)} good={false} />
                </div>
                <div className="mt-3">
                  <ChartPanel dates={result.dates} series={equitySeries} splitIndex={result.splitIndex} height={200} />
                </div>
                <p className="text-[12px] text-muted mt-2">
                  {result.overall.totalReturn > result.buyHoldReturn
                    ? "Your bot beat buy-and-hold here. Don't celebrate yet — the real test is next."
                    : "Buy-and-hold won here. Totally normal — most simple bots don't beat it. The next screen shows the most important lesson."}
                </p>
              </>
            ) : null}
          </Step>
        )}

        {/* STEP 6 — honesty check + create */}
        {step === 5 && (
          <Step
            mascotColor={c}
            mood="celebrate"
            title="The honest test."
            body="While you were tuning, we hid the most recent stretch of data (shaded) from your bot. This is the real exam: did it still work on days it never saw? Judge every bot by this number, not the headline."
          >
            {dataPending ? (
              <Loading color={c.hex} />
            ) : error ? (
              <ErrorBox msg={error} />
            ) : result ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <Kpi label={`${bot.name} (unseen)`} value={fmtPct(result.outOfSample.totalReturn)} good={result.outOfSample.totalReturn >= 0} />
                  <Kpi label="Buy & hold (unseen)" value={fmtPct(result.buyHoldOosReturn)} good={result.buyHoldOosReturn >= 0} />
                </div>
                <div className="mt-3">
                  <ChartPanel dates={result.dates} series={equitySeries} splitIndex={result.splitIndex} height={190} />
                </div>
                <div className="mt-3 bg-soft border border-line rounded-xl p-3">
                  <p className="text-[12px] font-semibold mb-2">Meet your bot</p>
                  <BotCard bot={bot} />
                </div>
              </>
            ) : null}
          </Step>
        )}
      </div>

      {/* footer nav */}
      <div className="px-6 py-4 border-t border-line flex items-center justify-between bg-soft">
        <button
          onClick={back}
          disabled={step === 0}
          className="text-[13px] text-muted disabled:opacity-40"
        >
          ← Back
        </button>
        {step < TOTAL - 1 ? (
          <button
            onClick={next}
            className="text-white font-bold text-[14px] rounded-lg px-5 py-2.5"
            style={{ background: c.hex }}
          >
            {step === 0 ? "Let's go" : "Next"}
          </button>
        ) : (
          <button
            onClick={() => onComplete(bot)}
            disabled={!result}
            className="text-white font-bold text-[14px] rounded-lg px-5 py-2.5 disabled:opacity-50"
            style={{ background: c.hex }}
          >
            ✨ Create {bot.name || "my bot"}
          </button>
        )}
      </div>
    </div>
  );
}

function Step({
  mascotColor,
  mood,
  title,
  body,
  children,
}: {
  mascotColor: { hex: string; soft: string };
  mood: "happy" | "think" | "celebrate";
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex gap-3 items-start mb-4">
        <div className="shrink-0">
          <Mascot size={54} color={mascotColor.hex} soft={mascotColor.soft} mood={mood} />
        </div>
        <div>
          <h1 className="text-[18px] font-extrabold leading-tight">{title}</h1>
          <p className="text-[13px] text-muted mt-1 leading-relaxed">{body}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Loading({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted py-6 justify-center">
      <span
        className="w-4 h-4 rounded-full border-2 animate-spin"
        style={{ borderColor: `${color} transparent ${color} transparent` }}
      />
      Loading real prices…
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg p-3 text-sm bg-[#fdecea] border-l-4 border-loss">
      {msg}
      <div className="text-[12px] text-muted mt-1">Check your Alpaca keys in .env.local, then restart the dev server.</div>
    </div>
  );
}

function Kpi({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const color = good === undefined ? "text-ink" : good ? "text-gain" : "text-loss";
  return (
    <div className="bg-soft border border-line rounded-xl px-3 py-2.5">
      <div className="text-[10.5px] text-muted uppercase tracking-wide font-semibold truncate">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
