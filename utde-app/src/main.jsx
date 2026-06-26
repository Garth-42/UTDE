import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import App from "./App";
import { registerOcctParser } from "./lib/occt";

// Register the in-browser STEP parser (opencascade.js). The WASM kernel itself
// loads lazily on the first import, so this just wires the runtime up.
registerOcctParser();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
