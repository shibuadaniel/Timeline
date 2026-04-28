import "dotenv/config";
import {
  buildSnapshot,
  fetchScenesFromNotion,
  readIngestConfigFromEnv,
  writeSnapshotArtifacts,
} from "./ingestPipeline.js";

async function main() {
  const config = readIngestConfigFromEnv();
  const records = await fetchScenesFromNotion(config);
  const snapshot = buildSnapshot(records);
  const artifacts = await writeSnapshotArtifacts(snapshot);

  console.log(
    `Ingested ${snapshot.recordCount} records. Wrote:\n- ${artifacts.latestPath}\n- ${artifacts.immutablePath}\n- ${artifacts.manifestPath}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
