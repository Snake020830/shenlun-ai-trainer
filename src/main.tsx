import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./extended.css";
import "./visualPolish.css";
import "./publicExamVariants.css";
import "./publicSourceBatch.css";
import "./practiceInk.css";
import "./reviewPolish.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
