# StratLab

An education-first platform where you build, name, and train automated stock-trading
**bots**, backtest them on real historical data, and learn *why* most strategies don't
beat buy-and-hold. Honesty over hype — the app is designed to show you how fragile an
"edge" really is, not to sell you one.

Paper trading only. StratLab never places real trades or connects to a brokerage account.

<img width="500" height="500" alt="Screenshot 2026-07-08 094228" src="https://github.com/user-attachments/assets/6866f6f0-cd3a-4063-b73e-8f207c1abff5" />
<img width="500" height="500" alt="Screenshot 2026-07-08 094050" src="https://github.com/user-attachments/assets/386850ca-c2a6-4307-8f27-da4a7aeddac9" />
<img width="400" height="500" alt="Screenshot 2026-07-08 094211" src="https://github.com/user-attachments/assets/cab0a8a4-1350-4a0f-8d2d-40a63d6f24e7" />



## What it does

- **Build a bot** — pick a real stock, choose a strategy (moving-average, RSI, or a
  fused combination), and tune its dials.
- **Train it** — run a multi-phase training loop that gets more powerful as your bot
  levels up:
  - **Scan** — broad walk-forward search across the parameter space
  - **Evolve** — breed and hill-climb the best settings over generations
  - **Stress** — Monte-Carlo resample the finalists and keep the robust one
  - **Generalize** — field-test the winner on other stocks to see if the edge travels
- **Get honest results** — every run reports in-sample vs. out-of-sample performance,
  an overfit "haircut," robustness stats, and a Monte-Carlo distribution — so you can
  see whether the result is real or just curve-fit.
- **Progress** — bots gain XP, level up, and unlock the more advanced training phases.

## Architecture

- **All backtest and training math runs client-side** (`lib/`), so it's free and scales
  per user with no server compute cost.
- **The server only fetches + caches price data** via `/api/bars`, which calls Alpaca
  with secret keys that **never reach the browser**. Historical daily data is immutable,
  so responses are edge-cached for a day and Alpaca is barely hit.
- **Accounts and saved bots** are persisted with Supabase.

## Tech stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · Lightweight Charts ·
Supabase (auth + storage) · Alpaca market data · Vitest · Vercel.

## Getting started

**Prerequisites:** Node.js 18+

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Add your Alpaca keys.** Copy `.env.example` to `.env.local` and paste your Alpaca
   **paper** keys:
   ```
   ALPACA_API_KEY_ID=PK...
   ALPACA_API_SECRET_KEY=...
   ```
   These are read only on the server. `.env.local` is gitignored — never commit it.

3. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000, pick a stock, build a bot, and hit **Train**.

## Testing

```bash
npm test
```

The suite (Vitest) has **21 tests** across two areas:

- **`lib/backtest.test.ts`** — validates the backtest engine and technical indicators,
  including accounting parity with the original prototype.
- **`lib/trainRun.test.ts`** — validates the training engine's decision-making logic:
  the parameter-space search, level-gated phase unlocks (Scan → Evolve → Stress →
  Generalize), walk-forward folds, Monte-Carlo robustness, and XP/leveling.

## Roadmap

Public out-of-sample leaderboard · expanded education section · larger strategy library ·
live paper trading via Alpaca. Built one layer at a time.

## Author

Dylan Ackerman · [LinkedIn](https://www.linkedin.com/in/dylan-ackerman-2015a638a/) · dackerm2007@gmail.com
