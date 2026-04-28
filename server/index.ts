import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  fetchScenesFromNotion,
  readIngestConfigFromEnv,
} from "./ingestPipeline.js";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors({ origin: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/scenes", async (_req, res) => {
  try {
    const rows = await fetchScenesFromNotion(readIngestConfigFromEnv());
    res.json({ scenes: rows });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other process (e.g. an old dev server) or set PORT=3002 in .env — the Vite proxy reads PORT too.`
    );
  }
  process.exit(1);
});
