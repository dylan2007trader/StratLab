"use client";

/**
 * Modern illustrated header: layered peaks with a "charted route" climbing to a
 * summit flag, on a calm teal field. Flat-vector, responsive (scales to phone).
 * Title/subtitle overlay bottom-left; optional actions top-right, back top-left.
 */
export default function SceneBanner({
  title,
  subtitle,
  back,
  children,
  height = "h-36 sm:h-40",
  rounded = true,
}: {
  title: string;
  subtitle?: string;
  back?: React.ReactNode;
  children?: React.ReactNode;
  height?: string;
  rounded?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden ${rounded ? "rounded-2xl" : ""} ${height}`}>
      <svg viewBox="0 0 680 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <rect width="680" height="200" fill="#0e5e63" />
        {/* faint contour lines for a "map" feel */}
        <g stroke="#13767c" strokeWidth="1.5" fill="none" opacity="0.5">
          <path d="M0 60 Q170 44 340 56 T680 48" />
          <path d="M0 96 Q200 78 400 90 T680 80" />
        </g>
        {/* layered peaks */}
        <path d="M-20 200 L150 70 L300 200 Z" fill="#13767c" />
        <path d="M220 200 L420 50 L600 200 Z" fill="#1b8d92" />
        <path d="M460 200 L600 96 L740 200 Z" fill="#14787e" />
        {/* snow caps */}
        <path d="M150 70 L130 96 L172 96 Z" fill="#cdeeea" opacity="0.85" />
        <path d="M420 50 L398 82 L444 82 Z" fill="#e2f7f3" opacity="0.9" />
        {/* charted route climbing to a flagged summit */}
        <polyline points="30,168 110,150 170,158 250,120 330,128 400,58" fill="none" stroke="#7fe3d6" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" />
        <g fill="#aef3e8">
          <circle cx="30" cy="168" r="4" /><circle cx="170" cy="158" r="4" /><circle cx="250" cy="120" r="4" /><circle cx="330" cy="128" r="4" />
        </g>
        <g>
          <line x1="400" y1="58" x2="400" y2="40" stroke="#eafffb" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M400 40 L416 45 L400 51 Z" fill="#f08a4b" />
          <circle cx="400" cy="58" r="4.5" fill="#eafffb" />
        </g>
        <circle cx="556" cy="44" r="15" fill="#f3d98c" opacity="0.85" />
      </svg>

      <div className="absolute inset-x-0 bottom-0 h-3/4 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(7,40,42,0.78), rgba(7,40,42,0.22) 55%, transparent)" }} />

      {back && <div className="absolute top-3 left-3">{back}</div>}
      {children && <div className="absolute top-3 right-3 flex flex-wrap gap-2 justify-end max-w-[72%]">{children}</div>}

      <div className="absolute left-4 bottom-3">
        <div className="text-xl sm:text-2xl font-extrabold" style={{ color: "#f3fffd", textShadow: "0 2px 6px rgba(0,0,0,0.45)" }}>{title}</div>
        {subtitle && <div className="text-[12.5px]" style={{ color: "#cdeeea", textShadow: "0 1px 4px rgba(0,0,0,0.45)" }}>{subtitle}</div>}
      </div>
    </div>
  );
}
