import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Client } from "@notionhq/client";
import { mapPageToScene, type SceneDTO } from "./notionMap.js";
import { NOTION_PROPS } from "./notionProperties.js";

export type SnapshotV1 = {
  version: "v1";
  generatedAt: string;
  source: "notion";
  recordCount: number;
  records: SceneDTO[];
};

type IngestConfig = {
  notionApiKey: string;
  notionDatabaseId: string;
  sequenceMin: number;
  sequenceMax: number;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readIngestConfigFromEnv(): IngestConfig {
  const notionApiKey = process.env.NOTION_API_KEY?.trim();
  const notionDatabaseId = process.env.NOTION_DATABASE_ID?.trim();
  if (!notionApiKey || !notionDatabaseId) {
    throw new Error(
      "Missing NOTION_API_KEY or NOTION_DATABASE_ID. Copy .env.example to .env and fill values."
    );
  }

  return {
    notionApiKey,
    notionDatabaseId,
    sequenceMin: envNumber("PILOT_SEQUENCE_MIN", 100),
    sequenceMax: envNumber("PILOT_SEQUENCE_MAX", 120),
  };
}

export async function fetchScenesFromNotion(
  config: IngestConfig
): Promise<SceneDTO[]> {
  const notion = new Client({ auth: config.notionApiKey });
  const rows: SceneDTO[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.databases.query({
      database_id: config.notionDatabaseId,
      start_cursor: cursor,
      page_size: 100,
      filter: {
        and: [
          {
            property: NOTION_PROPS.sequence,
            number: { greater_than_or_equal_to: config.sequenceMin },
          },
          {
            property: NOTION_PROPS.sequence,
            number: { less_than_or_equal_to: config.sequenceMax },
          },
        ],
      },
    });

    for (const page of response.results) {
      const scene = mapPageToScene(page);
      if (!scene) continue;
      scene.sourceUrl = await findEmbeddedUrlInPage(notion, scene.id);
      rows.push(scene);
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return rows.sort((a, b) => {
    const sa = a.sequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sequence ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.sceneDescription.localeCompare(b.sceneDescription);
  });
}

function urlsFromRichText(
  richText: Array<{ href?: string | null; text?: { link?: { url?: string | null } | null } }>
): string[] {
  const urls: string[] = [];
  for (const item of richText) {
    const href = item.href ?? item.text?.link?.url ?? null;
    if (href) urls.push(href);
  }
  return urls;
}

function firstUrlFromBlock(block: { type?: string; [key: string]: unknown }): string | null {
  const type = typeof block.type === "string" ? block.type : null;
  if (!type) return null;

  if (type === "bookmark") {
    const value = block.bookmark as { url?: string } | undefined;
    return value?.url ?? null;
  }
  if (type === "embed") {
    const value = block.embed as { url?: string } | undefined;
    return value?.url ?? null;
  }
  if (type === "link_preview") {
    const value = block.link_preview as { url?: string } | undefined;
    return value?.url ?? null;
  }
  if (type === "video") {
    const value = block.video as { type?: string; external?: { url?: string } } | undefined;
    if (value?.type === "external") return value.external?.url ?? null;
  }

  const richTextContainer = block[type] as
    | { rich_text?: Array<{ href?: string | null; text?: { link?: { url?: string | null } | null } }> }
    | undefined;
  if (richTextContainer?.rich_text?.length) {
    return urlsFromRichText(richTextContainer.rich_text)[0] ?? null;
  }

  return null;
}

async function findEmbeddedUrlInPage(
  notion: Client,
  pageId: string
): Promise<string | null> {
  let cursor: string | undefined;
  do {
    const result = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of result.results) {
      const url = firstUrlFromBlock(block as { type?: string; [key: string]: unknown });
      if (url) return url;
    }

    cursor = result.has_more ? result.next_cursor ?? undefined : undefined;
  } while (cursor);

  return null;
}

export function buildSnapshot(records: SceneDTO[]): SnapshotV1 {
  return {
    version: "v1",
    generatedAt: new Date().toISOString(),
    source: "notion",
    recordCount: records.length,
    records,
  };
}

export async function writeSnapshotArtifacts(
  snapshot: SnapshotV1,
  outDir = path.resolve(process.cwd(), "public/data")
): Promise<{ latestPath: string; immutablePath: string; manifestPath: string }> {
  await mkdir(outDir, { recursive: true });
  const json = JSON.stringify(snapshot, null, 2);
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 12);

  const immutableName = `snapshot.${hash}.json`;
  const immutablePath = path.join(outDir, immutableName);
  const latestPath = path.join(outDir, "latest.json");
  const manifestPath = path.join(outDir, "manifest.json");

  await writeFile(immutablePath, json, "utf8");
  await writeFile(latestPath, json, "utf8");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: snapshot.version,
        generatedAt: snapshot.generatedAt,
        latest: immutableName,
        recordCount: snapshot.recordCount,
      },
      null,
      2
    ),
    "utf8"
  );

  return { latestPath, immutablePath, manifestPath };
}
