import { useId } from "react";
export function Wordmark() {
  return (
    <span className="wordmark" aria-label="Quantum QLi">
      Quantum QLi
    </span>
  );
}
export function Geometry({ compact = false }: { compact?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 600 540"
      fill="none"
      className={compact ? "geometry-glyph" : "geometry-mark"}
      aria-label="Quantum QLi geometric construction"
      role="img"
    >
      <defs>
        <clipPath id={id}>
          <circle cx="300" cy="248" r="205" />
        </clipPath>
      </defs>
      <g stroke="currentColor" strokeWidth={compact ? 5 : 0.9}>
        <circle cx="300" cy="248" r="205" />
        <g clipPath={`url(#${id})`}>
          <path d="M95 43H505V453H95Z M95 200H350V453 M350 200H505V355H350Z M350 355H446V453 M446 355H505V414H446Z M446 414H483V453 M483 414H505V436H483Z M483 436H497V453" />
          <path d="M95 453A410 410 0 0 1 505 43 M95 200A255 255 0 0 1 350 453 M350 200A155 155 0 0 1 505 355 M350 355A96 96 0 0 1 446 453 M446 355A59 59 0 0 1 505 414 M446 414A37 37 0 0 1 483 453" />
          {!compact && (
            <g opacity=".42">
              {[-500, -300, -150, 0, 120, 240, 360, 480, 600, 750, 950, 1200].map((x) => (
                <path key={x} d={`M410 296L${x} 540`} />
              ))}
              {[305, 318, 338, 366, 407, 465, 530].map((y) => (
                <path key={y} d={`M0 ${y}H600`} />
              ))}
            </g>
          )}
        </g>
      </g>
      {!compact && (
        <g fill="currentColor">
          <circle cx="190" cy="386" r="3" />
          <path d="M187 392Q190 389 193 392L195 405H192L193 420H190L188 405L187 420H184L185 405H183Z" />
        </g>
      )}
      {!compact && (
        <g className="geometry-labels" fill="currentColor">
          <text x="98" y="32">
            φ = 1.6180339887
          </text>
          <text x="447" y="477">
            PROOF BY DESIGN
          </text>
          <text x="278" y="246">
            0
          </text>
        </g>
      )}
    </svg>
  );
}
export function Sparkline({ points, className = "" }: { points: number[]; className?: string }) {
  return (
    <svg
      className={`sparkline ${className}`}
      viewBox="0 0 240 70"
      preserveAspectRatio="none"
      aria-label="Simulated liquidity trend"
    >
      <path d="M0 55H240" className="chart-threshold" />
      <polyline
        points={points
          .map((p, i) => `${(i * 240) / (points.length - 1)},${70 - p * 0.65}`)
          .join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
