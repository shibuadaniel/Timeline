import type { ReactNode } from "react";

type AxisLike = {
  scale: ((n: number) => number) & { domain?: () => number[] };
};

const BAND_WHITE = "#ffffff";
/** Barely off-white so stripes stay very subtle next to pure white. */
const BAND_GRAY = "#fafafa";

function bandEdges(
  domainLo: number,
  domainHi: number,
  tickYears: readonly number[]
): number[] {
  const lo = Math.min(domainLo, domainHi);
  const hi = Math.max(domainLo, domainHi);
  const inner = tickYears.filter((t) => t >= lo && t <= hi);
  return [...new Set([lo, ...inner, hi])].sort((a, b) => a - b);
}

/** Vertical stripes between consecutive time markers (and domain edges). */
export function makeTimelineAlternatingBands(tickYears: readonly number[]) {
  return function TimelineAlternatingBands(
    props: Record<string, unknown> | undefined
  ): ReactNode {
    if (!props) return null;
    const xAxisMap = props.xAxisMap as Record<string, AxisLike> | undefined;
    const yAxisMap = props.yAxisMap as
      | Record<string, AxisLike>
      | undefined;
    const offset = props.offset as
      | { top?: number; left?: number; width?: number; height?: number }
      | undefined;

    if (!xAxisMap || !yAxisMap) return null;
    const xAxis = Object.values(xAxisMap)[0];
    const yAxis = Object.values(yAxisMap)[0];
    if (!xAxis?.scale || !yAxis?.scale) return null;

    const domX = xAxis.scale.domain?.() ?? [];
    const d0 = Number(domX[0]);
    const d1 = Number(domX[1]);
    if (!Number.isFinite(d0) || !Number.isFinite(d1)) return null;

    let top: number;
    let height: number;
    if (
      offset &&
      typeof offset.top === "number" &&
      typeof offset.height === "number" &&
      offset.height > 0
    ) {
      top = offset.top;
      height = offset.height;
    } else {
      const domY = yAxis.scale.domain?.() ?? [];
      const y0n = Number(domY[0]);
      const y1n = Number(domY[1]);
      if (!Number.isFinite(y0n) || !Number.isFinite(y1n)) return null;
      const yLo = Math.min(y0n, y1n);
      const yHi = Math.max(y0n, y1n);
      const pTop = yAxis.scale(yHi);
      const pBot = yAxis.scale(yLo);
      if (!Number.isFinite(pTop) || !Number.isFinite(pBot)) return null;
      top = Math.min(pTop, pBot);
      height = Math.abs(pBot - pTop);
    }

    const edges = bandEdges(d0, d1, tickYears);
    if (edges.length < 2) return null;

    const rects: ReactNode[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const x1 = xAxis.scale(edges[i]);
      const x2 = xAxis.scale(edges[i + 1]);
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) continue;
      const rx = Math.min(x1, x2);
      const rw = Math.abs(x2 - x1);
      if (rw < 0.25) continue;
      const fill = i % 2 === 0 ? BAND_WHITE : BAND_GRAY;
      rects.push(
        <rect
          key={`band-${edges[i]}-${edges[i + 1]}`}
          x={rx}
          y={top}
          width={rw}
          height={height}
          fill={fill}
          pointerEvents="none"
        />
      );
    }

    return (
      <g
        className="timeline-alternating-bands"
        pointerEvents="none"
        aria-hidden="true"
      >
        {rects}
      </g>
    );
  };
}
