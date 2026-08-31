export interface EssayDrillDraft {
  mode: EssayDrillMode;
  outline: {
    title: string;
    thesis: string;
    subpoints: string[];
    evidence: string;
  };
  paragraph: {
    claim: string;
    text: string;
  };
  evidence: {
    caseText: string;
    mechanism: string;
    target: string;
  };
  updatedAt?: string;
}

export type EssayDrillMode = "outline" | "paragraph" | "evidence";

const STORAGE_KEY = "shenlun:essay-drills:v1";

export function createEssayDrillDraft(): EssayDrillDraft {
  return {
    mode: "outline",
    outline: { title: "", thesis: "", subpoints: ["", "", ""], evidence: "" },
    paragraph: { claim: "", text: "" },
    evidence: { caseText: "", mechanism: "", target: "" }
  };
}

function readAll(): Record<string, EssayDrillDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as Record<string, EssayDrillDraft>;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function loadEssayDrillDraft(questionId: string): EssayDrillDraft {
  const stored = readAll()[questionId];
  if (!stored) return createEssayDrillDraft();
  const fallback = createEssayDrillDraft();
  return {
    ...fallback,
    ...stored,
    mode: stored.mode === "paragraph" || stored.mode === "evidence" ? stored.mode : "outline",
    outline: { ...fallback.outline, ...(stored.outline ?? {}), subpoints: Array.isArray(stored.outline?.subpoints) ? [...stored.outline.subpoints, "", "", ""].slice(0, 3) : fallback.outline.subpoints },
    paragraph: { ...fallback.paragraph, ...(stored.paragraph ?? {}) },
    evidence: { ...fallback.evidence, ...(stored.evidence ?? {}) }
  };
}

export function saveEssayDrillDraft(questionId: string, draft: EssayDrillDraft): void {
  if (!questionId.trim()) return;
  const all = readAll();
  all[questionId] = { ...draft, updatedAt: new Date().toISOString() };
  const entries = Object.entries(all).slice(-100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
}
