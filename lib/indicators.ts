// Technical indicators. NaN marks "not enough data yet" for that index.

/** Simple moving average over `period` bars. */
export function sma(p: number[], period: number): number[] {
  const out: number[] = Array(p.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    sum += p[i];
    if (i >= period) sum -= p[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA at `period-1`. */
export function ema(p: number[], period: number): number[] {
  const out: number[] = Array(p.length).fill(NaN);
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < p.length; i++) {
    if (i < period - 1) {
      seed += p[i];
      continue;
    }
    if (i === period - 1) {
      seed += p[i];
      out[i] = seed / period;
    } else {
      out[i] = p[i] * k + out[i - 1] * (1 - k);
    }
  }
  return out;
}

/** Wilder's RSI over `period` bars (matches the original prototype). */
export function rsi(p: number[], period: number): number[] {
  const out: number[] = Array(p.length).fill(NaN);
  let g = 0;
  let l = 0;
  for (let i = 1; i < p.length; i++) {
    const ch = p[i] - p[i - 1];
    const up = Math.max(ch, 0);
    const dn = Math.max(-ch, 0);
    if (i <= period) {
      g += up;
      l += dn;
      if (i === period) {
        g /= period;
        l /= period;
        out[i] = 100 - 100 / (1 + (l === 0 ? 100 : g / l));
      }
    } else {
      g = (g * (period - 1) + up) / period;
      l = (l * (period - 1) + dn) / period;
      out[i] = 100 - 100 / (1 + (l === 0 ? 100 : g / l));
    }
  }
  return out;
}

/** MACD line (fast EMA − slow EMA) and its signal line (EMA of the MACD). */
export function macd(
  p: number[],
  fast: number,
  slow: number,
  signal: number
): { macd: number[]; signal: number[] } {
  const ef = ema(p, fast);
  const es = ema(p, slow);
  const line = p.map((_, i) => (isNaN(ef[i]) || isNaN(es[i]) ? NaN : ef[i] - es[i]));
  // EMA of the macd line, ignoring the NaN warmup.
  const sig: number[] = Array(p.length).fill(NaN);
  const k = 2 / (signal + 1);
  let started = false;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < line.length; i++) {
    if (isNaN(line[i])) continue;
    if (!started) {
      seedSum += line[i];
      seedCount++;
      if (seedCount === signal) {
        sig[i] = seedSum / signal;
        started = true;
      }
    } else {
      sig[i] = line[i] * k + sig[i - 1] * (1 - k);
    }
  }
  return { macd: line, signal: sig };
}

/** Bollinger bands: SMA middle ± k standard deviations. */
export function bollinger(
  p: number[],
  period: number,
  k: number
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(p, period);
  const upper: number[] = Array(p.length).fill(NaN);
  const lower: number[] = Array(p.length).fill(NaN);
  for (let i = period - 1; i < p.length; i++) {
    let sumSq = 0;
    const mean = middle[i];
    for (let j = i - period + 1; j <= i; j++) sumSq += (p[j] - mean) ** 2;
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mean + k * sd;
    lower[i] = mean - k * sd;
  }
  return { upper, middle, lower };
}

/** Donchian channels: highest high of prior `entry` days, lowest low of prior `exit`. */
export function donchian(
  p: number[],
  entry: number,
  exit: number
): { upper: number[]; lower: number[] } {
  const upper: number[] = Array(p.length).fill(NaN);
  const lower: number[] = Array(p.length).fill(NaN);
  for (let i = 0; i < p.length; i++) {
    if (i >= entry) {
      let hi = -Infinity;
      for (let j = i - entry; j < i; j++) hi = Math.max(hi, p[j]);
      upper[i] = hi;
    }
    if (i >= exit) {
      let lo = Infinity;
      for (let j = i - exit; j < i; j++) lo = Math.min(lo, p[j]);
      lower[i] = lo;
    }
  }
  return { upper, lower };
}
