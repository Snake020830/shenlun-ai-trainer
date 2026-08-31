import { isTauri } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import { validateBenchmarkCase } from "./validateCase";
import type { BenchmarkValidationResult, GradingBenchmarkCase } from "./types";

const DATABASE_URL = "sqlite:shenlun-trainer.db";
const BENCHMARK_DRAFTS_KEY = "shenlun:benchmark-drafts:v1";

interface BenchmarkDraftRow {
  case_id: string;
  case_json: string;
}

let databasePromise: Promise<Database> | null = null;

function readLocalCases(): GradingBenchmarkCase[] {
  try {
    const raw = localStorage.getItem(BENCHMARK_DRAFTS_KEY);
    return raw ? JSON.parse(raw) as GradingBenchmarkCase[] : [];
  } catch {
    return [];
  }
}

function writeLocalCases(cases: GradingBenchmarkCase[]): void {
  localStorage.setItem(BENCHMARK_DRAFTS_KEY, JSON.stringify(cases));
}

async function getBenchmarkDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql")
      .then(({ default: DatabaseApi }) => DatabaseApi.load(DATABASE_URL));
  }
  return databasePromise;
}

function parseCase(raw: string): GradingBenchmarkCase | null {
  try {
    return JSON.parse(raw) as GradingBenchmarkCase;
  } catch {
    return null;
  }
}

export async function getBenchmarkCase(caseId: string): Promise<GradingBenchmarkCase | null> {
  if (!isTauri()) {
    return readLocalCases().find(item => item.id === caseId) ?? null;
  }
  const db = await getBenchmarkDatabase();
  const rows = await db.select<BenchmarkDraftRow[]>(
    "SELECT case_id, case_json FROM benchmark_drafts WHERE case_id = $1 LIMIT 1",
    [caseId]
  );
  return rows[0] ? parseCase(rows[0].case_json) : null;
}

export async function saveBenchmarkCase(testCase: GradingBenchmarkCase): Promise<BenchmarkValidationResult> {
  const validation = validateBenchmarkCase(testCase);
  if (!validation.valid) {
    throw new Error(`Benchmark case validation failed: ${validation.errors.join("; ")}`);
  }

  if (!isTauri()) {
    const cases = readLocalCases();
    const index = cases.findIndex(item => item.id === testCase.id);
    if (index < 0) throw new Error(`Benchmark case ${testCase.id} does not exist and cannot be created by the annotation editor.`);
    const next = [...cases];
    next[index] = testCase;
    writeLocalCases(next);
    return validation;
  }

  const db = await getBenchmarkDatabase();
  const rows = await db.select<BenchmarkDraftRow[]>(
    "SELECT case_id, case_json FROM benchmark_drafts WHERE case_id = $1 LIMIT 1",
    [testCase.id]
  );
  if (!rows[0]) {
    throw new Error(`Benchmark case ${testCase.id} does not exist and cannot be created by the annotation editor.`);
  }
  await db.execute(
    "UPDATE benchmark_drafts SET case_json = $1 WHERE case_id = $2",
    [JSON.stringify(testCase), testCase.id]
  );
  return validation;
}
