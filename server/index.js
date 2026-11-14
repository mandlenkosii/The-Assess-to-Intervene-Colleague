// Express entry point. Routes live in routes/, the app is built in app.js.
import { createApp } from "./app.js";
import { env } from "./env.js";
import { seedCache } from "./llm.js";

// Last line of defence during a live demo: log and keep serving rather than exiting.
process.on("unhandledRejection", (err) => console.error("[server] unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("[server] uncaught exception:", err));

if (!env.FAKE_LLM) {
  const seeded = await seedCache().catch((err) => { console.error("[server] demo cache not seeded:", err.message); return 0; });
  if (seeded) console.log(`[server] demo cache: ${seeded} saved model answers ready`);
}

const { app, store } = createApp();
const latest = store.latest();
const server = app.listen(env.PORT, () => {
  console.log(`server on http://localhost:${env.PORT}${latest ? ` · latest run ${latest.id} (${latest.status})` : ""}`);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[server] port ${env.PORT} is already in use. Stop the other server or set PORT in .env.`);
    process.exit(1);
  }
  throw err;
});
