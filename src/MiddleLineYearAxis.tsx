import type { ReactNode } from "react";

type AxisLike = {
  scale: ((n: number) => number) & {
    ticks?: (count: number) => number[];
    domain?: () => number[];
  };
  tickCount?: number;
  ticks?: unknown[];
  niceTicks?: unknown[];
};

function asNumberList(raw: unknown[] | undefined): number[] {
  if (!raw?.length) return [];
  return raw
    .map((t) => (typeof t === "number" ? t : Number(t)))
    .filter((t) => Number.isFinite(t));
}

/** Recharts puts auto number ticks in `niceTicks`; `ticks` is often user override. */
function extractTickValues(xAxis: AxisLike): number[] {
  const userTicks = asNumberList(xAxis.ticks as unknown[] | undefined);
  if (userTicks.length > 0) return userTicks;

  const nice = asNumberList(xAxis.niceTicks);
  if (nice.length > 0) return nice;

  const n = xAxis.tickCount ?? 6;
  if (typeof xAxis.scale.ticks === "function") {
    return xAxis.scale.ticks(n).filter((t) => Number.isFinite(t));
  }

  const d = xAxis.scale.domain?.() ?? [];
  return d.filter((t) => typeof t === "number" && Number.isFinite(t));
}

function formatYearLabel(value: number): string {
  if (value < 0) return `${Math.abs(value)} BCE`;
  return String(value);
}

/** Year scale: slate dot on the spine (y = 0), label tucked just above (minimal vertical footprint). */
const TICK_DOT_R = 2.5;
/** Gap from dot top to label (text uses dominantBaseline middle, ~half an 11px em). */
const LABEL_GAP_PX = 3;
const LABEL_TEXT_HALF_PX = 6;
const TICK_DOT_FILL = "#64748b";

export function MiddleLineYearAxis(
  props: Record<string, unknown> | undefined
): ReactNode {
  if (!props) return null;
  const xAxisMap = props.xAxisMap as Record<string, AxisLike> | undefined;
  const yAxisMap = props.yAxisMap as
    | Record<string, { scale: (n: number) => number }>
    | undefined;

  if (!xAxisMap || !yAxisMap) return null;
  const xAxisRaw = Object.values(xAxisMap)[0];
  const yAxis = Object.values(yAxisMap)[0];
  if (!xAxisRaw?.scale || !yAxis?.scale) return null;

  const tickValues = extractTickValues(xAxisRaw);
  if (tickValues.length === 0) return null;

  const y0 = yAxis.scale(0);
  if (!Number.isFinite(y0)) return null;

  const yText =
    y0 - TICK_DOT_R - LABEL_GAP_PX - LABEL_TEXT_HALF_PX;

  return (
    <g className="middle-line-year-axis" pointerEvents="none" aria-hidden="true">
      {tickValues.map((tick) => {
        const x = xAxisRaw.scale(tick);
        if (!Number.isFinite(x)) return null;
        const label = formatYearLabel(tick);
        return (
          <g key={`${tick}`}>
            <circle
              cx={x}
              cy={y0}
              r={TICK_DOT_R}
              fill={TICK_DOT_FILL}
            />
            <text
              x={x}
              y={yText}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#475569"
              fontSize={11}
              fontWeight={500}
              stroke="#f8fafc"
              strokeWidth={4}
              paintOrder="stroke fill"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
