"use client";

/** A small hover/tap info bubble for explaining a stat or term in plain English. */
export default function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group align-middle ml-1">
      <span
        tabIndex={0}
        aria-label={text}
        className="cursor-help text-[10px] w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-muted text-muted font-bold leading-none"
      >
        i
      </span>
      <span className="pointer-events-none invisible group-hover:visible group-focus-within:visible absolute z-30 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-52 bg-ink text-white text-[11px] leading-snug rounded-lg p-2 shadow-xl text-left font-normal normal-case tracking-normal">
        {text}
      </span>
    </span>
  );
}
