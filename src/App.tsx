import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Customized,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import "./App.css";
import { LocationSelectField } from "./LocationSelectField";
import { StageMultiselectField } from "./StageMultiselectField";
import { MiddleLineYearAxis } from "./MiddleLineYearAxis";
import { makeTimelineAlternatingBands } from "./TimelineAlternatingBands";
import { makeTimelineSpineDots } from "./TimelineSpineDots";
import { yearStepTicks } from "./lib/yearAxisTicks";
import { parseYear } from "./lib/parseYear";
import type {
  DataManifestV1,
  PlottedScene,
  SceneDTO,
  SnapshotChunkV1,
  SnapshotV1,
} from "./types";

/** Single fill for all plotted events (spine + scatter). */
const EVENT_DOT_FILL = "#81C784";
/** Event markers on the center timeline spine (exclude year marker dots). */
const SPINE_EVENT_DOT_FILL = "#f9a8d4";
/** Keep this fixed: vertical spacing step between stacked events in a year bucket. */
const EVENT_ROW_STEP = 38;
/** Minimum viewport height, then expand based on max records sharing one year. */
const MIN_CHART_HEIGHT = 600;
const EXTRA_HEIGHT_PER_OVERLAP = 18;
const HORIZONTAL_UNIT_OPTIONS = [20, 50, 70, 100, 200] as const;

const FLAG_ABOUT_STYLE = { opacity: 0.55 };

/** Bundled snapshots use paths like data/images/…; older JSON may still have https URLs. */
function resolveSceneImageSrc(url: string | null | undefined): string | null {
  const t = url?.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const base = import.meta.env.BASE_URL;
  const pathPart = t.replace(/^\/+/, "");
  return base.endsWith("/") ? `${base}${pathPart}` : `${base}/${pathPart}`;
}

function flagSuffix(flags: { after: boolean; before: boolean; about: boolean }) {
  const parts: string[] = [];
  if (flags.after) parts.push("After");
  if (flags.before) parts.push("Before");
  if (flags.about) parts.push("About");
  if (!parts.length) return "";
  return ` (${parts.join(", ")})`;
}

function splitSceneDescription(sceneDescription: string): {
  tags: string[];
  title: string;
} {
  const trimmed = sceneDescription.trim();
  if (!trimmed) return { tags: [], title: "Untitled" };

  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return { tags: [trimmed], title: "" };

  const firstToken = trimmed.slice(0, firstSpace).trim();
  const title = trimmed.slice(firstSpace + 1).trim();
  const tags = firstToken
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  return { tags, title };
}

export default function App() {
  const [scenes, setScenes] = useState<SceneDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locFilter, setLocFilter] = useState<string>("all");
  /** Empty = all stages; otherwise event must match at least one selected value. */
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [popupViewportPos, setPopupViewportPos] = useState<{ left: number; top: number } | null>(null);
  const chartCardRef = useRef<HTMLDivElement | null>(null);
  const chartScrollRef = useRef<HTMLDivElement | null>(null);
  const [chartViewportWidth, setChartViewportWidth] = useState(0);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [horizontalUnitYears, setHorizontalUnitYears] = useState<number>(70);
  const loadRunRef = useRef(0);
  const [loadProgress, setLoadProgress] = useState<{
    loaded: number;
    total: number;
    active: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    setLoading(true);
    setError(null);
    setLoadProgress(null);
    try {
      const base = `${import.meta.env.BASE_URL}data/`;
      const manifestUrl = `${base}manifest.json`;
      const manifestRes = await fetch(manifestUrl, { cache: "no-store" });
      const manifest = (await manifestRes.json()) as DataManifestV1 & {
        error?: string;
      };

      const canUseChunks =
        manifestRes.ok &&
        Array.isArray(manifest.chunks) &&
        manifest.chunks.length > 0;

      if (canUseChunks) {
        const total = Math.max(0, manifest.recordCount ?? 0);
        const firstChunkUrl = `${base}${manifest.chunks![0]}`;
        const firstChunkRes = await fetch(firstChunkUrl, { cache: "no-store" });
        const firstChunk = (await firstChunkRes.json()) as SnapshotChunkV1 & {
          error?: string;
        };
        if (!firstChunkRes.ok) {
          throw new Error(firstChunk.error ?? firstChunkRes.statusText);
        }
        if (runId !== loadRunRef.current) return;

        const firstRecords = firstChunk.records ?? [];
        setScenes(firstRecords);
        setLoadProgress({
          loaded: firstRecords.length,
          total: total || firstRecords.length,
          active: manifest.chunks!.length > 1,
        });
        setLoading(false);

        if (manifest.chunks!.length > 1) {
          const restRecords: SceneDTO[] = [];
          for (const chunkPath of manifest.chunks!.slice(1)) {
            const r = await fetch(`${base}${chunkPath}`, { cache: "no-store" });
            const payload = (await r.json()) as SnapshotChunkV1 & {
              error?: string;
            };
            if (!r.ok) {
              throw new Error(payload.error ?? r.statusText);
            }
            restRecords.push(...(payload.records ?? []));
            if (runId !== loadRunRef.current) return;
            setScenes((prev) => (prev ? [...prev, ...(payload.records ?? [])] : payload.records ?? []));
            setLoadProgress((prev) =>
              prev
                ? {
                    loaded: prev.loaded + (payload.records?.length ?? 0),
                    total: prev.total,
                    active: true,
                  }
                : null
            );
          }
          if (runId !== loadRunRef.current) return;
          setLoadProgress((prev) =>
            prev
              ? {
                  loaded: prev.loaded,
                  total: prev.total,
                  active: false,
                }
              : null
          );
          if (restRecords.length === 0) {
            setLoadProgress((prev) =>
              prev
                ? {
                    loaded: prev.loaded,
                    total: prev.total,
                    active: false,
                  }
                : null
            );
          }
        }
        return;
      }

      const snapshotUrl = `${base}latest.json`;
      const r = await fetch(snapshotUrl, { cache: "no-store" });
      const data = (await r.json()) as SnapshotV1 & { error?: string };
      if (!r.ok) {
        setError(data.error ?? r.statusText);
        setScenes(null);
        return;
      }
      if (runId !== loadRunRef.current) return;
      const records = data.records ?? [];
      setScenes(records);
      setLoadProgress({
        loaded: records.length,
        total: records.length,
        active: false,
      });
    } catch (e) {
      if (runId !== loadRunRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setScenes(null);
      setLoadProgress(null);
    } finally {
      if (runId === loadRunRef.current) {
        setLoading(false);
      }
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
      ok.push({
        ...scene,
        parse: p,
      });
    }
    bad.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    return { plottedRaw: ok, needsYear: bad };
  }, [scenes]);

  const needsUrl = useMemo(() => {
    if (!scenes) return [];
    return scenes
      .filter((s) => !s.sourceUrl?.trim())
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  }, [scenes]);

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
      if (stageFilter.length > 0) {
        const hit = stageFilter.some((s) => p.onStage.includes(s));
        if (!hit) return false;
      }
      return true;
    });
  }, [plottedRaw, locFilter, stageFilter]);

  const chartData = useMemo(() => {
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
      const jitterY = sign * tier * EVENT_ROW_STEP;
      return {
        id: p.id,
        axisYear: p.parse.axisYear,
        jitterY,
        sceneDescription: p.sceneDescription,
        yearRaw: p.yearRaw,
        flags: p.parse.flags,
        locations: p.locations,
        onStage: p.onStage,
        sequence: p.sequence,
        sourceUrl: p.sourceUrl,
        sourceImageUrl: p.sourceImageUrl ?? null,
        url: p.url,
      };
    });
  }, [plotted]);

  const yearDomain = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 1, span: 1 };
    const ys = chartData.map((d) => d.axisYear);
    const dataMin = Math.min(...ys);
    const dataMax = Math.max(...ys);
    const span = Math.max(dataMax - dataMin, 1);
    const pad = Math.max(15, Math.round(span * 0.08));
    return { min: dataMin - pad, max: dataMax + pad, span };
  }, [chartData]);

  /** Spine and labels: configurable year step across the padded domain. */
  const xAxisYearTicks = useMemo(
    () => yearStepTicks(yearDomain.min, yearDomain.max, horizontalUnitYears),
    [yearDomain.min, yearDomain.max, horizontalUnitYears]
  );

  /** Distinct years in the current (filtered) chart data — one spine marker per year. */
  const spineAxisYears = useMemo(() => {
    const s = new Set<number>();
    for (const d of chartData) s.add(d.axisYear);
    return [...s].sort((a, b) => a - b);
  }, [chartData]);

  const SpineDotsLayer = useMemo(
    () => makeTimelineSpineDots(spineAxisYears, SPINE_EVENT_DOT_FILL),
    [spineAxisYears]
  );

  const AlternatingBandsLayer = useMemo(
    () => makeTimelineAlternatingBands(xAxisYearTicks),
    [xAxisYearTicks]
  );

  const maxEventsInSingleYear = useMemo(() => {
    if (chartData.length === 0) return 0;
    const counts = new Map<number, number>();
    let maxCount = 0;
    for (const d of chartData) {
      const next = (counts.get(d.axisYear) ?? 0) + 1;
      counts.set(d.axisYear, next);
      if (next > maxCount) maxCount = next;
    }
    return maxCount;
  }, [chartData]);

  const CHART_HEIGHT = useMemo(() => {
    if (maxEventsInSingleYear <= 1) return MIN_CHART_HEIGHT;
    return (
      MIN_CHART_HEIGHT +
      (maxEventsInSingleYear - 1) * EXTRA_HEIGHT_PER_OVERLAP
    );
  }, [maxEventsInSingleYear]);
  const PIXELS_PER_YEAR = 8;
  const chartPixelWidth = useMemo(() => {
    const vw = chartViewportWidth || 640;
    const minBySpan = yearDomain.span * PIXELS_PER_YEAR + 96;
    return Math.max(vw, minBySpan);
  }, [chartViewportWidth, yearDomain.span]);

  useLayoutEffect(() => {
    const el = chartScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setChartViewportWidth(el.clientWidth);
    });
    ro.observe(el);
    setChartViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [chartData.length]);

  const hasShownAbout = chartData.some((d) => d.flags.about);
  const selectedScene = selectedSceneId
    ? chartData.find((d) => d.id === selectedSceneId) ?? null
    : null;
  const selectedSceneParts = selectedScene
    ? splitSceneDescription(selectedScene.sceneDescription)
    : null;
  const selectedHasSourceUrl = Boolean(selectedScene?.sourceUrl?.trim());

  useLayoutEffect(() => {
    if (!selectedScene || !popupPos || !popupRef.current) {
      setPopupViewportPos(null);
      return;
    }

    const compute = () => {
      const margin = 8;
      const offset = 10;
      const popupRect = popupRef.current!.getBoundingClientRect();

      let left = popupPos.x + offset;
      let top = popupPos.y + offset;

      if (left + popupRect.width > window.innerWidth - margin) {
        left = popupPos.x - popupRect.width - offset;
      }
      if (top + popupRect.height > window.innerHeight - margin) {
        top = popupPos.y - popupRect.height - offset;
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
      <div className="disclaimer" role="note">
        <i
          className="fa-solid fa-circle-exclamation disclaimer-icon"
          aria-hidden
        />
        <p className="disclaimer-text">
          This is only an experiment. The dates might not be accurate. If you
          received this URL, please do not share it.
        </p>
      </div>

      <section className="filters-panel" aria-label="Filters">
        <div
          className={
            filtersExpanded
              ? "filters-panel-header"
              : "filters-panel-header filters-panel-header--collapsed"
          }
        >
          <h2 className="filters-panel-title">Filters</h2>
          <button
            type="button"
            className="filters-panel-toggle"
            onClick={() => setFiltersExpanded((v) => !v)}
            aria-expanded={filtersExpanded}
            aria-controls="filters-panel-body"
            title={filtersExpanded ? "Collapse filters" : "Expand filters"}
          >
            <i className="fa-solid fa-sliders" aria-hidden />
            <span className="visually-hidden">
              {filtersExpanded ? "Collapse filters" : "Expand filters"}
            </span>
          </button>
        </div>
        {filtersExpanded ? (
          <div id="filters-panel-body" className="filters-panel-body">
            <div className="toolbar">
              <LocationSelectField
                label="Location"
                value={locFilter}
                options={locationOptions}
                onChange={setLocFilter}
                disabled={!scenes?.length}
              />
              <StageMultiselectField
                label="On stage"
                value={stageFilter}
                options={stageOptions}
                onChange={setStageFilter}
                disabled={!scenes?.length}
              />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="horizontal-units-label">Horizontal units</InputLabel>
                <Select
                  labelId="horizontal-units-label"
                  id="horizontal-units"
                  value={String(horizontalUnitYears)}
                  label="Horizontal units"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next) && next > 0) {
                      setHorizontalUnitYears(next);
                    }
                  }}
                >
                  {HORIZONTAL_UNIT_OPTIONS.map((n) => (
                    <MenuItem key={n} value={String(n)}>
                      {n} years
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <div className="toolbar-actions">
                <Button variant="contained" onClick={() => void load()} disabled={loading}>
                  {loading ? "Loading…" : "Show"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setLocFilter("all");
                    setStageFilter([]);
                  }}
                  disabled={!scenes?.length}
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loadProgress ? (
        <p className="load-progress muted" aria-live="polite">
          Loaded {loadProgress.loaded.toLocaleString()} /{" "}
          {loadProgress.total.toLocaleString()} records
          {loadProgress.active ? "..." : "."}
        </p>
      ) : null}

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
            <div className="chart-scroll" ref={chartScrollRef}>
              <ScatterChart
                width={chartPixelWidth}
                height={CHART_HEIGHT}
                margin={{ top: 28, right: 48, left: 56, bottom: 8 }}
              >
                <Customized component={AlternatingBandsLayer} />
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  dataKey="axisYear"
                  name="Year"
                  domain={[yearDomain.min, yearDomain.max]}
                  ticks={xAxisYearTicks}
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
                <Customized component={SpineDotsLayer} />
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
                  onClick={(point, _index, e) => {
                    if (!point?.id) return;
                    setSelectedSceneId(point.id);
                    const me = e as unknown as MouseEvent | undefined;
                    if (me && typeof me.clientX === "number") {
                      setPopupPos({ x: me.clientX, y: me.clientY });
                    } else if (typeof point.cx === "number" && typeof point.cy === "number") {
                      setPopupPos({ x: point.cx, y: point.cy });
                    }
                  }}
                  shape={(props: { cx?: number; cy?: number }) => {
                    const { cx, cy } = props;
                    if (cx == null || cy == null) return null;
                    return (
                      <circle
                        className="timeline-dot"
                        cx={cx}
                        cy={cy}
                        r={7}
                        fill={EVENT_DOT_FILL}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </div>
          )}
          {selectedScene ? (
            <div
              ref={popupRef}
              className={`tooltip-box click-popup${selectedHasSourceUrl ? "" : " click-popup--no-link"}`}
              style={
                popupViewportPos
                  ? {
                      left: `${popupViewportPos.left}px`,
                      top: `${popupViewportPos.top}px`,
                    }
                  : undefined
              }
              onClick={() => {
                const url = selectedScene.sourceUrl?.trim();
                if (!url) return;
                window.open(url, "_blank", "noopener");
              }}
            >
              {selectedScene.sourceImageUrl?.trim() ? (
                <div className="popup-thumb-viewport" aria-hidden="true">
                  <img
                    className="popup-thumb"
                    src={resolveSceneImageSrc(selectedScene.sourceImageUrl) ?? ""}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : null}
              <div className="popup-top-row">
                <div className="popup-line popup-line--year">
                  <i className="fa-solid fa-calendar" aria-hidden="true" />{" "}
                  <span>{selectedScene.yearRaw}</span>
                </div>
                <div className="popup-tags">
                  {(selectedSceneParts?.tags.length
                    ? selectedSceneParts.tags
                    : [selectedScene.sceneDescription]
                  ).map((tag) => (
                    <span key={tag} className="popup-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="tooltip-title">
                {selectedSceneParts?.title || selectedScene.sceneDescription}
              </div>
              <div className="popup-line">
                <i className="fa-solid fa-location-dot" aria-hidden="true" />{" "}
                <span>
                  {selectedScene.locations.length
                    ? selectedScene.locations.join(", ")
                    : "—"}
                </span>
              </div>
              <div className="popup-line">
                <i className="fa-solid fa-masks-theater" aria-hidden="true" />{" "}
                <span>
                  {selectedScene.onStage.length ? selectedScene.onStage.join(", ") : "—"}
                </span>
              </div>
              {selectedHasSourceUrl ? null : (
                <div className="popup-url-unavailable muted">Not available</div>
              )}
            </div>
          ) : null}
          {hasShownAbout ? (
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              “About” appears in the tooltip; it is not a placement flag on the
              axis.
            </p>
          ) : null}
        </div>

        <div className="side-stack">
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

          <div className="side-card">
            <h2>Need URL ({needsUrl.length})</h2>
            {needsUrl.length === 0 ? (
              <p className="muted">Every row has an embedded source link.</p>
            ) : (
              <ul className="needs-list">
                {needsUrl.map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>{s.sceneDescription || "Untitled"}</strong>
                      {s.sequence != null ? (
                        <span className="muted"> · Seq {s.sequence}</span>
                      ) : null}
                    </div>
                    <div className="muted">
                      <a href={s.url} target="_blank" rel="noreferrer">
                        Open in Notion
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
