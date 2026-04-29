/**
 * Year values every `step` from the first multiple of `step` at/below `minYear`
 * through the last multiple at/above `maxYear` (inclusive).
 */
export function yearStepTicks(
  minYear: number,
  maxYear: number,
  step: number
): number[] {
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear) || step <= 0) {
    return [];
  }
  const lo = Math.min(minYear, maxYear);
  const hi = Math.max(minYear, maxYear);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let y = start; y <= end; y += step) {
    ticks.push(y);
  }
  return ticks;
}
