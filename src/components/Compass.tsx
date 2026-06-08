// Horizontal compass ribbon, like GeoGuessr's. Shows the cardinal points and
// degree ticks scrolling as the camera rotates. `heading` is the live POV
// heading in degrees (0 = North, clockwise), read from the Street View panorama.

interface CompassProps {
  heading: number;
}

const CARDINALS: { deg: number; label: string }[] = [
  { deg: 0, label: "N" },
  { deg: 45, label: "NE" },
  { deg: 90, label: "E" },
  { deg: 135, label: "SE" },
  { deg: 180, label: "S" },
  { deg: 225, label: "SW" },
  { deg: 270, label: "W" },
  { deg: 315, label: "NW" },
];

// Degrees visible across the full width of the bar. Wider = more zoomed out.
const FOV = 140;

// Signed shortest angular distance from `heading` to `deg`, in [-180, 180].
function delta(deg: number, heading: number): number {
  return ((deg - heading + 540) % 360) - 180;
}

// Map an angular delta to a horizontal position (% from the left edge). The
// center of the bar (50%) is whatever the camera currently faces.
function toPercent(d: number): number {
  return 50 + (d / FOV) * 100;
}

const TICKS = Array.from({ length: 360 / 15 }, (_, i) => i * 15);

export default function Compass({ heading }: CompassProps) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div className="relative h-7 w-44 sm:w-60 overflow-hidden rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 shadow-lg">
        {/* Degree ticks */}
        {TICKS.map((deg) => {
          const d = delta(deg, heading);
          if (Math.abs(d) > FOV / 2 + 6) return null;
          const isMajor = deg % 45 === 0;
          return (
            <div
              key={`tick-${deg}`}
              className={`absolute top-0 w-px -translate-x-1/2 ${
                isMajor ? "h-2.5 bg-white/40" : "h-1.5 bg-white/20"
              }`}
              style={{ left: `${toPercent(d)}%` }}
            />
          );
        })}

        {/* Cardinal labels */}
        {CARDINALS.map(({ deg, label }) => {
          const d = delta(deg, heading);
          if (Math.abs(d) > FOV / 2 + 4) return null;
          return (
            <div
              key={label}
              className={`absolute bottom-0 -translate-x-1/2 text-[11px] font-bold leading-tight tabular-nums ${
                label === "N" ? "text-red-400" : "text-white/80"
              }`}
              style={{ left: `${toPercent(d)}%` }}
            >
              {label}
            </div>
          );
        })}

        {/* Center indicator: the direction currently faced */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-yellow-400/90" />
      </div>
    </div>
  );
}
