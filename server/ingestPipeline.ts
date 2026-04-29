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
  chunkSize: number;
  chunkCount: number;
  chunks: string[];
};

type IngestConfig = {
  notionApiKey: string;
  notionDatabaseId: string;
  sequenceMin: number;
  sequenceMax: number;
  chunkSize: number;
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
    sequenceMax: envNumber("PILOT_SEQUENCE_MAX", 350),
    chunkSize: Math.max(1, Math.floor(envNumber("SNAPSHOT_CHUNK_SIZE", 500))),
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
      const extracted = await findSourceUrlAndImageAbove(notion, scene.id);
      scene.sourceUrl = extracted.sourceUrl;
      scene.sourceImageUrl = extracted.sourceImageUrl;
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

type NotionBlockLite = { type?: string; [key: string]: unknown };

function imageUrlFromBlock(block: NotionBlockLite): string | null {
  if (block.type !== "image") return null;
  const image = block.image as
    | {
        type?: string;
        external?: { url?: string };
        file?: { url?: string };
      }
    | undefined;
  if (!image) return null;
  if (image.type === "external") return image.external?.url ?? null;
  if (image.type === "file") return image.file?.url ?? null;
  return image.external?.url ?? image.file?.url ?? null;
}

async function firstImageUrlInBlockTree(
  notion: Client,
  block: NotionBlockLite
): Promise<string | null> {
  const direct = imageUrlFromBlock(block);
  if (direct) return direct;

  const b = block as { has_children?: boolean; id?: string };
  if (!b.has_children || !b.id) return null;

  let cursor: string | undefined;
  do {
    const res = await notion.blocks.children.list({
      block_id: b.id,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const child of res.results) {
      const childLite = child as NotionBlockLite;
      const nested = await firstImageUrlInBlockTree(notion, childLite);
      if (nested) return nested;
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  return null;
}

async function listAllChildBlocks(
  notion: Client,
  pageId: string
): Promise<NotionBlockLite[]> {
  const blocks: NotionBlockLite[] = [];
  let cursor: string | undefined;
  do {
    const result = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of result.results) {
      blocks.push(block as NotionBlockLite);
    }
    cursor = result.has_more ? result.next_cursor ?? undefined : undefined;
  } while (cursor);
  return blocks;
}

async function findSourceUrlAndImageAbove(
  notion: Client,
  pageId: string
): Promise<{ sourceUrl: string | null; sourceImageUrl: string | null }> {
  const blocks = await listAllChildBlocks(notion, pageId);
  for (let i = 0; i < blocks.length; i++) {
    const url = firstUrlFromBlock(blocks[i]);
    if (!url) continue;
    let sourceImageUrl: string | null = null;
    if (i > 0) {
      sourceImageUrl = await firstImageUrlInBlockTree(notion, blocks[i - 1]);
    }
    return { sourceUrl: url, sourceImageUrl };
  }
  return { sourceUrl: null, sourceImageUrl: null };
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
  outDir = path.resolve(process.cwd(), "public/data"),
  chunkSize = Math.max(1, Math.floor(envNumber("SNAPSHOT_CHUNK_SIZE", 500)))
): Promise<{
  latestPath: string;
  immutablePath: string;
  manifestPath: string;
  chunkPaths: string[];
}> {
  await mkdir(outDir, { recursive: true });
  const json = JSON.stringify(snapshot, null, 2);
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 12);

  const immutableName = `snapshot.${hash}.json`;
  const immutablePath = path.join(outDir, immutableName);
  const latestPath = path.join(outDir, "latest.json");
  const manifestPath = path.join(outDir, "manifest.json");
  const chunksDir = path.join(outDir, "chunks");
  await mkdir(chunksDir, { recursive: true });

  await writeFile(immutablePath, json, "utf8");
  await writeFile(latestPath, json, "utf8");

  const chunkNames: string[] = [];
  const chunkPaths: string[] = [];
  const chunkCount = Math.max(1, Math.ceil(snapshot.records.length / chunkSize));
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    const records = snapshot.records.slice(start, end);
    const chunk: SnapshotChunkV1 = {
      version: "v1-chunk",
      generatedAt: snapshot.generatedAt,
      source: snapshot.source,
      chunkIndex: i,
      chunkCount,
      recordCount: records.length,
      records,
    };
    const chunkName = `chunks/snapshot.${hash}.part.${String(i).padStart(3, "0")}.json`;
    const chunkPath = path.join(outDir, chunkName);
    chunkNames.push(chunkName);
    chunkPaths.push(chunkPath);
    await writeFile(chunkPath, JSON.stringify(chunk, null, 2), "utf8");
  }

  const manifest: DataManifestV1 = {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    latest: immutableName,
    recordCount: snapshot.recordCount,
    chunkSize,
    chunkCount,
    chunks: chunkNames,
  };

  await writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  return { latestPath, immutablePath, manifestPath, chunkPaths };
}
