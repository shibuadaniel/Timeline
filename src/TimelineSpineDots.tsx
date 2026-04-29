import type { ReactNode } from "react";

type AxisLike = {
  scale: (n: number) => number;
};

/** One small dot on the horizontal spine (y = 0) per year that has at least one event. */
export function makeTimelineSpineDots(
  axisYears: readonly number[],
  fill: string
) {
  return function TimelineSpineDots(
    props: Record<string, unknown> | undefined
  ): ReactNode {
    if (!props || axisYears.length === 0) return null;
    const xAxisMap = props.xAxisMap as Record<string, AxisLike> | undefined;
    const yAxisMap = props.yAxisMap as
      | Record<string, { scale: (n: number) => number }>
      | undefined;
    if (!xAxisMap || !yAxisMap) return null;
    const xAxis = Object.values(xAxisMap)[0];
    const yAxis = Object.values(yAxisMap)[0];
    if (!xAxis?.scale || !yAxis?.scale) return null;
    const y0 = yAxis.scale(0);
    if (!Number.isFinite(y0)) return null;

    return (
      <g
        className="timeline-spine-dots"
        pointerEvents="none"
        aria-hidden="true"
      >
        {axisYears.map((year) => {
          const x = xAxis.scale(year);
          if (!Number.isFinite(x)) return null;
          return (
            <circle key={year} cx={x} cy={y0} r={3} fill={fill} />
          );
        })}
      </g>
    );
  };
}
