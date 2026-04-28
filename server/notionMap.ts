import { NOTION_PROPS } from "./notionProperties.js";

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

type NotionPage = {
  object: string;
  id: string;
  properties: Record<string, unknown>;
};

function isFullPage(p: unknown): p is NotionPage {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as NotionPage).object === "page" &&
    "properties" in p
  );
}

function richTextPlain(
  prop: { type: string; rich_text?: Array<{ plain_text: string }> } | undefined
): string {
  if (!prop || prop.type !== "rich_text" || !prop.rich_text) return "";
  return prop.rich_text.map((t) => t.plain_text).join("");
}

function titlePlain(
  prop:
    | { type: string; title?: Array<{ plain_text: string }> }
    | undefined
): string {
  if (!prop || prop.type !== "title" || !prop.title) return "";
  return prop.title.map((t) => t.plain_text).join("");
}

function multiSelectNames(
  prop:
    | { type: string; multi_select?: Array<{ name: string }> }
    | undefined
): string[] {
  if (!prop || prop.type !== "multi_select" || !prop.multi_select) return [];
  return prop.multi_select.map((o) => o.name);
}

function numberVal(
  prop: { type: string; number?: number | null } | undefined
): number | null {
  if (!prop || prop.type !== "number") return null;
  return prop.number ?? null;
}

function notionPageUrl(pageId: string): string {
  const hex = pageId.replaceAll("-", "");
  return `https://www.notion.so/${hex}`;
}

export function mapPageToScene(page: unknown): SceneDTO | null {
  if (!isFullPage(page)) return null;
  const props = page.properties;
  const titleProp = props[NOTION_PROPS.sceneTitle];
  const yearProp = props[NOTION_PROPS.year];
  const locProp = props[NOTION_PROPS.location];
  const stageProp = props[NOTION_PROPS.onStage];
  const seqProp = props[NOTION_PROPS.sequence];

  const sceneDescription = titlePlain(
    titleProp as { type: string; title?: Array<{ plain_text: string }> }
  );
  const yearRaw = (() => {
    const t = richTextPlain(
      yearProp as {
        type: string;
        rich_text?: Array<{ plain_text: string }>;
      }
    ).trim();
    return t.length ? t : null;
  })();

  return {
    id: page.id,
    url: notionPageUrl(page.id),
    sourceUrl: null,
    sceneDescription,
    yearRaw,
    sequence: numberVal(
      seqProp as { type: string; number?: number | null }
    ),
    locations: multiSelectNames(
      locProp as { type: string; multi_select?: Array<{ name: string }> }
    ),
    onStage: multiSelectNames(
      stageProp as { type: string; multi_select?: Array<{ name: string }> }
    ),
  };
}
