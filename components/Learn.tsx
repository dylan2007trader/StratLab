"use client";

import SceneBanner from "./SceneBanner";

const LESSONS: { q: string; a: string }[] = [
  {
    q: "Why is the “unseen” score the one that matters?",
    a: "It's easy to tune a bot until the past looks amazing — but that often just memorizes old noise. We hide the most recent stretch of data while you build, then test on it. If a bot does great before that line and falls apart after it, that's overfitting, and the unseen score exposes it.",
  },
  {
    q: "What is overfitting?",
    a: "Tweaking settings until they fit history perfectly, in a way that won't repeat. A bot with 8 dials can always be bent to flatter the past. Training here fights this by only keeping settings that hold up across several different unseen windows.",
  },
  {
    q: "Win rate is NOT profit",
    a: "A bot can win 70% of its trades and still lose money if the 30% of losers are bigger than the winners. Always check “avg / trade” (expectancy), not just win rate.",
  },
  {
    q: "What's max drawdown?",
    a: "The worst peak-to-bottom drop along the way. A bot that ends +40% but fell 50% in the middle is one most people would panic-sell. Drawdown is the pain you'd have to sit through.",
  },
  {
    q: "The honest baseline: buy & hold",
    a: "Compare every bot to simply buying the stock and holding it. Most strategies don't beat that after you account for risk — and learning that is the point, not a failure.",
  },
  {
    q: "What do stop-loss and take-profit do?",
    a: "A stop-loss sells a trade once it falls a set % below where you bought — it caps the damage. A take-profit sells once it rises a set % — it locks in a win. Both change how a bot behaves, so training tunes them too.",
  },
  {
    q: "What is position size?",
    a: "How much of your cash the bot commits per trade. Smaller sizes mean smaller swings (and smaller gains). It's a risk dial, not just a profit dial.",
  },
  {
    q: "Backtest vs. forward (paper) trading",
    a: "A backtest scores the past. Forward paper-trading runs the frozen bot on brand-new days as they arrive — money it could never have been tuned on. It's the most honest test of all, which is why live bots rank on it.",
  },
];

export default function Learn({ onBack }: { onBack: () => void }) {
  return (
    <main className="max-w-2xl mx-auto my-6">
      <SceneBanner
        title="Field guide"
        subtitle="The ideas behind honest bot-building, in plain English."
        back={<button onClick={onBack} className="bg-black/30 text-cream text-[12.5px] rounded-lg px-3 py-1.5">← Back</button>}
      />

      <div className="mt-4 space-y-2.5">
        {LESSONS.map((l, i) => (
          <details key={i} className="bg-white border border-line rounded-xl px-4 py-3" open={i === 0}>
            <summary className="font-semibold text-[14px] cursor-pointer">{l.q}</summary>
            <p className="text-[13px] text-[#3a4654] mt-2 leading-relaxed">{l.a}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
