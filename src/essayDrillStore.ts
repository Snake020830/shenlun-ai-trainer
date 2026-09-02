export type EssayDrillMode = "theme" | "outline" | "paragraph" | "evidence" | "closing";
export type EssaySubpointSource = "prompt" | "prompt-material" | "full-material";

export interface EssayDrillDraft {
  mode: EssayDrillMode;
  theme: { quickTitle: string; quickText: string; keywords: string; themeType: "" | "single" | "double" | "multi"; title: string; thesis: string };
  outline: { quickText: string; subpoints: string[]; sources: EssaySubpointSource[]; evidenceLinks: string[] };
  paragraph: { quickText: string; claim: string; analysis: string; caseText: string; commentary: string; returnToClaim: string };
  evidence: { quickText: string; caseText: string; mechanism: string; target: string };
  closing: { quickText: string; thesisReturn: string; subpointEcho: string; outlook: string };
  updatedAt?: string;
}

const STORAGE_KEY = "shenlun:essay-drills:v2";
const LEGACY_STORAGE_KEY = "shenlun:essay-drills:v1";

export interface EssayDrillDraftEntry {
  questionId: string;
  draft: EssayDrillDraft;
}

export function createEssayDrillDraft(): EssayDrillDraft {
  return {
    mode: "theme",
    theme: { quickTitle: "", quickText: "", keywords: "", themeType: "", title: "", thesis: "" },
    outline: { quickText: "", subpoints: ["", "", ""], sources: ["prompt", "prompt-material", "full-material"], evidenceLinks: ["", "", ""] },
    paragraph: { quickText: "", claim: "", analysis: "", caseText: "", commentary: "", returnToClaim: "" },
    evidence: { quickText: "", caseText: "", mechanism: "", target: "" },
    closing: { quickText: "", thesisReturn: "", subpointEcho: "", outlook: "" }
  };
}

function readAll(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as Record<string, unknown>;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function loadEssayDrillDraft(questionId: string): EssayDrillDraft {
  const raw = readAll()[questionId];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createEssayDrillDraft();
  const stored = raw as Partial<EssayDrillDraft> & {
    outline?: Partial<EssayDrillDraft["outline"]> & { title?: string; thesis?: string; evidence?: string };
    paragraph?: Partial<EssayDrillDraft["paragraph"]> & { text?: string };
  };
  const fallback = createEssayDrillDraft();
  const legacyEvidence = typeof stored.outline?.evidence === "string" ? stored.outline.evidence : "";
  const legacyText = typeof stored.paragraph?.text === "string" ? stored.paragraph.text : "";
  const modes: EssayDrillMode[] = ["theme", "outline", "paragraph", "evidence", "closing"];
  const theme = {
    ...fallback.theme,
    ...(stored.theme ?? {}),
    title: stored.theme?.title ?? stored.outline?.title ?? "",
    thesis: stored.theme?.thesis ?? stored.outline?.thesis ?? ""
  };
  const outline = {
    ...fallback.outline,
    ...(stored.outline ?? {}),
    subpoints: Array.isArray(stored.outline?.subpoints) ? [...stored.outline.subpoints, "", "", ""].slice(0, 3) : fallback.outline.subpoints,
    sources: Array.isArray(stored.outline?.sources) ? [...stored.outline.sources, ...fallback.outline.sources].slice(0, 3) : fallback.outline.sources,
    evidenceLinks: Array.isArray(stored.outline?.evidenceLinks) ? [...stored.outline.evidenceLinks, "", "", ""].slice(0, 3) : [legacyEvidence, "", ""]
  };
  const paragraph = { ...fallback.paragraph, ...(stored.paragraph ?? {}), analysis: stored.paragraph?.analysis ?? legacyText };
  const evidence = { ...fallback.evidence, ...(stored.evidence ?? {}) };
  const closing = { ...fallback.closing, ...(stored.closing ?? {}) };
  return {
    ...fallback,
    ...stored,
    mode: modes.includes(stored.mode as EssayDrillMode) ? stored.mode as EssayDrillMode : "theme",
    theme: { ...theme, quickTitle: theme.quickTitle || theme.title, quickText: theme.quickText || theme.thesis || theme.title || theme.keywords },
    outline: { ...outline, quickText: outline.quickText || outline.subpoints.filter(Boolean).join("\n") },
    paragraph: { ...paragraph, quickText: paragraph.quickText || [paragraph.claim, paragraph.analysis, paragraph.caseText, paragraph.commentary, paragraph.returnToClaim].filter(Boolean).join(" ") },
    evidence: { ...evidence, quickText: evidence.quickText || [evidence.caseText, evidence.mechanism, evidence.target].filter(Boolean).join("；") },
    closing: { ...closing, quickText: closing.quickText || [closing.thesisReturn, closing.subpointEcho, closing.outlook].filter(Boolean).join(" ") }
  };
}

export function saveEssayDrillDraft(questionId: string, draft: EssayDrillDraft): void {
  if (!questionId.trim()) return;
  const all = readAll();
  all[questionId] = { ...draft, updatedAt: new Date().toISOString() };
  const entries = Object.entries(all).slice(-100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

export function listEssayDrillDrafts(): EssayDrillDraftEntry[] {
  return Object.keys(readAll()).map(questionId => ({ questionId, draft: loadEssayDrillDraft(questionId) }));
}

export function deleteEssayDrillDraft(questionId: string): void {
  const all = readAll();
  if (!(questionId in all)) return;
  delete all[questionId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
