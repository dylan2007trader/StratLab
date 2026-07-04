// The starter set of real, popular tickers for Layer 0.

export interface Ticker {
  symbol: string;
  name: string;
}

export const TICKERS: Ticker[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "GOOGL", name: "Alphabet (Google)" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "META", name: "Meta" },
  { symbol: "SPY", name: "S&P 500 ETF (SPY)" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF (QQQ)" },
  { symbol: "AMD", name: "AMD" },
];

const ALLOWED = new Set(TICKERS.map((t) => t.symbol));

/** Guard so the API route only ever fetches tickers we intend to support. */
export function isAllowedSymbol(symbol: string): boolean {
  return ALLOWED.has(symbol.toUpperCase());
}
