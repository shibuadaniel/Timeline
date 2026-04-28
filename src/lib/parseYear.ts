import type { YearParse } from "../types";

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Collapse Unicode minus and strip commas inside numbers for looser matching. */
function normalizeNumberToken(s: string): string {
  return s.replace(/\u2212/g, "-").replace(/,/g, "");
}

/**
 * Parse plain-text Year from Notion into a signed axis value (BCE → negative).
 * Parenthetical flags (After)/(Before)/(About) are detected but only After/Before affect UI per brief.
 */
export function parseYear(raw: string | null | undefined): YearParse {
  if (raw == null) return { kind: "needs_year" };
  let s = stripHtml(raw).trim();
  if (!s) return { kind: "needs_year" };

  const flags = {
    after: /\(\s*after\s*\)/i.test(s),
    before: /\(\s*before\s*\)/i.test(s),
    about: /\(\s*about\s*\)/i.test(s),
  };

  s = s
    .replace(/\(\s*after\s*\)/gi, " ")
    .replace(/\(\s*before\s*\)/gi, " ")
    .replace(/\(\s*about\s*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  s = normalizeNumberToken(s);

  // Optional leading "c." / "circa"
  s = s.replace(/^(c\.|circa|ca\.)\s+/i, "").trim();

  // Take first integer or simple range "1900–1800 BCE" → first year
  const rangeMatch = s.match(
    /(-?\d+)\s*(?:[-–—]|to)\s*(-?\d+)\s*(BCE|BC|CE|AD)?/i
  );
  const simpleMatch = s.match(/(-?\d+)\s*(BCE|BC|CE|AD)?/i);

  let valueStr: string;
  let eraToken: string | undefined;
  if (rangeMatch) {
    valueStr = rangeMatch[1];
    eraToken = rangeMatch[3];
    if (!eraToken) {
      const tail = s.slice(rangeMatch.index ?? 0 + rangeMatch[0].length).trim();
      const eraM = tail.match(/^(BCE|BC|CE|AD)\b/i);
      if (eraM) eraToken = eraM[1];
    }
  } else if (simpleMatch) {
    valueStr = simpleMatch[1];
    eraToken = simpleMatch[2];
  } else return { kind: "needs_year" };

  const n = Number.parseInt(valueStr, 10);
  if (!Number.isFinite(n)) return { kind: "needs_year" };

  const era = eraToken?.toUpperCase();
  const isBCE = era === "BCE" || era === "BC";
  const isCE = era === "CE" || era === "AD";
  const axisYear = isBCE ? -Math.abs(n) : isCE || era === undefined ? Math.abs(n) : Math.abs(n);

  const displayLabel = raw.replace(/<[^>]+>/g, "").trim();

  return {
    kind: "ok",
    axisYear,
    displayLabel,
    flags,
  };
}
