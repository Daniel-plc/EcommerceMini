import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 1. importa Analytics
import { Analytics } from "@vercel/analytics/react";

createRoot(document.getElementById("root")!).render(
  <App />
);

// 2. monta Analytics subito dopo aver renderizzato App
createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Analytics />
  </>
);

