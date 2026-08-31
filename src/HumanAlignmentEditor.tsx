import { useMemo, useState } from "react";
import { Check, Link2, Plus, Save, Trash2, X } from "lucide-react";
import { saveBenchmarkAlignment } from "./grading/benchmark/alignmentStore";
import type {
  BenchmarkAlignment,
  BenchmarkModelRun,
  GradingBenchmarkCase,
  RubricAlignmentRelation
} from "./grading/benchmark/types";
import "./humanAlignmentEditor.css";

function createDraftAlignment(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  existing?: BenchmarkAlignment | null
): BenchmarkAlignment {
  if (existing) {
    return {
      ...JSON.parse(JSON.stringify(existing)) as BenchmarkAlignment,
      alignmentStatus: existing.alignmentStatus ?? "draft",
      unmatchedGoldRubricPointIds: [...(existing.unmatchedGoldRubricPointIds ?? [])],
      unmatchedPredictedRubricPointIds: [...(existing.unmatchedPredictedRubricPointIds ?? [])]
    };
  }
  return {
    caseId: testCase.id,
    runId: run.runId,
    alignmentStatus: "draft",
    rubricAlignments: [],
    mappingLinks: [],
    unmatchedGoldRubricPointIds: [],
    unmatchedPredictedRubricPointIds: []
  };
}

function relationLabel(relation: RubricAlignmentRelation): string {
  if (relation === "acceptable-merge") return "多 Gold → 1 Model";
  if (relation === "acceptable-split") return "1 Gold → 多 Model";
  return "1 : 1";
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

export default function HumanAlignmentEditor({
  testCase,
  run,
  existing,
  onSaved,
  onClose
}: {
  testCase: GradingBenchmarkCase;
  run: BenchmarkModelRun;
  existing?: BenchmarkAlignment | null;
  onSaved: (alignment: BenchmarkAlignment) => void;
  onClose: () => void;
}) {
  const [working, setWorking] = useState<BenchmarkAlignment>(() => createDraftAlignment(testCase, run, existing));
  const [selectedGold, setSelectedGold] = useState<string[]>([]);
  const [selectedPredicted, setSelectedPredicted] = useState<string[]>([]);
  const [relation, setRelation] = useState<RubricAlignmentRelation>("match");
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("high");
  const [groupNotes, setGroupNotes] = useState("");
  const [alignedBy, setAlignedBy] = useState(existing?.provenance?.alignedBy ?? "");
  const [overallNotes, setOverallNotes] = useState(existing?.provenance?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const modelMappingById = useMemo(
    () => new Map(run.mappings.map(item => [item.predictedRubricPointId, item])),
    [run.mappings]
  );
  const alignedGold = useMemo(
    () => new Set(working.rubricAlignments.flatMap(group => group.goldRubricPointIds)),
    [working.rubricAlignments]
  );
  const alignedPredicted = useMemo(
    () => new Set(working.rubricAlignments.flatMap(group => group.predictedRubricPointIds)),
    [working.rubricAlignments]
  );
  const unmatchedGold = new Set(working.unmatchedGoldRubricPointIds ?? []);
  const unmatchedPredicted = new Set(working.unmatchedPredictedRubricPointIds ?? []);

  function addGroup() {
    if (relation === "match" && (selectedGold.length !== 1 || selectedPredicted.length !== 1)) {
      setMessage("1:1 对齐必须选择 1 个 Gold rubric 和 1 个模型 rubric。");
      return;
    }
    if (relation === "acceptable-merge" && (selectedGold.length < 2 || selectedPredicted.length !== 1)) {
      setMessage("多 Gold → 1 Model 必须选择至少 2 个 Gold rubric 和 1 个模型 rubric。");
      return;
    }
    if (relation === "acceptable-split" && (selectedGold.length !== 1 || selectedPredicted.length < 2)) {
      setMessage("1 Gold → 多 Model 必须选择 1 个 Gold rubric 和至少 2 个模型 rubric。");
      return;
    }
    if (!selectedGold.length || !selectedPredicted.length) {
      setMessage("请先选择需要对齐的 Gold 和模型 rubric。");
      return;
    }

    const group = {
      goldRubricPointIds: [...selectedGold],
      predictedRubricPointIds: [...selectedPredicted],
      relation,
      alignmentConfidence: confidence,
      ...(groupNotes.trim() ? { alignmentNotes: groupNotes.trim() } : {})
    };
    const links = selectedGold.map(goldRubricPointId => ({
      goldRubricPointId,
      predictedRubricPointIds: [...selectedPredicted],
      alignmentConfidence: confidence,
      ...(groupNotes.trim() ? { alignmentNotes: groupNotes.trim() } : {})
    }));

    setWorking(current => ({
      ...current,
      rubricAlignments: [...current.rubricAlignments, group],
      mappingLinks: [...current.mappingLinks, ...links],
      unmatchedGoldRubricPointIds: (current.unmatchedGoldRubricPointIds ?? []).filter(id => !selectedGold.includes(id)),
      unmatchedPredictedRubricPointIds: (current.unmatchedPredictedRubricPointIds ?? []).filter(id => !selectedPredicted.includes(id))
    }));
    setSelectedGold([]);
    setSelectedPredicted([]);
    setGroupNotes("");
    setMessage("");
  }

  function removeGroup(index: number) {
    const group = working.rubricAlignments[index];
    if (!group) return;
    setWorking(current => ({
      ...current,
      rubricAlignments: current.rubricAlignments.filter((_, itemIndex) => itemIndex !== index),
      mappingLinks: current.mappingLinks.filter(link => !group.goldRubricPointIds.includes(link.goldRubricPointId))
    }));
  }

  function toggleUnmatchedGold(id: string) {
    if (alignedGold.has(id)) return;
    setWorking(current => ({
      ...current,
      unmatchedGoldRubricPointIds: toggleValue(current.unmatchedGoldRubricPointIds ?? [], id)
    }));
  }

  function toggleUnmatchedPredicted(id: string) {
    if (alignedPredicted.has(id)) return;
    setWorking(current => ({
      ...current,
      unmatchedPredictedRubricPointIds: toggleValue(current.unmatchedPredictedRubricPointIds ?? [], id)
    }));
  }

  async function saveDraft() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveBenchmarkAlignment({
        ...working,
        alignmentStatus: "draft",
        provenance: {
          ...working.provenance,
          ...(alignedBy.trim() ? { alignedBy: alignedBy.trim() } : {}),
          ...(overallNotes.trim() ? { notes: overallNotes.trim() } : {})
        }
      });
      setWorking(saved);
      onSaved(saved);
      setMessage("Alignment 草稿已保存。未明确匹配或 unmatched 的 rubric 仍视为未审阅。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alignment 草稿保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function finishAlignment() {
    if (busy) return;
    if (!alignedBy.trim()) {
      setMessage("完成 Alignment adjudication 前必须填写对齐者 ID。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveBenchmarkAlignment({
        ...working,
        alignmentStatus: "adjudicated",
        provenance: {
          ...working.provenance,
          alignedBy: alignedBy.trim(),
          alignedAt: new Date().toISOString(),
          ...(overallNotes.trim() ? { notes: overallNotes.trim() } : {})
        }
      });
      setWorking(saved);
      onSaved(saved);
      setMessage("Alignment adjudication 已锁定。后续 validation report 将以此对齐为依据。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alignment adjudication 失败。");
    } finally {
      setBusy(false);
    }
  }

  const locked = working.alignmentStatus === "adjudicated";

  return <div className="human-alignment-editor">
    <header className="alignment-header">
      <div>
        <span>Human Alignment · ID-only</span>
        <h4>Gold Rubric ↔ Model Rubric</h4>
        <p>只决定对应关系和 unmatched；模型的 status、error code、diagnosis 与 score 全部来自 immutable Model Run，无法在这里修改。</p>
      </div>
      <button className="secondary" onClick={onClose}><X size={15}/>关闭</button>
    </header>

    <div className="alignment-columns">
      <section>
        <div className="alignment-column-title"><strong>Human Gold Rubric</strong><small>{testCase.gold.rubric.length} 点</small></div>
        {testCase.gold.rubric.map(rubric => {
          const unavailable = alignedGold.has(rubric.id) || unmatchedGold.has(rubric.id);
          const goldMapping = testCase.gold.mappings.find(item => item.rubricPointId === rubric.id);
          return <article className={`alignment-rubric-card ${unavailable ? "resolved" : ""}`} key={rubric.id}>
            <label className="alignment-select-row">
              <input type="checkbox" disabled={locked || unavailable} checked={selectedGold.includes(rubric.id)} onChange={() => setSelectedGold(values => toggleValue(values, rubric.id))}/>
              <span><code>{rubric.id}</code><strong>{rubric.canonicalLabel}</strong></span>
            </label>
            <p>{rubric.evidence.join("；")}</p>
            <small>Gold answer status：{goldMapping?.status ?? "未记录"}</small>
            {!alignedGold.has(rubric.id) && <label className="unmatched-row"><input type="checkbox" disabled={locked || selectedGold.includes(rubric.id)} checked={unmatchedGold.has(rubric.id)} onChange={() => toggleUnmatchedGold(rubric.id)}/><span>确认模型漏掉此 Gold 点</span></label>}
          </article>;
        })}
      </section>

      <section>
        <div className="alignment-column-title"><strong>Immutable Model Rubric</strong><small>{run.rubric.length} 点</small></div>
        {run.rubric.map(rubric => {
          const unavailable = alignedPredicted.has(rubric.id) || unmatchedPredicted.has(rubric.id);
          const mapping = modelMappingById.get(rubric.id);
          return <article className={`alignment-rubric-card model ${unavailable ? "resolved" : ""}`} key={rubric.id}>
            <label className="alignment-select-row">
              <input type="checkbox" disabled={locked || unavailable} checked={selectedPredicted.includes(rubric.id)} onChange={() => setSelectedPredicted(values => toggleValue(values, rubric.id))}/>
              <span><code>{rubric.id}</code><strong>{rubric.title}</strong></span>
            </label>
            <p>{rubric.evidence.join("；")}</p>
            <div className="model-judgment-readonly"><span>{mapping?.status ?? "?"}</span><small>{mapping?.diagnosis ?? "无诊断"}</small>{mapping?.errorCodes.length ? <code>{mapping.errorCodes.join(", ")}</code> : null}</div>
            {!alignedPredicted.has(rubric.id) && <label className="unmatched-row"><input type="checkbox" disabled={locked || selectedPredicted.includes(rubric.id)} checked={unmatchedPredicted.has(rubric.id)} onChange={() => toggleUnmatchedPredicted(rubric.id)}/><span>确认这是无对应 Gold 的模型额外点</span></label>}
          </article>;
        })}
      </section>
    </div>

    {!locked && <section className="alignment-builder">
      <div className="alignment-builder-grid">
        <label><span>关系</span><select value={relation} onChange={event => setRelation(event.target.value as RubricAlignmentRelation)}><option value="match">1 : 1</option><option value="acceptable-merge">多 Gold → 1 Model</option><option value="acceptable-split">1 Gold → 多 Model</option></select></label>
        <label><span>置信度</span><select value={confidence} onChange={event => setConfidence(event.target.value as "high" | "medium" | "low")}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label className="wide"><span>对齐说明（可选）</span><input value={groupNotes} onChange={event => setGroupNotes(event.target.value)} placeholder="记录为什么允许合并/拆分或为什么存在歧义"/></label>
      </div>
      <div className="alignment-selection-summary"><span>已选 Gold：{selectedGold.length ? selectedGold.join(", ") : "无"}</span><span>已选 Model：{selectedPredicted.length ? selectedPredicted.join(", ") : "无"}</span><button className="primary" onClick={addGroup}><Plus size={14}/>加入对齐组</button></div>
    </section>}

    <section className="alignment-groups">
      <div className="alignment-column-title"><strong>已建立对齐组</strong><small>{working.rubricAlignments.length}</small></div>
      {working.rubricAlignments.map((group, index) => <div className="alignment-group-card" key={`${index}-${group.goldRubricPointIds.join("-")}`}><div><Link2 size={15}/><strong>{relationLabel(group.relation)}</strong><span>{group.goldRubricPointIds.join(" + ")} ↔ {group.predictedRubricPointIds.join(" + ")}</span><small>{group.alignmentConfidence ?? "未标置信度"}{group.alignmentNotes ? ` · ${group.alignmentNotes}` : ""}</small></div>{!locked && <button className="icon-button danger-soft" onClick={() => removeGroup(index)}><Trash2 size={14}/></button>}</div>)}
      {!working.rubricAlignments.length && <div className="alignment-empty">尚未建立任何对齐组。真正缺失/额外的 rubric 不要硬匹配，请使用 unmatched 标记。</div>}
    </section>

    <section className="alignment-provenance">
      <label><span>对齐者 ID</span><input disabled={locked} value={alignedBy} onChange={event => setAlignedBy(event.target.value)} placeholder="例如 aligner-a"/></label>
      <label><span>整体说明</span><textarea disabled={locked} value={overallNotes} onChange={event => setOverallNotes(event.target.value)} placeholder="记录边界判断或争议"/></label>
    </section>

    {message && <div className="alignment-message">{message}</div>}
    <footer className="alignment-actions">
      {locked ? <div className="alignment-locked"><Check size={15}/>该 Alignment 已 adjudicated 并锁定。</div> : <><button className="secondary" disabled={busy} onClick={saveDraft}><Save size={15}/>保存 Alignment 草稿</button><button className="primary" disabled={busy} onClick={finishAlignment}><Check size={15}/>完成 Alignment Adjudication</button></>}
    </footer>
  </div>;
}
