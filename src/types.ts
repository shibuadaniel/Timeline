export type SceneDTO = {
  id: string;
  url: string;
  sourceUrl: string | null;
  /** Present after re-ingest; may be absent in older snapshots */
  sourceImageUrl?: string | null;
  sceneDescription: string;
  yearRaw: string | null;
  sequence: number | null;
  locations: string[];
  onStage: string[];
};

export type SnapshotV1 = {
  version: "v1";
  generatedAt: string;
  source: "notion";
  recordCount: number;
  records: SceneDTO[];
};

export type SnapshotChunkV1 = {
  version: "v1-chunk";
  generatedAt: string;
  source: "notion";
  chunkIndex: number;
  chunkCount: number;
  recordCount: number;
  records: SceneDTO[];
};

export type DataManifestV1 = {
  version: SnapshotV1["version"];
  generatedAt: string;
  latest: string;
  recordCount: number;
  chunkSize?: number;
  chunkCount?: number;
  chunks?: string[];
};

export type YearParse =
  | {
      kind: "ok";
      axisYear: number;
      displayLabel: string;
      flags: { after: boolean; before: boolean; about: boolean };
    }
  | { kind: "needs_year" };

export type PlottedScene = SceneDTO & {
  parse: Extract<YearParse, { kind: "ok" }>;
};
