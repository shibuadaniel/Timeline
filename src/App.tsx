import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Customized,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";
import { MiddleLineYearAxis } from "./MiddleLineYearAxis";
import {
  buildLocationBuckets,
  PALETTE,
  primaryLocationColor,
} from "./lib/colors";
import { parseYear } from "./lib/parseYear";
import type { PlottedScene, SceneDTO, SnapshotV1 } from "./types";

const FLAG_ABOUT_STYLE = { opacity: 0.55 };

function flagSuffix(flags: { after: boolean; before: boolean; about: boolean }) {
  const parts: string[] = [];
  if (flags.after) parts.push("After");
  if (flags.before) parts.push("Before");
  if (flags.about) parts.push("About");
  if (!parts.length) return "";
  return ` (${parts.join(", ")})`;
}

export default function App() {
  const [scenes, setScenes] = useState<SceneDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locFilter, setLocFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [popupViewportPos, setPopupViewportPos] = useState<{ left: number; top: number } | null>(null);
  const chartCardRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshotUrl = `${import.meta.env.BASE_URL}data/latest.json`;
      const r = await fetch(snapshotUrl, { cache: "no-store" });
      const data = (await r.json()) as SnapshotV1 & { error?: string };
      if (!r.ok) {
        setError(data.error ?? r.statusText);
        setScenes(null);
        return;
      }
      setScenes(data.records ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setScenes(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".click-popup")) return;
      if (target.closest(".timeline-dot")) return;
      setSelectedSceneId(null);
      setPopupPos(null);
      setPopupViewportPos(null);
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, []);

  const { plottedRaw, needsYear } = useMemo(() => {
    if (!scenes)
      return { plottedRaw: [] as PlottedScene[], needsYear: [] as SceneDTO[] };
    const ok: PlottedScene[] = [];
    const bad: SceneDTO[] = [];
    for (const scene of scenes) {
      const p = parseYear(scene.yearRaw);
      if (p.kind !== "ok") {
        bad.push(scene);
        continue;
      }
      const primary = scene.locations[0] ?? "";
      ok.push({
        ...scene,
        parse: p,
        primaryLocation: primary,
      });
    }
    bad.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    return { plottedRaw: ok, needsYear: bad };
  }, [scenes]);

  const { ordered, otherLabel } = useMemo(() => {
    const locs = plottedRaw.map((p) => p.primaryLocation).filter(Boolean);
    return buildLocationBuckets(locs, 12);
  }, [plottedRaw]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of plottedRaw) {
      for (const l of p.locations) set.add(l);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [plottedRaw]);

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of plottedRaw) {
      for (const s of p.onStage) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [plottedRaw]);

  const plotted = useMemo(() => {
    return plottedRaw.filter((p) => {
      if (locFilter !== "all") {
        if (!p.locations.includes(locFilter)) return false;
      }
      if (stageFilter !== "all") {
        if (!p.onStage.includes(stageFilter)) return false;
      }
      return true;
    });
  }, [plottedRaw, locFilter, stageFilter]);

  const chartData = useMemo(() => {
    const rowStep = 24;
    const orderedPlotted = [...plotted].sort((a, b) => {
      const sa = a.sequence ?? 0;
      const sb = b.sequence ?? 0;
      if (sa !== sb) return sa - sb;
      return a.sceneDescription.localeCompare(b.sceneDescription);
    });
    const yearBuckets = new Map<number, number>();
    return orderedPlotted.map((p) => {
      const jitterN = yearBuckets.get(p.parse.axisYear) ?? 0;
      yearBuckets.set(p.parse.axisYear, jitterN + 1);
      const tier = Math.floor(jitterN / 2) + 1;
      const sign = jitterN % 2 === 0 ? 1 : -1;
      const jitterY = sign * tier * rowStep;
      const { fill, legendKey } = primaryLocationColor(
        p.primaryLocation,
        ordered,
        otherLabel,
        PALETTE
      );
      return {
        id: p.id,
        axisYear: p.parse.axisYear,
        jitterY,
        fill,
        legendKey,
        sceneDescription: p.sceneDescription,
        yearRaw: p.yearRaw,
        flags: p.parse.flags,
        locations: p.locations,
        onStage: p.onStage,
        sequence: p.sequence,
        sourceUrl: p.sourceUrl,
        url: p.url,
      };
    });
  }, [plotted, ordered, otherLabel]);

  const legendItems = useMemo(() => {
    const items = ordered.map((loc, i) => ({
      key: loc,
      color: PALETTE[i % PALETTE.length],
    }));
    if (plottedRaw.some((p) => p.primaryLocation && !ordered.includes(p.primaryLocation))) {
      items.push({ key: otherLabel, color: "#94a3b8" });
    }
    return items;
  }, [ordered, otherLabel, plottedRaw]);

  const hasShownAbout = chartData.some((d) => d.flags.about);
  const selectedScene = selectedSceneId
    ? chartData.find((d) => d.id === selectedSceneId) ?? null
    : null;

  useLayoutEffect(() => {
    if (!selectedScene || !popupPos || !chartCardRef.current || !popupRef.current) {
      setPopupViewportPos(null);
      return;
    }

    const compute = () => {
      const margin = 8;
      const offset = 10;
      const cardRect = chartCardRef.current!.getBoundingClientRect();
      const popupRect = popupRef.current!.getBoundingClientRect();

      let left = cardRect.left + popupPos.x + offset;
      let top = cardRect.top + popupPos.y + offset;

      if (left + popupRect.width > window.innerWidth - margin) {
        left = cardRect.left + popupPos.x - popupRect.width - offset;
      }
      if (top + popupRect.height > window.innerHeight - margin) {
        top = cardRect.top + popupPos.y - popupRect.height - offset;
      }

      left = Math.max(margin, Math.min(left, window.innerWidth - popupRect.width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - popupRect.height - margin));

      setPopupViewportPos((prev) => {
        if (prev && prev.left === left && prev.top === top) return prev;
        return { left, top };
      });
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [selectedScene, popupPos]);

  return (
    <div className="app">
      <h1>Bible events timeline</h1>
      <p className="sub">
        Public timeline reads from a pre-ingested snapshot. Re-run ingest after
        editing source rows in Notion.
      </p>

      <div className="toolbar">
        <div>
          <label htmlFor="loc">Location</label>
          <select
            id="loc"
            value={locFilter}
            onChange={(e) => setLocFilter(e.target.value)}
            disabled={!scenes?.length}
          >
            <option value="all">All</option>
            {locationOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="st">On stage</label>
          <select
            id="st"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            disabled={!scenes?.length}
          >
            <option value="all">All</option>
            {stageOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Reload snapshot"}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="layout">
        <div className="chart-card" ref={chartCardRef}>
          <p className="chart-head">Timeline (Year → horizontal position)</p>
          {chartData.length === 0 ? (
            <p className="muted">
              {scenes === null
                ? "Run `npm run ingest:notion` first, then reload this page."
                : "No plotted scenes — adjust filters or fix years in Notion."}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{ top: 16, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="axisYear"
                  name="Year"
                  hide
                />
                <YAxis
                  type="number"
                  dataKey="jitterY"
                  hide
                  domain={["dataMin - 28", "dataMax + 28"]}
                />
                <ReferenceLine
                  y={0}
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                />
                <Customized component={MiddleLineYearAxis} />
                <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  active={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof chartData)[number];
                    const flagStr = flagSuffix(d.flags);
                    return (
                      <div className="tooltip-box">
                        <div className="tooltip-title">{d.sceneDescription}</div>
                        <div>
                          <strong>Year:</strong> {d.yearRaw}
                          {flagStr ? (
                            <span
                              className="flags"
                              style={
                                d.flags.about ? FLAG_ABOUT_STYLE : undefined
                              }
                            >
                              {flagStr}
                            </span>
                          ) : null}
                        </div>
                        <div>
                          <strong>Location:</strong>{" "}
                          {d.locations.length ? d.locations.join(", ") : "—"}
                        </div>
                        <div>
                          <strong>On stage:</strong>{" "}
                          {d.onStage.length ? d.onStage.join(", ") : "—"}
                        </div>
                        {d.sequence != null ? (
                          <div className="muted">Sequence # {d.sequence}</div>
                        ) : null}
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={chartData}
                  onClick={(point) => {
                    if (!point?.id) return;
                    setSelectedSceneId(point.id);
                    if (typeof point.cx === "number" && typeof point.cy === "number") {
                      setPopupPos({ x: point.cx, y: point.cy });
                    }
                  }}
                  shape={(props: {
                    cx?: number;
                    cy?: number;
                    payload?: { fill: string };
                  }) => {
                    const { cx, cy, payload } = props;
                    if (cx == null || cy == null) return null;
                    return (
                      <circle
                        className="timeline-dot"
                        cx={cx}
                        cy={cy}
                        r={7}
                        fill={payload?.fill ?? "#64748b"}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
          {selectedScene ? (
            <div
              ref={popupRef}
              className="tooltip-box click-popup"
              style={popupViewportPos ? { left: `${popupViewportPos.left}px`, top: `${popupViewportPos.top}px` } : undefined}
              onClick={() =>
                window.open(selectedScene.sourceUrl || selectedScene.url, "_blank", "noopener")
              }
            >
              <div className="tooltip-title">{selectedScene.sceneDescription}</div>
              <div>
                <strong>Year:</strong> {selectedScene.yearRaw}
                {flagSuffix(selectedScene.flags) ? (
                  <span
                    className="flags"
                    style={selectedScene.flags.about ? FLAG_ABOUT_STYLE : undefined}
                  >
                    {flagSuffix(selectedScene.flags)}
                  </span>
                ) : null}
              </div>
              <div>
                <strong>Location:</strong>{" "}
                {selectedScene.locations.length ? selectedScene.locations.join(", ") : "—"}
              </div>
              <div>
                <strong>On stage:</strong>{" "}
                {selectedScene.onStage.length ? selectedScene.onStage.join(", ") : "—"}
              </div>
              {selectedScene.sequence != null ? (
                <div className="muted">Sequence # {selectedScene.sequence}</div>
              ) : null}
              <div className="muted" style={{ marginTop: "0.25rem" }}>
                Click popup to open source
              </div>
            </div>
          ) : null}
          {chartData.length > 0 ? (
            <div className="legend" aria-label="Location colors">
              {legendItems.map((item) => (
                <span key={item.key}>
                  <span
                    className="swatch"
                    style={{ background: item.color }}
                  />
                  {item.key}
                </span>
              ))}
            </div>
          ) : null}
          {hasShownAbout ? (
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              “About” appears in the tooltip; it is not a placement flag on the
              axis.
            </p>
          ) : null}
        </div>

        <div className="side-card">
          <h2>Needs year ({needsYear.length})</h2>
          {needsYear.length === 0 ? (
            <p className="muted">All pilot rows have a parseable year.</p>
          ) : (
            <ul className="needs-list">
              {needsYear.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.sceneDescription || "Untitled"}</strong>
                    {s.sequence != null ? (
                      <span className="muted"> · Seq {s.sequence}</span>
                    ) : null}
                  </div>
                  <div className="muted">
                    Year field: {s.yearRaw?.trim() ? s.yearRaw : "(empty)"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

    </div>
  );
}
