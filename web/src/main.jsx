// Placeholder so `npm run dev` works at H2. Owethu replaces this with App.jsx + theme.css in phase 0.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function Placeholder() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);
  return (
    <main style={{ minHeight: "100vh", background: "#FFF6CC", color: "#3F1D4A", fontFamily: "system-ui, sans-serif", padding: 32 }}>
      <h1 style={{ marginTop: 0 }}>Assess-to-Intervene Colleague</h1>
      <p>API: {health ? (health.ok ? "connected" : "offline") : "checking…"}</p>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Placeholder />);
