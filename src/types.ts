export type SceneDTO = {
  id: string;
  url: string;
  sourceUrl: string | null;
  /** Ingested snapshots use a site-relative path under data/images/; may be https in older data */
  sourceImageUrl?: string | null;
  sceneDescription: string;
  yearRaw: string | null;
  sequence: number | null;
  locations: string[];
  onStage: string[];
  /** Optional until present in ingested JSON / Notion “Key event” checkbox. */
  keyEvent?: boolean;
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
