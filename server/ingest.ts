import "dotenv/config";
import {
  buildSnapshot,
  fetchScenesFromNotion,
  persistSourceImagesToPublic,
  readIngestConfigFromEnv,
  writeSnapshotArtifacts,
} from "./ingestPipeline.js";

async function main() {
  const config = readIngestConfigFromEnv();
  const records = await fetchScenesFromNotion(config);
  await persistSourceImagesToPublic(records);
  const snapshot = buildSnapshot(records);
  const artifacts = await writeSnapshotArtifacts(snapshot, undefined, config.chunkSize);

  console.log(
    `Ingested ${snapshot.recordCount} records. Wrote:\n- ${artifacts.latestPath}\n- ${artifacts.immutablePath}\n- ${artifacts.manifestPath}\n- ${artifacts.chunkPaths.length} chunk file(s)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
