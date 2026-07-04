import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Baloo_2 } from "next/font/google";
import "./globals.css";

// Clean, friendly body font.
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

// Chunky, playful display font for headings and big numbers.
const display = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "StratLab — Build & test your trading bot",
  description:
    "Build a trading bot, backtest it on real data, and learn the risk — before you ever use real money.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
