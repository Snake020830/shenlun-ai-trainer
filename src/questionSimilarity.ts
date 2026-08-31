import type { Question } from "./types";

export const MATERIAL_SIMILARITY_THRESHOLD = 0.78;

export interface SimilarQuestion {
  questionId: string;
  score: number;
}

function normalizeMaterialText(question: Question): string {
  return question.materials
    .map(material => material.content)
    .join("\n")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}\d]+/gu, "");
}

function grams(value: string, size = 3): Set<string> {
  if (!value) return new Set();
  if (value.length <= size) return new Set([value]);
  const result = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) {
    result.add(value.slice(index, index + size));
  }
  return result;
}

function materialIndex(question: Question): { normalized: string; grams: Set<string> } {
  const normalized = normalizeMaterialText(question);
  return { normalized, grams: grams(normalized) };
}

function similarityFromGrams(leftGrams: Set<string>, rightGrams: Set<string>): number {
  if (!leftGrams.size || !rightGrams.size) return 0;
  let intersection = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) intersection += 1;
  const union = leftGrams.size + rightGrams.size - intersection;
  const jaccard = union ? intersection / union : 0;
  const containment = intersection / Math.min(leftGrams.size, rightGrams.size);
  return Math.max(jaccard, containment);
}

export function materialSimilarity(left: Question, right: Question): number {
  if (left.id === right.id) return 1;
  return similarityFromGrams(materialIndex(left).grams, materialIndex(right).grams);
}

function exactMaterialSignature(question: Question): string {
  // Public paper questions intentionally carry the full paper. Use the stable
  // paper id instead of rehashing the same long material text for every task.
  if (question.paperId) return `paper:${question.paperId}`;
  return question.materials.map(material => {
    const content = material.content.trim();
    return `${content.length}:${content.slice(0, 96)}:${content.slice(-96)}`;
  }).join("|");
}

function hasSameMaterialContent(left: Question, right: Question): boolean {
  if (left.paperId && left.paperId === right.paperId) return true;
  if (left.materials.length !== right.materials.length) return false;
  return left.materials.every((material, index) => material.content.trim() === right.materials[index].content.trim());
}

/**
 * Fast path for the library screen. It finds questions that reuse exactly the
 * same normalized material in linear time and avoids building the much larger
 * approximate trigram candidate graph during first paint.
 */
export function buildExactQuestionSimilarityMap(questions: Question[]): Map<string, SimilarQuestion[]> {
  const result = new Map<string, SimilarQuestion[]>(questions.map(question => [question.id, []]));
  const groups = new Map<string, number[]>();
  questions.forEach((question, index) => {
    const signature = exactMaterialSignature(question);
    if (!signature) return;
    const group = groups.get(signature) ?? [];
    group.push(index);
    groups.set(signature, group);
  });
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        const leftQuestion = questions[group[left]];
        const rightQuestion = questions[group[right]];
        if (!hasSameMaterialContent(leftQuestion, rightQuestion)) continue;
        result.get(leftQuestion.id)?.push({ questionId: rightQuestion.id, score: 1 });
        result.get(rightQuestion.id)?.push({ questionId: leftQuestion.id, score: 1 });
      }
    }
  }
  return result;
}

// App-level question arrays are kept stable with useMemo. Reusing the exact
// duplicate index across library remounts avoids repeating the O(n) signature
// scan when users switch between pages and return to the question bank.
const exactQuestionSimilarityCache = new WeakMap<Question[], Map<string, SimilarQuestion[]>>();

export function getCachedExactQuestionSimilarityMap(questions: Question[]): Map<string, SimilarQuestion[]> {
  const cached = exactQuestionSimilarityCache.get(questions);
  if (cached) return cached;
  const next = buildExactQuestionSimilarityMap(questions);
  exactQuestionSimilarityCache.set(questions, next);
  return next;
}

export function buildQuestionSimilarityMap(questions: Question[], threshold = MATERIAL_SIMILARITY_THRESHOLD): Map<string, SimilarQuestion[]> {
  const result = new Map<string, SimilarQuestion[]>(questions.map(question => [question.id, []]));
  const indexes = questions.map(materialIndex);
  const matchedPairs = new Set<string>();
  const addMatch = (leftIndex: number, rightIndex: number, score: number) => {
    if (score < threshold) return;
    const pairKey = `${leftIndex}:${rightIndex}`;
    if (matchedPairs.has(pairKey)) return;
    matchedPairs.add(pairKey);
    result.get(questions[leftIndex].id)?.push({ questionId: questions[rightIndex].id, score });
    result.get(questions[rightIndex].id)?.push({ questionId: questions[leftIndex].id, score });
  };

  // Exact normalized material is common for the same paper with different word limits.
  // Resolve this case in linear time before generating approximate candidates.
  const exactGroups = new Map<string, number[]>();
  for (const [index, item] of indexes.entries()) {
    if (!item.normalized) continue;
    const group = exactGroups.get(item.normalized) ?? [];
    group.push(index);
    exactGroups.set(item.normalized, group);
  }
  for (const group of exactGroups.values()) {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) addMatch(group[left], group[right], 1);
    }
  }

  // Use an inverted trigram index for near-duplicates. The old implementation
  // compared every pair and rescanned both materials, which froze the library
  // once a real imported question bank was loaded.
  const MAX_POSTINGS_PER_GRAM = 48;
  const MAX_CANDIDATE_PAIRS = 120_000;
  const postings = new Map<string, number[]>();
  const candidates = new Set<string>();
  for (const [rightIndex, item] of indexes.entries()) {
    for (const gram of item.grams) {
      const key = `${questions[rightIndex].type}:${gram}`;
      const existing = postings.get(key) ?? [];
      for (const leftIndex of existing) {
        const pairKey = `${leftIndex}:${rightIndex}`;
        candidates.add(pairKey);
        if (candidates.size >= MAX_CANDIDATE_PAIRS) break;
      }
      if (candidates.size >= MAX_CANDIDATE_PAIRS) break;
      if (existing.length < MAX_POSTINGS_PER_GRAM) {
        existing.push(rightIndex);
        postings.set(key, existing);
      }
    }
    if (candidates.size >= MAX_CANDIDATE_PAIRS) break;
  }

  for (const pairKey of candidates) {
    const [leftIndex, rightIndex] = pairKey.split(":").map(Number);
    const score = similarityFromGrams(indexes[leftIndex].grams, indexes[rightIndex].grams);
    addMatch(leftIndex, rightIndex, score);
  }
  for (const entries of result.values()) entries.sort((left, right) => right.score - left.score);
  return result;
}
