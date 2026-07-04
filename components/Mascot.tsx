"use client";

type Mood = "happy" | "think" | "celebrate";

export default function Mascot({
  size = 56,
  color = "#7F77DD",
  soft = "#EEEDFE",
  mood = "happy",
}: {
  size?: number;
  color?: string;
  soft?: string;
  mood?: Mood;
}) {
  const mouth =
    mood === "celebrate"
      ? "M18 31 q8 9 16 0"
      : mood === "think"
      ? "M20 34 h12"
      : "M19 33 q7 5 14 0";
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true">
      <rect x="22" y="3" width="8" height="8" rx="4" fill={color} opacity="0.55" />
      <rect x="24.5" y="9" width="3" height="6" fill={color} opacity="0.55" />
      <rect x="9" y="13" width="34" height="28" rx="10" fill={soft} stroke={color} strokeWidth="1.5" />
      <circle cx="20" cy="26" r="3.4" fill={color} />
      <circle cx="32" cy="26" r="3.4" fill={color} />
      <path d={mouth} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="14" y="41" width="24" height="7" rx="3.5" fill={color} opacity="0.32" />
    </svg>
  );
}
