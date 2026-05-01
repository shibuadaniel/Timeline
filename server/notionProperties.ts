/** Property names as they appear in the sandbox Notion schema (API v2). */
export const NOTION_PROPS = {
  /** Title column (typo preserved to match Notion). */
  sceneTitle: "Scene Descriptioni",
  year: "Year",
  location: "Location",
  onStage: "On stage",
  sequence: "Sequence #",
  /** Checkbox in Notion; omit from DB until the column exists. */
  keyEvent: "Key event",
} as const;
