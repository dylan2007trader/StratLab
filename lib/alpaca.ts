// SERVER-ONLY. Fetches historical daily bars from Alpaca and normalizes them.
// This module reads secret keys from the environment and must never be imported
// into a client component. The "server-only" import enforces that at build time.
import "server-only";

import { Bar } from "./types";

const DEFAULT_BASE_URL = "https://data.alpaca.markets/v2";

interface AlpacaBar {
  t: string; // RFC-3339 timestamp
  o: number; // open
  c: number; // close
}

interface AlpacaBarsResponse {
  bars: Record<string, AlpacaBar[] | undefined> | null;
  next_page_token: string | null;
}

/** Yesterday in YYYY-MM-DD (UTC). Daily bars only need data up to yesterday,
 *  which sidesteps the free-tier 15-minute delay entirely. */
function endDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Start date `years` back from today, YYYY-MM-DD (UTC). */
function startDate(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch split/dividend-adjusted daily closes for one symbol, following
 * pagination. Returns bars sorted ascending by date.
 */
export async function fetchDailyBars(
  symbol: string,
  years = 5
): Promise<Bar[]> {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secret) {
    throw new Error(
      "Missing Alpaca credentials. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in .env.local."
    );
  }

  const baseUrl = process.env.ALPACA_DATA_BASE_URL || DEFAULT_BASE_URL;
  const feed = process.env.ALPACA_FEED || "iex";
  const start = startDate(years);
  const end = endDate();

  const headers = {
    "APCA-API-KEY-ID": keyId,
    "APCA-API-SECRET-KEY": secret,
    accept: "application/json",
  };

  const out: Bar[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      symbols: symbol,
      timeframe: "1Day",
      start,
      end,
      adjustment: "all",
      feed,
      limit: "10000",
      sort: "asc",
    });
    if (pageToken) params.set("page_token", pageToken);

    const res = await fetch(`${baseUrl}/stocks/bars?${params.toString()}`, {
      headers,
      // Cache immutable historical data aggressively (re-fetch ~daily).
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Alpaca request failed (${res.status}). ${body.slice(0, 300)}`
      );
    }

    const json = (await res.json()) as AlpacaBarsResponse;
    const bars = json.bars?.[symbol] ?? [];
    for (const b of bars) {
      out.push({ t: b.t.slice(0, 10), c: b.c, o: b.o });
    }
    pageToken = json.next_page_token;
  } while (pageToken);

  return out;
}
