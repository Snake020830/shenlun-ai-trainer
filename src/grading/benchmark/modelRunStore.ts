import { isTauri } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import { getBenchmarkCase } from "./caseStore";
import type { BenchmarkModelRun } from "./types";
import { validateBenchmarkModelRun } from "./validateModelRun";

const DATABASE_URL = "sqlite:shenlun-trainer.db";
const MODEL_RUNS_KEY = "shenlun:benchmark-model-runs:v1";

interface ModelRunRow {
  run_id: string;
  case_id: string;
  run_json: string;
  created_at: string;
}

let databasePromise: Promise<Database> | null = null;

function readLocalRuns(): BenchmarkModelRun[] {
  try {
    const raw = localStorage.getItem(MODEL_RUNS_KEY);
    return raw ? JSON.parse(raw) as BenchmarkModelRun[] : [];
  } catch {
    return [];
  }
}

function writeLocalRuns(runs: BenchmarkModelRun[]): void {
  localStorage.setItem(MODEL_RUNS_KEY, JSON.stringify(runs));
}

async function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql")
      .then(({ default: DatabaseApi }) => DatabaseApi.load(DATABASE_URL));
  }
  return databasePromise;
}

function parseRun(raw: string): BenchmarkModelRun | null {
  try {
    return JSON.parse(raw) as BenchmarkModelRun;
  } catch {
    return null;
  }
}

export async function getBenchmarkModelRun(runId: string): Promise<BenchmarkModelRun | null> {
  if (!isTauri()) return readLocalRuns().find(item => item.runId === runId) ?? null;
  const db = await getDatabase();
  const rows = await db.select<ModelRunRow[]>(
    "SELECT run_id, case_id, run_json, created_at FROM benchmark_model_runs WHERE run_id = $1 LIMIT 1",
    [runId]
  );
  return rows[0] ? parseRun(rows[0].run_json) : null;
}

export async function listBenchmarkModelRuns(caseId: string): Promise<BenchmarkModelRun[]> {
  if (!isTauri()) return readLocalRuns().filter(item => item.caseId === caseId);
  const db = await getDatabase();
  const rows = await db.select<ModelRunRow[]>(
    `SELECT run_id, case_id, run_json, created_at
     FROM benchmark_model_runs WHERE case_id = $1 ORDER BY created_at DESC`,
    [caseId]
  );
  return rows.map(row => parseRun(row.run_json)).filter((item): item is BenchmarkModelRun => Boolean(item));
}

export async function saveBenchmarkModelRun(run: BenchmarkModelRun): Promise<void> {
  const testCase = await getBenchmarkCase(run.caseId);
  if (!testCase) throw new Error(`Benchmark case ${run.caseId} does not exist.`);
  const validation = validateBenchmarkModelRun(testCase, run);
  if (!validation.valid) {
    throw new Error(`Benchmark model run validation failed: ${validation.errors.join("; ")}`);
  }

  if (!isTauri()) {
    const runs = readLocalRuns();
    if (runs.some(item => item.runId === run.runId)) {
      throw new Error(`Benchmark model run ${run.runId} already exists and is immutable.`);
    }
    writeLocalRuns([run, ...runs]);
    return;
  }

  const db = await getDatabase();
  const existing = await db.select<ModelRunRow[]>(
    "SELECT run_id, case_id, run_json, created_at FROM benchmark_model_runs WHERE run_id = $1 LIMIT 1",
    [run.runId]
  );
  if (existing[0]) throw new Error(`Benchmark model run ${run.runId} already exists and is immutable.`);
  await db.execute(
    `INSERT INTO benchmark_model_runs (run_id, case_id, run_json, created_at)
     VALUES ($1,$2,$3,$4)`,
    [run.runId, run.caseId, JSON.stringify(run), run.generatedAt ?? new Date().toISOString()]
  );
}
