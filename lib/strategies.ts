// Strategy -> desired position (0 = in cash, 1 = fully invested) per bar.

import { sma, rsi, macd, bollinger, donchian } from "./indicators";

/** Moving-average crossover: hold while fast MA is above slow MA. */
export function desiredMA(p: number[], fastP: number, slowP: number): number[] {
  const f = sma(p, fastP);
  const s = sma(p, slowP);
  return p.map((_, i) => (!isNaN(f[i]) && !isNaN(s[i]) && f[i] > s[i] ? 1 : 0));
}

/** RSI mean-reversion: buy when oversold, sell when overbought (stateful). */
export function desiredRSI(p: number[], period: number, os: number, ob: number): number[] {
  const r = rsi(p, period);
  const d: number[] = Array(p.length).fill(0);
  let st = 0;
  for (let i = 0; i < p.length; i++) {
    const v = r[i];
    if (!isNaN(v)) {
      if (st === 0 && v < os) st = 1;
      else if (st === 1 && v > ob) st = 0;
    }
    d[i] = st;
  }
  return d;
}

/** MACD trend: hold while the MACD line is above its signal line. */
export function desiredMACD(p: number[], fast: number, slow: number, signal: number): number[] {
  const m = macd(p, fast, slow, signal);
  return p.map((_, i) =>
    !isNaN(m.macd[i]) && !isNaN(m.signal[i]) && m.macd[i] > m.signal[i] ? 1 : 0
  );
}

/** Bollinger reversion: buy below the lower band, sell above the upper (stateful). */
export function desiredBollinger(p: number[], period: number, k: number): number[] {
  const b = bollinger(p, period, k);
  const d: number[] = Array(p.length).fill(0);
  let st = 0;
  for (let i = 0; i < p.length; i++) {
    if (!isNaN(b.lower[i]) && !isNaN(b.upper[i])) {
      if (st === 0 && p[i] < b.lower[i]) st = 1;
      else if (st === 1 && p[i] > b.upper[i]) st = 0;
    }
    d[i] = st;
  }
  return d;
}

/** Donchian breakout: buy on a new N-day high, exit on a new M-day low (stateful). */
export function desiredBreakout(p: number[], entry: number, exit: number): number[] {
  const ch = donchian(p, entry, exit);
  const d: number[] = Array(p.length).fill(0);
  let st = 0;
  for (let i = 0; i < p.length; i++) {
    if (st === 0 && !isNaN(ch.upper[i]) && p[i] >= ch.upper[i]) st = 1;
    else if (st === 1 && !isNaN(ch.lower[i]) && p[i] <= ch.lower[i]) st = 0;
    d[i] = st;
  }
  return d;
}

/** Buy-the-dip: only while above the long SMA (uptrend), buy when price dips below
 *  the short SMA; sell when it pops back above it or the uptrend breaks. */
export function desiredDip(p: number[], long: number, short: number): number[] {
  const lng = sma(p, long);
  const sht = sma(p, short);
  const d: number[] = Array(p.length).fill(0);
  let st = 0;
  for (let i = 0; i < p.length; i++) {
    if (!isNaN(lng[i]) && !isNaN(sht[i])) {
      const uptrend = p[i] > lng[i];
      if (st === 0 && uptrend && p[i] < sht[i]) st = 1;
      else if (st === 1 && (!uptrend || p[i] > sht[i])) st = 0;
    }
    d[i] = st;
  }
  return d;
}
