"use client";

import { useEffect, useRef, useState } from "react";

export interface ChartSeries {
  id: string;
  color: string;
  lineWidth?: number;
  /** One value per date; NaN/null gaps are skipped (e.g. MA warmup). */
  values: (number | null)[];
}

export interface ChartMarker {
  i: number;
  type: "buy" | "sell";
}

export interface ChartGuide {
  value: number;
  color: string;
  title: string;
}

interface Props {
  dates: string[];
  series: ChartSeries[];
  /** Markers are attached to the first series. */
  markers?: ChartMarker[];
  /** Horizontal guide lines (drawn on the first series' scale). */
  guides?: ChartGuide[];
  /** Index where the out-of-sample (unseen) window begins. */
  splitIndex: number;
  height?: number;
  /** Format axis values as percentages instead of prices. */
  asPercent?: boolean;
}

/**
 * A thin wrapper around TradingView's Lightweight Charts. Renders one or more
 * line series with a real date axis, optional buy/sell markers and guide lines,
 * and shades the out-of-sample region with a movable split line drawn as an
 * HTML overlay (kept aligned via the time scale's coordinate mapping).
 */
export default function ChartPanel({
  dates,
  series,
  markers,
  guides,
  splitIndex,
  height = 280,
  asPercent = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitX, setSplitX] = useState<number | null>(null);

  useEffect(() => {
    let chart: any;
    let ro: ResizeObserver | undefined;
    let cancelled = false;

    (async () => {
      const lc = await import("lightweight-charts");
      if (cancelled || !containerRef.current) return;

      chart = lc.createChart(containerRef.current, {
        height,
        layout: {
          background: { type: lc.ColorType.Solid, color: "#ffffff" },
          textColor: "#5d7679",
          fontSize: 11,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: "#eef2f2" },
          horzLines: { color: "#eef2f2" },
        },
        rightPriceScale: { borderColor: "#dde6e6" },
        timeScale: { borderColor: "#dde6e6", fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: lc.CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false,
      });

      const priceFormat = asPercent
        ? { type: "percent" as const }
        : { type: "price" as const, precision: 2, minMove: 0.01 };

      const made = series.map((s, idx) => {
        const ser = chart.addLineSeries({
          color: s.color,
          lineWidth: s.lineWidth ?? 2,
          priceLineVisible: false,
          lastValueVisible: idx === 0,
          priceFormat,
        });
        const data: { time: string; value: number }[] = [];
        for (let i = 0; i < dates.length; i++) {
          const v = s.values[i];
          if (v != null && Number.isFinite(v)) {
            data.push({ time: dates[i], value: v as number });
          }
        }
        ser.setData(data);
        return ser;
      });

      if (markers && made[0]) {
        const ms = markers
          .filter((m) => m.i >= 0 && m.i < dates.length)
          .map((m) => ({
            time: dates[m.i],
            position: m.type === "buy" ? "belowBar" : "aboveBar",
            color: m.type === "buy" ? "#1f8a70" : "#d8534f",
            shape: m.type === "buy" ? "arrowUp" : "arrowDown",
          }));
        made[0].setMarkers(ms);
      }

      if (guides && made[0]) {
        for (const g of guides) {
          made[0].createPriceLine({
            price: g.value,
            color: g.color,
            lineWidth: 1,
            lineStyle: lc.LineStyle.Dashed,
            axisLabelVisible: true,
            title: g.title,
          });
        }
      }

      chart.timeScale().fitContent();

      const updateSplit = () => {
        if (!chart) return;
        const idx = Math.min(Math.max(splitIndex, 0), dates.length - 1);
        const x = chart.timeScale().timeToCoordinate(dates[idx]);
        setSplitX(x == null ? null : (x as number));
      };

      chart.timeScale().subscribeVisibleLogicalRangeChange(updateSplit);

      ro = new ResizeObserver(() => {
        if (!containerRef.current || !chart) return;
        chart.applyOptions({ width: containerRef.current.clientWidth });
        updateSplit();
      });
      ro.observe(containerRef.current);

      chart.applyOptions({ width: containerRef.current.clientWidth });
      updateSplit();
    })();

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (chart) chart.remove();
    };
  }, [dates, series, markers, guides, splitIndex, height, asPercent]);

  // Leave room for the time axis (~26px) so the shading/line don't cover it.
  const axisInset = 26;

  return (
    <div className="relative w-full">
      <div ref={containerRef} className="w-full" />
      {splitX != null && (
        <>
          <div
            className="absolute top-0 pointer-events-none"
            style={{
              left: splitX,
              right: 0,
              bottom: axisInset,
              background: "rgba(133,79,11,0.10)",
            }}
          />
          <div
            className="absolute top-0 pointer-events-none"
            style={{
              left: splitX,
              bottom: axisInset,
              width: 0,
              borderLeft: "2px dashed #b07a2b",
            }}
          />
          <span
            className="absolute pointer-events-none text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ left: splitX + 4, top: 4, background: "#FAEEDA", color: "#633806" }}
          >
            unseen →
          </span>
        </>
      )}
    </div>
  );
}
