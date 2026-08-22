import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, Play, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import HumanAlignmentEditor from "./HumanAlignmentEditor";
import { getBenchmarkAlignment, listBenchmarkAlignments } from "./grading/benchmark/alignmentStore";
import { runBenchmarkCase } from "./grading/benchmark/benchmarkRunner";
import { listBenchmarkModelRuns } from "./grading/benchmark/modelRunStore";
import type { BenchmarkAlignment, BenchmarkModelRun, GradingBenchmarkCase } from "./grading/benchmark/types";
import { buildValidationReport } from "./grading/benchmark/validationReport";
import "./benchmarkExperiment.css";

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function number(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export default function BenchmarkExperimentPanel({ testCase }: { testCase: GradingBenchmarkCase }) {
  const [runs, setRuns] = useState<BenchmarkModelRun[]>([]);
  const [alignments, setAlignments] = useState<BenchmarkAlignment[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [editingAlignment, setEditingAlignment] = useState(false);
  const [useReferenceCrossCheck, setUseReferenceCrossCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const [loadedRuns, loadedAlignments] = await Promise.all([
        listBenchmarkModelRuns(testCase.id),
        listBenchmarkAlignments(testCase.id)
      ]);
      setRuns(loadedRuns);
      setAlignments(loadedAlignments);
      setSelectedRunId(current => current && loadedRuns.some(item => item.runId === current)
        ? current
        : loadedRuns[0]?.runId ?? null);
    } catch (error) {
      console.error("Failed to load benchmark experiments.", error);
      setStatus(error instanceof Error ? error.message : "无法读取模型实验记录。");
    }
  }

  useEffect(() => {
    setRuns([]);
    setAlignments([]);
    setSelectedRunId(null);
    setEditingAlignment(false);
    setUseReferenceCrossCheck(false);
    setStatus("");
    void load();
  }, [testCase.id]);

  const selectedRun = runs.find(item => item.runId === selectedRunId) ?? null;
  const selectedAlignment = selectedRun
    ? alignments.find(item => item.runId === selectedRun.runId) ?? null
    : null;

  const report = useMemo(() => {
    if (!selectedRun || selectedAlignment?.alignmentStatus !== "adjudicated") return null;
    try {
      return buildValidationReport([testCase], [selectedRun], [selectedAlignment]);
    } catch (error) {
      console.error("Single-case validation report failed.", error);
      return null;
    }
  }, [testCase, selectedRun, selectedAlignment]);

  async function runExperiment() {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const run = await runBenchmarkCase(testCase, { useReferenceCrossCheck });
      await load();
      setSelectedRunId(run.runId);
      setStatus("模型实验已完成并冻结为 immutable Model Run。下一步需要人工 Alignment，不能由模型自动给自己对齐。");
    } catch (error) {
      console.error("Benchmark experiment failed.", error);
      setStatus(error instanceof Error ? error.message : "模型实验失败。");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setStatus("");
    await load();
    setBusy(false);
  }

  async function updateAlignment(updated: BenchmarkAlignment) {
    setAlignments(current => {
      const index = current.findIndex(item => item.runId === updated.runId);
      if (index < 0) return [updated, ...current];
      const next = [...current];
      next[index] = updated;
      return next;
    });
    if (updated.alignmentStatus === "adjudicated") {
      setEditingAlignment(false);
      const stored = await getBenchmarkAlignment(updated.caseId, updated.runId);
      if (stored) {
        setAlignments(current => current.map(item => item.runId === stored.runId ? stored : item));
      }
    }
  }

  return <section className="benchmark-experiment-panel">
    <div className="experiment-header">
      <div>
        <span>Model Experiment</span>
        <h4>冻结一次真实模型实验，再由人工对齐</h4>
        <p>此处只对已经 adjudicated 的 Human Gold case 开放。每次运行都生成新的 immutable Model Run，不覆盖旧实验。</p>
      </div>
      <button className="secondary" disabled={busy} onClick={refresh}><RefreshCw size={15}/>{busy ? "处理中…" : "刷新"}</button>
    </div>

    <div className="experiment-launcher">
      <div className="experiment-condition">
        <strong>实验条件</strong>
        <label><input type="checkbox" checked={useReferenceCrossCheck} disabled={!testCase.question.referenceAnswer || busy} onChange={event => setUseReferenceCrossCheck(event.target.checked)}/><span>启用 Stage 5 参考答案交叉核对</span></label>
        <small>{testCase.question.referenceAnswer ? "默认关闭。开启后会形成不同的实验签名，不能和盲评 run 混在同一 validation report。" : "此 case 没有保存参考答案，因此只能运行盲评实验。"}</small>
      </div>
      <button className="primary experiment-run-button" disabled={busy} onClick={runExperiment}><Play size={16}/>{busy ? "模型运行中…" : "运行一次模型实验"}</button>
    </div>

    {status && <div className="experiment-status"><ShieldAlert size={16}/><span>{status}</span></div>}

    <div className="experiment-layout">
      <div className="experiment-runs">
        <div className="experiment-subheading"><div><strong>Immutable Model Runs</strong><small>{runs.length} 次</small></div><span>选择一条 run 查看并做人工 Alignment</span></div>
        {runs.length ? runs.map(run => {
          const alignment = alignments.find(item => item.runId === run.runId);
          const selected = selectedRunId === run.runId;
          return <button className={`experiment-run-card ${selected ? "selected" : ""}`} key={run.runId} onClick={() => { setSelectedRunId(run.runId); setEditingAlignment(false); }}>
            <div className="experiment-run-main"><span>{run.model ?? run.providerId ?? "remote model"}</span><strong>{run.predictedScore}<small> / {run.maxScore}</small></strong></div>
            <div className="experiment-run-meta"><code>{run.runId}</code><span>{run.protocol ?? "protocol ?"}</span><span>reasoning: {run.reasoningEffort ?? "default"}</span><span>{run.referenceCrossCheckUsed ? "Stage 5" : "Blind"}</span></div>
            <div className="experiment-run-state"><span className={`run-alignment-state state-${alignment?.alignmentStatus ?? "none"}`}>{alignment?.alignmentStatus === "adjudicated" ? "Alignment 已锁定" : alignment ? "Alignment 草稿" : "待 Alignment"}</span>{run.generatedAt && <small>{new Date(run.generatedAt).toLocaleString("zh-CN")}</small>}</div>
          </button>;
        }) : <div className="experiment-empty">还没有真实 Model Run。配置并启用桌面 remote provider 后，点击上方按钮运行第一条实验。</div>}
      </div>

      <div className="experiment-inspector">
        {!selectedRun ? <div className="experiment-empty tall"><Sparkles size={20}/><span>选择一条 Model Run 后，这里显示不可变模型判断、人工 Alignment 和单 case 指标。</span></div> : <>
          <div className="experiment-subheading"><div><strong>Run Inspector</strong><small>{selectedRun.runId}</small></div><span>模型判断只读</span></div>
          <div className="run-readonly-grid">
            <div><span>模型分</span><strong>{selectedRun.predictedScore} / {selectedRun.maxScore}</strong></div>
            <div><span>Rubric 点</span><strong>{selectedRun.rubric.length}</strong></div>
            <div><span>Provider / Model</span><strong>{selectedRun.providerId ?? "—"}<small>{selectedRun.model ? ` · ${selectedRun.model}` : ""}</small></strong></div>
            <div><span>实验条件</span><strong>{selectedRun.referenceCrossCheckUsed ? "Blind + Stage 5" : "Blind only"}</strong></div>
          </div>

          <div className="run-rubric-preview">{selectedRun.rubric.map(rubric => {
            const mapping = selectedRun.mappings.find(item => item.predictedRubricPointId === rubric.id);
            return <article key={rubric.id}><div><code>{rubric.id}</code><strong>{rubric.title}</strong><span>{mapping?.status ?? "?"}</span></div><p>{rubric.evidence.join("；")}</p>{mapping && <small>{mapping.diagnosis}{mapping.errorCodes.length ? ` · ${mapping.errorCodes.join(", ")}` : ""}</small>}</article>;
          })}</div>

          {selectedAlignment?.alignmentStatus === "adjudicated" ? <div className="experiment-alignment-complete"><CheckCircle2 size={18}/><div><strong>Human Alignment 已 adjudicated</strong><span>{selectedAlignment.provenance?.alignedBy} · {selectedAlignment.provenance?.alignedAt ? new Date(selectedAlignment.provenance.alignedAt).toLocaleString("zh-CN") : ""}</span></div></div> : <button className="secondary alignment-open-button" onClick={() => setEditingAlignment(value => !value)}><Link2 size={15}/>{editingAlignment ? "收起 Human Alignment" : selectedAlignment ? "继续 Human Alignment" : "开始 Human Alignment"}</button>}

          {report && <div className="single-case-report">
            <div className="single-case-report-title"><strong>Single-case Evidence</strong><span>evidence-only · 非正式阅卷校准</span></div>
            <div className="single-case-metrics">
              <div><span>Rubric Recall</span><strong>{percent(report.aggregate.rubric.recall)}</strong></div>
              <div><span>Rubric Precision</span><strong>{percent(report.aggregate.rubric.precision)}</strong></div>
              <div><span>Mapping Accuracy</span><strong>{percent(report.aggregate.mapping.exactStatusAccuracy)}</strong></div>
              <div><span>Taxonomy F1</span><strong>{percent(report.aggregate.taxonomy.microF1)}</strong></div>
              <div><span>Score MAE</span><strong>{number(report.aggregate.score.meanAbsoluteError)}</strong></div>
            </div>
          </div>}
        </>}
      </div>
    </div>

    {selectedRun && editingAlignment && selectedAlignment?.alignmentStatus !== "adjudicated" && <HumanAlignmentEditor testCase={testCase} run={selectedRun} existing={selectedAlignment} onSaved={updateAlignment} onClose={() => setEditingAlignment(false)} />}
  </section>;
}
