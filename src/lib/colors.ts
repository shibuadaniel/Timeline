export const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#c026d3",
  "#ea580c",
  "#0891b2",
  "#ca8a04",
  "#4f46e5",
  "#be123c",
  "#0f766e",
  "#65a30d",
  "#7c3aed",
  "#b45309",
];

/** Stable index from string (FNV-1a-ish small). */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function locationColor(key: string, palette = PALETTE): string {
  if (!key) return "#64748b";
  return palette[hashString(key) % palette.length];
}

/** Order locations by frequency (desc), cap legend size; rest → Other. */
export function buildLocationBuckets(
  locations: string[],
  maxDistinct = 10
): { ordered: string[]; otherLabel: string } {
  const counts = new Map<string, number>();
  for (const loc of locations) {
    counts.set(loc, (counts.get(loc) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const ordered = sorted.slice(0, maxDistinct).map(([k]) => k);
  return { ordered, otherLabel: "Other" };
}

export function primaryLocationColor(
  primary: string,
  ordered: string[],
  otherLabel: string,
  palette = PALETTE
): { fill: string; legendKey: string } {
  if (!primary) return { fill: "#64748b", legendKey: "—" };
  if (ordered.includes(primary)) {
    const idx = ordered.indexOf(primary);
    return { fill: palette[idx % palette.length], legendKey: primary };
  }
  return { fill: "#94a3b8", legendKey: otherLabel };
}
