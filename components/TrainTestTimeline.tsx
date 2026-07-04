"use client";

/**
 * Shows, as a single bar, which slice of history the bot LEARNED FROM (in-sample)
 * versus the slice it was TESTED ON but never saw (out-of-sample / unseen).
 */
export default function TrainTestTimeline({
  inStart,
  inEnd,
  outStart,
  outEnd,
  splitFrac,
  folds = 4,
}: {
  inStart?: string;
  inEnd?: string;
  outStart?: string;
  outEnd?: string;
  splitFrac: number; // 0..1, fraction that is in-sample
  folds?: number;
}) {
  const learnPct = Math.round(Math.min(0.92, Math.max(0.4, splitFrac)) * 100);
  return (
    <div>
      <div className="flex h-11 rounded-lg overflow-hidden text-[11px] border border-line">
        <div
          className="flex flex-col justify-center px-3"
          style={{ flexBasis: `${learnPct}%`, flexGrow: 0, flexShrink: 0, background: "#E6F1FB", color: "#0C447C" }}
        >
          <span className="font-bold">Learned from</span>
          <span className="opacity-80">{inStart} → {inEnd}</span>
        </div>
        <div
          className="flex flex-col justify-center px-3 border-l-2 border-dashed"
          style={{ flexGrow: 1, background: "#FAEEDA", color: "#633806", borderColor: "#854F0B" }}
        >
          <span className="font-bold">Tested unseen</span>
          <span className="opacity-80">{outStart} → {outEnd}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted">
        <span className="inline-flex gap-0.5">
          {Array.from({ length: folds }).map((_, i) => (
            <span key={i} className="w-3 h-2 rounded-sm" style={{ background: i % 2 ? "#FAEEDA" : "#E6F1FB", border: "0.5px solid #c2c8d0" }} />
          ))}
        </span>
        Trained across {folds} rolling windows, so a setting only wins if it holds up every time.
      </div>
    </div>
  );
}
