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
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import "./App.css";
import { LocationSelectField } from "./LocationSelectField";
import { StageMultiselectField } from "./StageMultiselectField";
import { MiddleLineYearAxis } from "./MiddleLineYearAxis";
import { makeTimelineAlternatingBands } from "./TimelineAlternatingBands";
import { makeTimelineSpineDots } from "./TimelineSpineDots";
import { makeTimelinePlotClickProxy } from "./TimelinePlotClickProxy";
import { yearStepTicks } from "./lib/yearAxisTicks";
import { parseYear } from "./lib/parseYear";
import type {
  DataManifestV1,
  PlottedScene,
  SceneDTO,
  SnapshotChunkV1,
  SnapshotV1,
} from "./types";

/** Max individual dots per calendar year; remainder roll into one +x marker. */
const VISIBLE_EVENTS_PER_YEAR = 7;
/** Single fill for all plotted events (spine + scatter). */
const EVENT_DOT_FILL = "#81C784";
/** Event markers on the center timeline spine (exclude year marker dots). */
const SPINE_EVENT_DOT_FILL = "#f9a8d4";
/** Keep this fixed: vertical spacing step between stacked events in a year bucket. */
const EVENT_ROW_STEP = 38;
/** Default event dot radius (px); overflow +x marker is larger and a different color. */
const EVENT_DOT_R = 7;
/** Distinct fill for the +N aggregate marker (not the same as event dots). */
const OVERFLOW_DOT_FILL = "#0284c7";
const OVERFLOW_DOT_TEXT_FILL = "#ffffff";
const OVERFLOW_DOT_R = 16;
/** Minimum viewport height, then expand based on max records sharing one year. */
const MIN_CHART_HEIGHT = 600;
const EXTRA_HEIGHT_PER_OVERLAP = 18;
const HORIZONTAL_UNIT_OPTIONS = [10, 20, 50, 70, 100, 200] as const;
/** Set true when `keyEvent` is populated in snapshots / Notion. */
const KEY_EVENTS_ONLY_ENABLED = false;

const FLAG_ABOUT_STYLE = { opacity: 0.55 };

/** Stable object references — passing new literals each render makes Recharts redraw the whole chart. */
const SCATTER_CHART_MARGIN = {
  top: 28,
  right: 48,
  left: 56,
  bottom: 8,
} as const;
const TOOLTIP_CURSOR_PROPS = { strokeDasharray: "3 3" } as const;
const Y_AXIS_DOMAIN = ["dataMin - 28", "dataMax + 28"] as [string, string];

type ChartScenePoint = {
  pointKind?: "scene";
  id: string;
  axisYear: number;
  jitterY: number;
  sceneDescription: string;
  yearRaw: string | null;
  flags: PlottedScene["parse"]["flags"];
  locations: string[];
  onStage: string[];
  sequence: number | null;
  sourceUrl: string | null;
  sourceImageUrl: string | null;
  url: string;
};

type ChartOverflowPoint = {
  pointKind: "overflow";
  id: string;
  axisYear: number;
  jitterY: number;
  overflowIds: string[];
  overflowExtra: number;
  sceneDescription: string;
  yearRaw: string | null;
  flags: PlottedScene["parse"]["flags"];
  locations: string[];
  onStage: string[];
  sequence: null;
  sourceUrl: null;
  sourceImageUrl: null;
  url: string;
};

type ChartPoint = ChartScenePoint | ChartOverflowPoint;

type ScatterShapeProps = Record<string, unknown> & {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
};

function TimelineScatterDotShape(props: ScatterShapeProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  if (payload?.pointKind === "overflow") {
    const extra = payload.overflowExtra;
    const yLabel = formatAxisYearForLabel(payload.axisYear);
    const label = `+${extra}`;
    return (
      <g
        className="timeline-overflow-dot"
        role="button"
        tabIndex={0}
        aria-label={`${extra} more events in ${yLabel}`}
      >
        <circle
          cx={cx}
          cy={cy}
          r={OVERFLOW_DOT_R}
          fill={OVERFLOW_DOT_FILL}
          stroke="#fff"
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={OVERFLOW_DOT_TEXT_FILL}
          fontSize={12}
          fontWeight={700}
          style={{ pointerEvents: "none" }}
        >
          {label}
        </text>
      </g>
    );
  }
  return (
    <circle
      className="timeline-dot"
      cx={cx}
      cy={cy}
      r={EVENT_DOT_R}
      fill={EVENT_DOT_FILL}
      stroke="#fff"
      strokeWidth={1}
    />
  );
}

function TimelineChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload as ChartPoint;
  if (d.pointKind === "overflow") {
    const yLabel = formatAxisYearForLabel(d.axisYear);
    return (
      <div className="tooltip-box">
        <div className="tooltip-title">
          {d.overflowExtra} more in {yLabel}
        </div>
        <div className="muted">Click to open the list</div>
      </div>
    );
  }
  const flagStr = flagSuffix(d.flags);
  return (
    <div className="tooltip-box">
      <div className="tooltip-title">{d.sceneDescription}</div>
      <div>
        <strong>Year:</strong> {d.yearRaw}
        {flagStr ? (
          <span
            className="flags"
            style={d.flags.about ? FLAG_ABOUT_STYLE : undefined}
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
}

type OverflowNavState = {
  axisYear: number;
  ids: string[];
  index: number;
};

function formatAxisYearForLabel(value: number): string {
  if (value < 0) return `${Math.abs(value)} BCE`;
  return String(value);
}

/** Sequence # ascending; missing sequence last; tie-break Scene Description. */
function comparePlottedForChart(a: PlottedScene, b: PlottedScene): number {
  const aMissing = a.sequence == null;
  const bMissing = b.sequence == null;
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  if (!aMissing && !bMissing && a.sequence !== b.sequence) {
    return (a.sequence as number) - (b.sequence as number);
  }
  return a.sceneDescription.localeCompare(b.sceneDescription, undefined, {
    sensitivity: "base",
  });
}

function compareSceneDtoOrder(a: SceneDTO, b: SceneDTO): number {
  const aMissing = a.sequence == null;
  const bMissing = b.sequence == null;
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  if (!aMissing && !bMissing && a.sequence !== b.sequence) {
    return (a.sequence as number) - (b.sequence as number);
  }
  return a.sceneDescription.localeCompare(b.sceneDescription, undefined, {
    sensitivity: "base",
  });
}

function jitterYFromStackSlot(stackSlot: number): number {
  const tier = Math.floor(stackSlot / 2) + 1;
  const sign = stackSlot % 2 === 0 ? 1 : -1;
  return sign * tier * EVENT_ROW_STEP;
}

/** Stack slot for +N: one step past the 7th dot on the positive (upward) arm — not slot 7, which is on the lower side. */
const OVERFLOW_STACK_SLOT = VISIBLE_EVENTS_PER_YEAR + 1;

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
  const [keyEventsOnly, setKeyEventsOnly] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [overflowNav, setOverflowNav] = useState<OverflowNavState | null>(null);
  /** Scene-only ambiguous tap: same popup chrome as overflow carousel (prev/next + counter). */
  const [clusterSceneNav, setClusterSceneNav] = useState<{
    ids: string[];
    index: number;
  } | null>(null);
  /** Ambiguous tap that includes a +x marker: card-styled list (not the detail body). */
  const [overflowTiePanel, setOverflowTiePanel] = useState<{
    x: number;
    y: number;
    options: ChartPoint[];
  } | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [popupViewportPos, setPopupViewportPos] = useState<{ left: number; top: number } | null>(null);
  const chartCardRef = useRef<HTMLDivElement | null>(null);
  const chartScrollRef = useRef<HTMLDivElement | null>(null);
  const [chartViewportWidth, setChartViewportWidth] = useState(0);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const overflowTiePanelRef = useRef<HTMLDivElement | null>(null);
  /** When true, next plot tap closes popups only (two-step: dismiss then pick). */
  const plotPopupGateRef = useRef(false);
  const [overflowTiePanelPos, setOverflowTiePanelPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
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

  const closeScenePopup = useCallback(() => {
    setSelectedSceneId(null);
    setOverflowNav(null);
    setClusterSceneNav(null);
    setOverflowTiePanel(null);
    setOverflowTiePanelPos(null);
    setPopupPos(null);
    setPopupViewportPos(null);
  }, []);

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".click-popup")) return;
      if (target.closest(".timeline-dot")) return;
      if (target.closest(".timeline-overflow-dot")) return;
      closeScenePopup();
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, [closeScenePopup]);

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
    bad.sort(compareSceneDtoOrder);
    return { plottedRaw: ok, needsYear: bad };
  }, [scenes]);

  const needsUrl = useMemo(() => {
    if (!scenes) return [];
    return scenes.filter((s) => !s.sourceUrl?.trim()).sort(compareSceneDtoOrder);
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
      if (KEY_EVENTS_ONLY_ENABLED && keyEventsOnly && !p.keyEvent) return false;
      return true;
    });
  }, [plottedRaw, locFilter, stageFilter, keyEventsOnly]);

  const chartData = useMemo((): ChartPoint[] => {
    const byYear = new Map<number, PlottedScene[]>();
    for (const p of plotted) {
      const y = p.parse.axisYear;
      const arr = byYear.get(y) ?? [];
      arr.push(p);
      byYear.set(y, arr);
    }
    const rows: ChartPoint[] = [];
    const sortedYears = [...byYear.keys()].sort((a, b) => a - b);
    for (const axisYear of sortedYears) {
      const group = (byYear.get(axisYear) ?? [])
        .slice()
        .sort(comparePlottedForChart);
      const visible = group.slice(0, VISIBLE_EVENTS_PER_YEAR);
      const overflow = group.slice(VISIBLE_EVENTS_PER_YEAR);
      let slot = 0;
      for (const p of visible) {
        rows.push({
          pointKind: "scene",
          id: p.id,
          axisYear,
          jitterY: jitterYFromStackSlot(slot),
          sceneDescription: p.sceneDescription,
          yearRaw: p.yearRaw,
          flags: p.parse.flags,
          locations: p.locations,
          onStage: p.onStage,
          sequence: p.sequence,
          sourceUrl: p.sourceUrl,
          sourceImageUrl: p.sourceImageUrl ?? null,
          url: p.url,
        });
        slot++;
      }
      if (overflow.length > 0) {
        const head = overflow[0]!;
        rows.push({
          pointKind: "overflow",
          id: `overflow:${axisYear}`,
          axisYear,
          jitterY: jitterYFromStackSlot(OVERFLOW_STACK_SLOT),
          overflowIds: overflow.map((x) => x.id),
          overflowExtra: overflow.length,
          sceneDescription: `+${overflow.length} more`,
          yearRaw: head.yearRaw,
          flags: head.parse.flags,
          locations: [],
          onStage: [],
          sequence: null,
          sourceUrl: null,
          sourceImageUrl: null,
          url: head.url,
        });
      }
    }
    return rows;
  }, [plotted]);

  /** Paint order: earlier years drawn first (below); later years on top when X is tight. */
  const scatterData = useMemo(
    () =>
      [...chartData].sort((a, b) => {
        if (a.axisYear !== b.axisYear) return a.axisYear - b.axisYear;
        return a.jitterY - b.jitterY;
      }),
    [chartData]
  );

  const applyChartPointSelection = useCallback(
    (point: ChartPoint, clientX: number, clientY: number) => {
      if (point.pointKind === "overflow") {
        const ids = point.overflowIds ?? [];
        if (!ids.length) return;
        setOverflowNav({ axisYear: point.axisYear, ids, index: 0 });
      } else {
        setOverflowNav(null);
        setSelectedSceneId(point.id);
      }
      setClusterSceneNav(null);
      setOverflowTiePanel(null);
      setOverflowTiePanelPos(null);
      setPopupPos({ x: clientX, y: clientY });
    },
    []
  );

  plotPopupGateRef.current =
    selectedSceneId != null || overflowTiePanel != null;

  const PlotClickProxy = useMemo(
    () =>
      makeTimelinePlotClickProxy(scatterData, {
        onPick: (p, cx, cy) => {
          if (plotPopupGateRef.current) {
            closeScenePopup();
            return;
          }
          applyChartPointSelection(p as ChartPoint, cx, cy);
        },
        onDenseCandidates: (pts, cx, cy) => {
          if (plotPopupGateRef.current) {
            closeScenePopup();
            return;
          }
          const opts = pts as ChartPoint[];
          const hasOverflow = opts.some((p) => p.pointKind === "overflow");
          if (hasOverflow) {
            setClusterSceneNav(null);
            setOverflowNav(null);
            setSelectedSceneId(null);
            setPopupPos(null);
            setPopupViewportPos(null);
            setOverflowTiePanel({ x: cx, y: cy, options: opts });
            return;
          }
          const seen = new Set<string>();
          const ids: string[] = [];
          for (const p of opts) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            ids.push(p.id);
          }
          if (!ids.length) return;
          setOverflowTiePanel(null);
          setOverflowTiePanelPos(null);
          setOverflowNav(null);
          setClusterSceneNav({ ids, index: 0 });
          setPopupPos({ x: cx, y: cy });
        },
      }),
    [scatterData, applyChartPointSelection, closeScenePopup]
  );

  const yearDomain = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 1, span: 1 };
    const ys = chartData.map((d) => d.axisYear);
    const dataMin = Math.min(...ys);
    const dataMax = Math.max(...ys);
    const span = Math.max(dataMax - dataMin, 1);
    const pad = Math.max(15, Math.round(span * 0.08));
    return { min: dataMin - pad, max: dataMax + pad, span };
  }, [chartData]);

  const xAxisNumberDomain = useMemo(
    (): [number, number] => [yearDomain.min, yearDomain.max],
    [yearDomain.min, yearDomain.max]
  );

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

  /** Stacked row slots per year after capping (≤7 scene rows + optional +x row). */
  const maxStackSlotsPerYear = useMemo(() => {
    if (!plotted.length) return 0;
    const counts = new Map<number, number>();
    for (const p of plotted) {
      const y = p.parse.axisYear;
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    let maxSlots = 0;
    for (const c of counts.values()) {
      const slots =
        Math.min(c, VISIBLE_EVENTS_PER_YEAR) + (c > VISIBLE_EVENTS_PER_YEAR ? 1 : 0);
      if (slots > maxSlots) maxSlots = slots;
    }
    return maxSlots;
  }, [plotted]);

  const CHART_HEIGHT = useMemo(() => {
    if (maxStackSlotsPerYear <= 1) return MIN_CHART_HEIGHT;
    return (
      MIN_CHART_HEIGHT +
      (maxStackSlotsPerYear - 1) * EXTRA_HEIGHT_PER_OVERLAP
    );
  }, [maxStackSlotsPerYear]);
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

  const hasShownAbout = useMemo(
    () => plotted.some((p) => p.parse.flags.about),
    [plotted]
  );

  const selectedDisplay = useMemo(() => {
    if (!selectedSceneId) return null;
    const p = plotted.find((x) => x.id === selectedSceneId);
    if (!p) return null;
    return {
      id: p.id,
      yearRaw: p.yearRaw,
      sceneDescription: p.sceneDescription,
      flags: p.parse.flags,
      locations: p.locations,
      onStage: p.onStage,
      sequence: p.sequence,
      sourceUrl: p.sourceUrl,
      sourceImageUrl: p.sourceImageUrl ?? null,
      url: p.url,
    };
  }, [selectedSceneId, plotted]);

  const selectedSceneParts = selectedDisplay
    ? splitSceneDescription(selectedDisplay.sceneDescription)
    : null;
  const selectedHasSourceUrl = Boolean(selectedDisplay?.sourceUrl?.trim());

  const goOverflowPrev = useCallback(() => {
    setOverflowNav((prev) => {
      if (!prev || prev.index <= 0) return prev;
      return { ...prev, index: prev.index - 1 };
    });
  }, []);

  const goOverflowNext = useCallback(() => {
    setOverflowNav((prev) => {
      if (!prev || prev.index >= prev.ids.length - 1) return prev;
      return { ...prev, index: prev.index + 1 };
    });
  }, []);

  const goClusterScenePrev = useCallback(() => {
    setClusterSceneNav((prev) => {
      if (!prev || prev.index <= 0) return prev;
      return { ...prev, index: prev.index - 1 };
    });
  }, []);

  const goClusterSceneNext = useCallback(() => {
    setClusterSceneNav((prev) => {
      if (!prev || prev.index >= prev.ids.length - 1) return prev;
      return { ...prev, index: prev.index + 1 };
    });
  }, []);

  useLayoutEffect(() => {
    if (overflowNav) {
      const id = overflowNav.ids[overflowNav.index];
      if (id) setSelectedSceneId(id);
      return;
    }
    if (clusterSceneNav) {
      const id = clusterSceneNav.ids[clusterSceneNav.index];
      if (id) setSelectedSceneId(id);
    }
  }, [overflowNav, clusterSceneNav]);

  useEffect(() => {
    if (!selectedSceneId) return;
    if (!plotted.some((p) => p.id === selectedSceneId)) {
      closeScenePopup();
    }
  }, [selectedSceneId, plotted, closeScenePopup]);

  useEffect(() => {
    const overflowCarousel =
      selectedDisplay && overflowNav && overflowNav.ids.length > 1;
    const clusterCarousel =
      selectedDisplay &&
      clusterSceneNav &&
      clusterSceneNav.ids.length > 1;
    if (!overflowCarousel && !clusterCarousel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (overflowCarousel) goOverflowPrev();
        else goClusterScenePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (overflowCarousel) goOverflowNext();
        else goClusterSceneNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedDisplay,
    overflowNav,
    clusterSceneNav,
    goOverflowPrev,
    goOverflowNext,
    goClusterScenePrev,
    goClusterSceneNext,
  ]);

  useLayoutEffect(() => {
    if (!selectedDisplay || !popupPos || !popupRef.current) {
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
  }, [selectedDisplay, popupPos]);

  useLayoutEffect(() => {
    if (!overflowTiePanel || !overflowTiePanelRef.current) {
      setOverflowTiePanelPos(null);
      return;
    }

    const compute = () => {
      const margin = 8;
      const offset = 10;
      const el = overflowTiePanelRef.current!;
      const rect = el.getBoundingClientRect();
      const anchor = { x: overflowTiePanel.x, y: overflowTiePanel.y };

      let left = anchor.x + offset;
      let top = anchor.y + offset;

      if (left + rect.width > window.innerWidth - margin) {
        left = anchor.x - rect.width - offset;
      }
      if (top + rect.height > window.innerHeight - margin) {
        top = anchor.y - rect.height - offset;
      }

      left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

      setOverflowTiePanelPos((prev) => {
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
  }, [overflowTiePanel]);

  const showPopupCarousel =
    (overflowNav && overflowNav.ids.length > 0) ||
    (clusterSceneNav && clusterSceneNav.ids.length > 1);

  const carouselIndex =
    overflowNav && overflowNav.ids.length > 0
      ? overflowNav.index
      : clusterSceneNav
        ? clusterSceneNav.index
        : 0;
  const carouselLen =
    overflowNav && overflowNav.ids.length > 0
      ? overflowNav.ids.length
      : clusterSceneNav
        ? clusterSceneNav.ids.length
        : 0;

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
              <FormControlLabel
                sx={{ margin: 0, alignSelf: "center" }}
                disabled={!KEY_EVENTS_ONLY_ENABLED}
                control={
                  <Switch
                    size="small"
                    checked={keyEventsOnly}
                    onChange={(_, checked) => setKeyEventsOnly(checked)}
                    disabled={!KEY_EVENTS_ONLY_ENABLED || !scenes?.length}
                    inputProps={{
                      "aria-label": "Show only key events",
                    }}
                  />
                }
                label="Key events only"
              />
              <div className="toolbar-actions">
                <Button variant="contained" onClick={() => void load()} disabled={loading}>
                  {loading ? "Loading…" : "Show"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setLocFilter("all");
                    setStageFilter([]);
                    setKeyEventsOnly(false);
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
                margin={SCATTER_CHART_MARGIN}
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
                  domain={xAxisNumberDomain}
                  ticks={xAxisYearTicks}
                  hide
                />
                <YAxis
                  type="number"
                  dataKey="jitterY"
                  hide
                  domain={Y_AXIS_DOMAIN}
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
                  cursor={TOOLTIP_CURSOR_PROPS}
                  active={false}
                  content={TimelineChartTooltipContent}
                />
                <Scatter data={scatterData} shape={TimelineScatterDotShape} />
                <Customized component={PlotClickProxy} />
              </ScatterChart>
            </div>
          )}
          {selectedDisplay ? (
            <div
              ref={popupRef}
              role="dialog"
              aria-modal="true"
              aria-label="Scene details"
              className={`tooltip-box click-popup click-popup--no-link${
                showPopupCarousel ? " click-popup--overflow" : ""
              }`}
              style={
                popupViewportPos
                  ? {
                      left: `${popupViewportPos.left}px`,
                      top: `${popupViewportPos.top}px`,
                    }
                  : undefined
              }
              onPointerDown={(e) => {
                const t = e.target;
                if (!(t instanceof Element)) return;
                if (t.closest(".popup-overflow-nav-btn")) return;
                if (t.closest(".popup-overflow-nav-count")) return;
                if (t.closest(".tooltip-title-link")) return;
                e.stopPropagation();
                closeScenePopup();
              }}
            >
              {selectedDisplay.sourceImageUrl?.trim() ? (
                <div className="popup-thumb-viewport" aria-hidden="true">
                  <img
                    className="popup-thumb"
                    src={
                      resolveSceneImageSrc(selectedDisplay.sourceImageUrl) ?? ""
                    }
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : null}
              <div className="popup-top-row">
                <div className="popup-line popup-line--year">
                  <i className="fa-solid fa-calendar" aria-hidden="true" />{" "}
                  <span>{selectedDisplay.yearRaw}</span>
                </div>
                <div className="popup-tags">
                  {(selectedSceneParts?.tags.length
                    ? selectedSceneParts.tags
                    : [selectedDisplay.sceneDescription]
                  ).map((tag) => (
                    <span key={tag} className="popup-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              {selectedHasSourceUrl ? (
                <a
                  className="tooltip-title tooltip-title-link"
                  href={selectedDisplay.sourceUrl!.trim()}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selectedSceneParts?.title || selectedDisplay.sceneDescription}
                </a>
              ) : (
                <div className="tooltip-title">
                  {selectedSceneParts?.title || selectedDisplay.sceneDescription}
                </div>
              )}
              <div className="popup-line">
                <i className="fa-solid fa-location-dot" aria-hidden="true" />{" "}
                <span>
                  {selectedDisplay.locations.length
                    ? selectedDisplay.locations.join(", ")
                    : "—"}
                </span>
              </div>
              <div className="popup-line">
                <i className="fa-solid fa-masks-theater" aria-hidden="true" />{" "}
                <span>
                  {selectedDisplay.onStage.length
                    ? selectedDisplay.onStage.join(", ")
                    : "—"}
                </span>
              </div>
              {showPopupCarousel ? (
                <>
                  <button
                    type="button"
                    className="popup-overflow-nav-btn"
                    disabled={carouselIndex <= 0}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (overflowNav && overflowNav.ids.length > 0)
                        goOverflowPrev();
                      else goClusterScenePrev();
                    }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    aria-label="Previous event"
                  >
                    <i
                      className="fa-solid fa-circle-arrow-left"
                      aria-hidden
                    />
                  </button>
                  <span
                    className="popup-overflow-nav-count muted"
                    aria-live="polite"
                    onPointerDown={(ev) => ev.stopPropagation()}
                  >
                    {carouselIndex + 1} / {carouselLen}
                  </span>
                  <button
                    type="button"
                    className="popup-overflow-nav-btn"
                    disabled={carouselIndex >= carouselLen - 1}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (overflowNav && overflowNav.ids.length > 0)
                        goOverflowNext();
                      else goClusterSceneNext();
                    }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    aria-label="Next event"
                  >
                    <i
                      className="fa-solid fa-circle-arrow-right"
                      aria-hidden
                    />
                  </button>
                </>
              ) : null}
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

      {overflowTiePanel ? (
        <div
          ref={overflowTiePanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Choose an event"
          className="tooltip-box click-popup overflow-tie-panel"
          style={
            overflowTiePanelPos
              ? {
                  left: `${overflowTiePanelPos.left}px`,
                  top: `${overflowTiePanelPos.top}px`,
                }
              : undefined
          }
          onPointerDown={(e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (t.closest(".overflow-tie-panel-item")) return;
            e.stopPropagation();
            closeScenePopup();
          }}
        >
          <div className="overflow-tie-panel-hint muted">
            Multiple markers overlap — pick one
          </div>
          <ul className="overflow-tie-panel-list">
            {overflowTiePanel.options.map((p) => (
              <li key={`${p.id}:${p.axisYear}`}>
                <button
                  type="button"
                  className="overflow-tie-panel-item"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    applyChartPointSelection(p, ev.clientX, ev.clientY);
                  }}
                >
                  <span className="overflow-tie-panel-item-primary">
                    {p.pointKind === "overflow"
                      ? `+${p.overflowExtra} in ${formatAxisYearForLabel(p.axisYear)}`
                      : p.sceneDescription}
                  </span>
                  <span className="overflow-tie-panel-item-secondary muted">
                    {p.pointKind === "overflow"
                      ? "More events this year"
                      : (p.yearRaw ?? "—")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {import.meta.env.DEV ? (
        <p className="dev-server-hint muted" role="status">
          <strong>Local dev</strong> — use the URL Vite prints (often{" "}
          <code className="dev-server-hint-code">localhost:5173</code>; if that port
          is busy, <code className="dev-server-hint-code">5174</code> is fine).
          GitHub Pages (<code className="dev-server-hint-code">/Timeline/</code>)
          only updates after a deploy.
        </p>
      ) : null}
    </div>
  );
}
