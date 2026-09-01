import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./extended.css";
import "./visualPolish.css";
import "./publicExamVariants.css";
import "./publicSourceBatch.css";
import "./practiceInk.css";
import "./practiceLayoutV3.css";
import "./smartAnswerGrid.css";
import "./reviewPolish.css";
import "./essayReview.css";
import "./smartAnswerGrid";

const MATERIAL_LAYOUT_V3_MIGRATION_KEY = "shenlun:material-layout:v3";
if (!localStorage.getItem(MATERIAL_LAYOUT_V3_MIGRATION_KEY)) {
  localStorage.setItem("shenlun:material-font-size:v2", "17");
  localStorage.setItem(MATERIAL_LAYOUT_V3_MIGRATION_KEY, "1");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
