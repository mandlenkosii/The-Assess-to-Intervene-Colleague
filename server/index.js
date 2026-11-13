// Express entry point. Routes live in routes/, the app is built in app.js.
import { createApp } from "./app.js";
import { env } from "./env.js";

const { app } = createApp();
app.listen(env.PORT, () => console.log(`server on http://localhost:${env.PORT}`));
