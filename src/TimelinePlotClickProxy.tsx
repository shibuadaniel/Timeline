import type { PointerEvent, ReactNode } from "react";

/** Fields required for hit-testing and the dense picker (matches ChartPoint). */
export type PlotHitChartPoint = {
  id: string;
  axisYear: number;
  jitterY: number;
  sceneDescription: string;
  yearRaw: string | null;
  pointKind?: "overflow";
  overflowIds?: string[];
};

type AxisLike = {
  scale: (n: number) => number;
};

type OffsetLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Max distance (px) from tap to a dot’s center to count as a hit (touch-friendly). */
const NEAR_MAX_PX = 56;
/** Candidates within this many px of the best distance share a disambiguation menu. */
const TIE_BAND_PX = 12;

function chartPointerToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/**
 * Transparent plot overlay: resolves taps by **nearest** marker within NEAR_MAX_PX.
 * If several markers tie, calls `onDenseCandidates` so the host can show a picker.
 */
export function makeTimelinePlotClickProxy(
  chartData: readonly PlotHitChartPoint[],
  handlers: {
    onPick: (point: PlotHitChartPoint, clientX: number, clientY: number) => void;
    onDenseCandidates: (
      points: PlotHitChartPoint[],
      clientX: number,
      clientY: number
    ) => void;
  }
) {
  return function TimelinePlotClickProxy(
    props: Record<string, unknown> | undefined
  ): ReactNode {
    if (!props) return null;
    const xAxisMap = props.xAxisMap as Record<string, AxisLike> | undefined;
    const yAxisMap = props.yAxisMap as Record<string, AxisLike> | undefined;
    const offset = props.offset as OffsetLike | undefined;

    if (!xAxisMap || !yAxisMap || !offset) return null;
    const xAxis = Object.values(xAxisMap)[0];
    const yAxis = Object.values(yAxisMap)[0];
    if (!xAxis?.scale || !yAxis?.scale) return null;

    const left = offset.left;
    const top = offset.top;
    const w = Number.isFinite(offset.width) ? offset.width : 0;
    const h = Number.isFinite(offset.height) ? offset.height : 0;
    if (w <= 0 || h <= 0) return null;

    const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const loc = chartPointerToSvg(svg, e.clientX, e.clientY);
      if (!loc) return;

      const scored = chartData
        .map((d) => {
          const cx = xAxis.scale(d.axisYear);
          const cy = yAxis.scale(d.jitterY);
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
          const dx = loc.x - cx;
          const dy = loc.y - cy;
          const dist = Math.hypot(dx, dy);
          return { d, dist };
        })
        .filter((x): x is { d: PlotHitChartPoint; dist: number } => x != null);

      if (scored.length === 0) return;

      scored.sort((a, b) => a.dist - b.dist);
      const best = scored[0]!.dist;
      if (best > NEAR_MAX_PX) return;

      e.stopPropagation();

      const ties = scored.filter((s) => s.dist <= best + TIE_BAND_PX);
      const uniq = dedupeById(ties.map((t) => t.d));

      if (uniq.length === 1) {
        handlers.onPick(uniq[0]!, e.clientX, e.clientY);
      } else {
        handlers.onDenseCandidates(uniq, e.clientX, e.clientY);
      }
    };

    return (
      <rect
        className="timeline-plot-hit-proxy"
        x={left}
        y={top}
        width={w}
        height={h}
        fill="transparent"
        pointerEvents="all"
        style={{ cursor: "pointer", touchAction: "manipulation" }}
        onPointerDown={onPointerDown}
        aria-hidden
      />
    );
  };
}

function dedupeById(points: PlotHitChartPoint[]): PlotHitChartPoint[] {
  const seen = new Set<string>();
  const out: PlotHitChartPoint[] = [];
  for (const p of points) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}
