export type SceneDTO = {
  id: string;
  url: string;
  sourceUrl: string | null;
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
  primaryLocation: string;
};
