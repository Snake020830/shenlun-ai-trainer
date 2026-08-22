import { canImportParsedPublicExam, parseGkzhentiExamHtml, type ParsedPublicExam } from "./publicExamParser";
import { fetchPublicSourceText, getPublicExamYearRange, isRecentPublicExamYear } from "./publicSourceDiscovery";
import { getPublicSourceProvider } from "./publicSourceProviders";
import { publicSourceStore, type PublicSourceCandidate } from "./publicSourceStore";
import { persistence } from "./storage";
import type { LocalQuestionInput, Question } from "./types";

export interface PublicExamPreview {
  candidate: PublicSourceCandidate;
  exam: ParsedPublicExam;
  retrievedAt: string;
}

export interface PublicExamImportResult {
  questions: Question[];
  newlyImportedQuestionIds: string[];
  reusedQuestionIds: string[];
}

export function publicQuestionId(candidateId: string, taskIndex: number): string {
  if (!candidateId.trim()) throw new Error("Public source candidate id is required.");
  if (!Number.isInteger(taskIndex) || taskIndex < 0) throw new Error("Public exam task index is invalid.");
  return `publicq:${candidateId}:task:${taskIndex + 1}`;
}

function assertRecentCandidate(candidate: PublicSourceCandidate, referenceDate = new Date()): void {
  if (isRecentPublicExamYear(candidate.year, referenceDate)) return;
  const { minYear, maxYear } = getPublicExamYearRange(referenceDate);
  throw new Error(`当前正式公开题库只支持最近10年（${minYear}—${maxYear}）整卷。`);
}

function sortedExamMaterials(exam: ParsedPublicExam): ParsedPublicExam["materials"] {
  return [...exam.materials].sort((left, right) => left.sourceNumber - right.sourceNumber);
}

/**
 * Per-question practice should only carry the material scope named by the task.
 * This keeps the workspace focused and prevents the grader from receiving unrelated
 * material from the same paper. Essay questions intentionally keep the whole paper.
 */
export function selectTaskMaterials(
  exam: ParsedPublicExam,
  task: ParsedPublicExam["tasks"][number]
): ParsedPublicExam["materials"] {
  const materials = sortedExamMaterials(exam);
  if (task.questionType === "文章写作" || task.materialNumbers.length === 0) return materials;

  const requestedNumbers = [...new Set(task.materialNumbers)].sort((left, right) => left - right);
  const requested = new Set(requestedNumbers);
  const selected = materials.filter(material => requested.has(material.sourceNumber));
  const selectedNumbers = new Set(selected.map(material => material.sourceNumber));
  const missingNumbers = requestedNumbers.filter(number => !selectedNumbers.has(number));
  if (missingNumbers.length) {
    throw new Error(`第 ${task.taskIndex + 1} 题引用的材料 ${missingNumbers.join("、")} 未在整卷材料中找到，禁止自动导入。`);
  }
  return selected;
}

function buildMaterialText(materials: ParsedPublicExam["materials"]): string {
  return materials
    .map(material => material.content.replace(/\n\s*\n+/g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

function taskPrompt(task: ParsedPublicExam["tasks"][number]): string {
  return task.requirements
    ? `${task.prompt}\n要求：${task.requirements}`
    : task.prompt;
}

function questionInputForTask(candidate: PublicSourceCandidate, exam: ParsedPublicExam, taskIndex: number): LocalQuestionInput {
  const task = exam.tasks[taskIndex];
  if (!task) throw new Error(`Public exam task ${taskIndex + 1} does not exist.`);
  if (task.score === null || task.wordLimit === null) {
    throw new Error(`第 ${taskIndex + 1} 题缺少分值或字数限制，禁止自动导入。`);
  }

  const scopedMaterials = selectTaskMaterials(exam, task);
  return {
    id: publicQuestionId(candidate.id, taskIndex),
    title: `${candidate.title} · 第${taskIndex + 1}题`,
    year: candidate.year ?? new Date().getFullYear(),
    region: candidate.region ?? "公开真题",
    type: task.questionType,
    difficulty: task.questionType === "文章写作" ? "挑战" : "进阶",
    score: task.score,
    wordLimit: task.wordLimit,
    prompt: taskPrompt(task),
    // Compatibility fallback only. Structured materials below are the authoritative path.
    materialText: buildMaterialText(scopedMaterials),
    materials: scopedMaterials.map(material => ({ label: material.label, content: material.content })),
    tags: [
      ...task.tags,
      ...(candidate.paperVariant ? [candidate.paperVariant] : []),
      ...(candidate.region ? [candidate.region] : []),
      ...(candidate.metadata?.recallVersion ? ["回忆版"] : [])
    ]
  };
}

async function sha256Text(value: string): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function previewPublicExam(candidate: PublicSourceCandidate): Promise<PublicExamPreview> {
  assertRecentCandidate(candidate);
  if (candidate.sourceKind !== "public-web") {
    throw new Error("当前整卷自动解析仅支持公开 HTML 页面；PDF 将走独立 PDF 导入流程。");
  }
  const provider = getPublicSourceProvider(candidate.providerId);
  if (provider?.role !== "primary-structured") {
    throw new Error("该来源当前只用于发现或交叉核验，尚未通过结构化整卷解析验证。");
  }
  const response = await fetchPublicSourceText(candidate.sourceUrl);
  const exam = parseGkzhentiExamHtml(response.body, candidate);
  return { candidate, exam, retrievedAt: new Date().toISOString() };
}

export async function importPublicExam(preview: PublicExamPreview): Promise<PublicExamImportResult> {
  const { candidate, exam, retrievedAt } = preview;
  assertRecentCandidate(candidate);
  if (!canImportParsedPublicExam(exam)) {
    throw new Error("整卷解析仍有结构警告或缺少分值/字数，禁止自动写入正式题库。请先人工核验。");
  }

  const provider = getPublicSourceProvider(candidate.providerId);
  if (provider?.role !== "primary-structured") {
    throw new Error("只有经过结构化页面验证的主来源才能自动写入正式题库。");
  }

  const existingLinks = await publicSourceStore.listCandidateQuestionLinks(candidate.id);
  const linksByTask = new Map(existingLinks.map(link => [link.taskIndex, link]));
  const importedQuestions: Question[] = [];
  const newlyImportedQuestionIds: string[] = [];
  const reusedQuestionIds: string[] = [];
  const materialFingerprint = exam.materials.map(item => `${item.label}\n${item.content}`).join("\n\n");
  const contentHash = await sha256Text(`${candidate.sourceUrl}\n${materialFingerprint}\n${exam.tasks.map(task => taskPrompt(task)).join("\n")}`);

  for (let taskIndex = 0; taskIndex < exam.tasks.length; taskIndex += 1) {
    const existingLink = linksByTask.get(taskIndex);
    if (existingLink) {
      reusedQuestionIds.push(existingLink.questionId);
      continue;
    }

    // Deterministic id means a retry after a partial persistence failure upserts the
    // same question instead of creating a second UUID-backed copy.
    const question = await persistence.addImportedQuestion(questionInputForTask(candidate, exam, taskIndex));
    const now = new Date().toISOString();
    await publicSourceStore.saveQuestionSource({
      questionId: question.id,
      sourceKind: "public-web",
      sourceName: provider.name,
      sourceUrl: candidate.sourceUrl,
      sourceTitle: candidate.title,
      retrievedAt,
      importedAt: now,
      ...(contentHash ? { contentHash } : {}),
      rightsNote: "公开可访问来源；正文仅按需保存到用户本机题库，GitHub 仓库不打包第三方整卷全文。",
      isRecallVersion: Boolean(candidate.metadata?.recallVersion)
    });
    await publicSourceStore.linkCandidateQuestion({
      candidateId: candidate.id,
      questionId: question.id,
      taskIndex,
      createdAt: now
    });
    importedQuestions.push(question);
    newlyImportedQuestionIds.push(question.id);
  }

  const finalLinks = await publicSourceStore.listCandidateQuestionLinks(candidate.id);
  const importedTaskIndexes = new Set(finalLinks.map(link => link.taskIndex));
  const complete = exam.tasks.every((_, taskIndex) => importedTaskIndexes.has(taskIndex));
  if (!complete) {
    throw new Error("整卷只完成了部分题目导入。来源不会标记为“已导入”；再次重试会从缺失题号继续。");
  }

  await publicSourceStore.markCandidateImported(candidate.id, finalLinks[0]?.questionId);
  return {
    questions: importedQuestions,
    newlyImportedQuestionIds,
    reusedQuestionIds
  };
}
