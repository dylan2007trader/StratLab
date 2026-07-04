import { NextRequest, NextResponse } from "next/server";
import { fetchDailyBars } from "@/lib/alpaca";
import { isAllowedSymbol } from "@/lib/tickers";

// Cache the route response at the edge for a day; historical daily data is
// immutable, so after the first fetch each ticker is served from cache and we
// effectively stop calling Alpaca. Keeps cost near zero.
export const revalidate = 86400;

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "")
    .trim()
    .toUpperCase();

  // Training can request deeper history (older market regimes); clamp 1 to 15y.
  const yearsRaw = parseInt(req.nextUrl.searchParams.get("years") || "5", 10);
  const years = Number.isFinite(yearsRaw) ? Math.min(15, Math.max(1, yearsRaw)) : 5;

  if (!symbol) {
    return NextResponse.json({ error: "Missing ?symbol" }, { status: 400 });
  }
  if (!isAllowedSymbol(symbol)) {
    return NextResponse.json(
      { error: `Symbol "${symbol}" is not in the supported list.` },
      { status: 400 }
    );
  }

  try {
    const bars = await fetchDailyBars(symbol, years);
    if (bars.length === 0) {
      return NextResponse.json(
        { error: `No data returned for ${symbol}.` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { symbol, bars },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Don't leak internals to the client; log server-side instead.
    console.error("[/api/bars]", message);
    return NextResponse.json(
      { error: "Failed to fetch price data. Check server logs / API keys." },
      { status: 502 }
    );
  }
}
