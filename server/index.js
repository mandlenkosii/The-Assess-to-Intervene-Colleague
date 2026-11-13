import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
