// Express entry point. Routes live in routes/, the app is built in app.js.
import { createApp } from "./app.js";
import { env } from "./env.js";

// Last line of defence during a live demo: log and keep serving rather than exiting.
process.on("unhandledRejection", (err) => console.error("[server] unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("[server] uncaught exception:", err));

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
