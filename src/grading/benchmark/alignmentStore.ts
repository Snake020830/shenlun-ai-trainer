import { isTauri } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import { getBenchmarkCase } from "./caseStore";
import { getBenchmarkModelRun } from "./modelRunStore";
import type { BenchmarkAlignment } from "./types";
import { validateBenchmarkAlignment } from "./validateAlignment";

const DATABASE_URL = "sqlite:shenlun-trainer.db";
const ALIGNMENTS_KEY = "shenlun:benchmark-alignments:v1";

interface AlignmentRow {
  case_id: string;
  run_id: string;
  alignment_json: string;
  updated_at: string;
}

let databasePromise: Promise<Database> | null = null;

function readLocalAlignments(): BenchmarkAlignment[] {
  try {
    const raw = localStorage.getItem(ALIGNMENTS_KEY);
    return raw ? JSON.parse(raw) as BenchmarkAlignment[] : [];
  } catch {
    return [];
  }
}

function writeLocalAlignments(alignments: BenchmarkAlignment[]): void {
  localStorage.setItem(ALIGNMENTS_KEY, JSON.stringify(alignments));
}

async function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql")
      .then(({ default: DatabaseApi }) => DatabaseApi.load(DATABASE_URL));
  }
  return databasePromise;
}

function parseAlignment(raw: string): BenchmarkAlignment | null {
  try {
    return JSON.parse(raw) as BenchmarkAlignment;
  } catch {
    return null;
  }
}

export async function getBenchmarkAlignment(caseId: string, runId: string): Promise<BenchmarkAlignment | null> {
  if (!isTauri()) {
    return readLocalAlignments().find(item => item.caseId === caseId && item.runId === runId) ?? null;
  }
  const db = await getDatabase();
  const rows = await db.select<AlignmentRow[]>(
    `SELECT case_id, run_id, alignment_json, updated_at
     FROM benchmark_alignments WHERE case_id = $1 AND run_id = $2 LIMIT 1`,
    [caseId, runId]
  );
  return rows[0] ? parseAlignment(rows[0].alignment_json) : null;
}

export async function listBenchmarkAlignments(caseId: string): Promise<BenchmarkAlignment[]> {
  if (!isTauri()) return readLocalAlignments().filter(item => item.caseId === caseId);
  const db = await getDatabase();
  const rows = await db.select<AlignmentRow[]>(
    `SELECT case_id, run_id, alignment_json, updated_at
     FROM benchmark_alignments WHERE case_id = $1 ORDER BY updated_at DESC`,
    [caseId]
  );
  return rows.map(row => parseAlignment(row.alignment_json)).filter((item): item is BenchmarkAlignment => Boolean(item));
}

export async function saveBenchmarkAlignment(input: BenchmarkAlignment): Promise<BenchmarkAlignment> {
  const alignment: BenchmarkAlignment = {
    ...input,
    alignmentStatus: input.alignmentStatus ?? "draft",
    unmatchedGoldRubricPointIds: input.unmatchedGoldRubricPointIds ?? [],
    unmatchedPredictedRubricPointIds: input.unmatchedPredictedRubricPointIds ?? []
  };
  const testCase = await getBenchmarkCase(alignment.caseId);
  if (!testCase) throw new Error(`Benchmark case ${alignment.caseId} does not exist.`);
  const run = await getBenchmarkModelRun(alignment.runId);
  if (!run) throw new Error(`Benchmark model run ${alignment.runId} does not exist.`);

  const validation = validateBenchmarkAlignment(testCase, run, alignment);
  if (!validation.valid) {
    throw new Error(`Benchmark alignment validation failed: ${validation.errors.join("; ")}`);
  }

  const existing = await getBenchmarkAlignment(alignment.caseId, alignment.runId);
  if (existing?.alignmentStatus === "adjudicated") {
    throw new Error("Adjudicated benchmark alignment is immutable in the normal editor.");
  }

  if (!isTauri()) {
    const alignments = readLocalAlignments();
    const index = alignments.findIndex(item => item.caseId === alignment.caseId && item.runId === alignment.runId);
    if (index < 0) writeLocalAlignments([alignment, ...alignments]);
    else {
      const next = [...alignments];
      next[index] = alignment;
      writeLocalAlignments(next);
    }
    return alignment;
  }

  const db = await getDatabase();
  await db.execute(
    `INSERT INTO benchmark_alignments (case_id, run_id, alignment_json, updated_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT(case_id, run_id) DO UPDATE SET
       alignment_json=excluded.alignment_json,
       updated_at=excluded.updated_at`,
    [alignment.caseId, alignment.runId, JSON.stringify(alignment), new Date().toISOString()]
  );
  return alignment;
}
