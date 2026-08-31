import { useMemo, useState } from "react";
import { Check, CircleAlert, Eye, Plus, Save, Trash2, X } from "lucide-react";
import type { ElementType } from "./grading/artifacts";
import { ERROR_TAXONOMY } from "./grading/errorTaxonomy";
import { saveBenchmarkCase } from "./grading/benchmark/caseStore";
import type {
  BenchmarkAnswerMapping,
  BenchmarkMaterialPoint,
  BenchmarkRubricPoint,
  GradingBenchmarkCase,
  HumanScoreObservation
} from "./grading/benchmark/types";
import { HUMAN_GOLD_PROTOCOL_VERSION } from "./grading/versions";
import "./humanGoldEditor.css";

const ELEMENT_TYPES: Array<{ value: ElementType; label: string }> = [
  { value: "problem", label: "问题" },
  { value: "cause", label: "原因" },
  { value: "measure", label: "措施" },
  { value: "outcome", label: "成效" },
  { value: "impact", label: "影响" },
  { value: "significance", label: "意义" },
  { value: "viewpoint", label: "观点" },
  { value: "mechanism", label: "机制" },
  { value: "other", label: "其他" }
];

function cloneCase(testCase: GradingBenchmarkCase): GradingBenchmarkCase {
  return JSON.parse(JSON.stringify(testCase)) as GradingBenchmarkCase;
}

function splitEvidence(value: string): string[] {
  return value.split(/\n+/).map(item => item.trim()).filter(Boolean);
}

function statusLabel(status: BenchmarkAnswerMapping["status"]): string {
  return status === "hit" ? "已覆盖" : status === "partial" ? "部分覆盖" : "遗漏";
}

export default function HumanGoldEditor({
  testCase,
  onSaved,
  onClose
}: {
  testCase: GradingBenchmarkCase;
  onSaved: (testCase: GradingBenchmarkCase) => void;
  onClose: () => void;
}) {
  const [working, setWorking] = useState<GradingBenchmarkCase>(() => cloneCase(testCase));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [referenceVisible, setReferenceVisible] = useState(false);
  const [scoreAssessorId, setScoreAssessorId] = useState("");
  const [scoreValue, setScoreValue] = useState("");
  const [scoreNotes, setScoreNotes] = useState("");

  const mappingByRubric = useMemo(
    () => new Map(working.gold.mappings.map(item => [item.rubricPointId, item])),
    [working.gold.mappings]
  );

  const blindComplete = working.gold.materialPoints.length > 0
    && working.gold.rubric.length > 0
    && working.gold.rubric.every(item => item.materialPointIds.length > 0 && mappingByRubric.has(item.id));

  function patchGold<K extends keyof GradingBenchmarkCase["gold"]>(key: K, value: GradingBenchmarkCase["gold"][K]) {
    setWorking(current => ({ ...current, gold: { ...current.gold, [key]: value } }));
  }

  function addMaterialPoint(materialId: string) {
    const point: BenchmarkMaterialPoint = {
      id: `mp-${crypto.randomUUID()}`,
      materialId,
      canonicalLabel: "",
      elementType: "other",
      evidence: "",
      independentDimension: true
    };
    patchGold("materialPoints", [...working.gold.materialPoints, point]);
  }

  function updateMaterialPoint(id: string, patch: Partial<BenchmarkMaterialPoint>) {
    patchGold("materialPoints", working.gold.materialPoints.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function deleteMaterialPoint(id: string) {
    patchGold("materialPoints", working.gold.materialPoints.filter(item => item.id !== id));
    patchGold("rubric", working.gold.rubric.map(item => ({
      ...item,
      materialPointIds: item.materialPointIds.filter(pointId => pointId !== id)
    })));
  }

  function addRubricPoint() {
    const rubric: BenchmarkRubricPoint = {
      id: `r-${crypto.randomUUID()}`,
      canonicalLabel: "",
      elementType: "other",
      materialPointIds: [],
      evidence: []
    };
    patchGold("rubric", [...working.gold.rubric, rubric]);
  }

  function updateRubricPoint(id: string, patch: Partial<BenchmarkRubricPoint>) {
    patchGold("rubric", working.gold.rubric.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function toggleRubricMaterialPoint(rubricId: string, pointId: string) {
    const rubric = working.gold.rubric.find(item => item.id === rubricId);
    if (!rubric) return;
    const materialPointIds = rubric.materialPointIds.includes(pointId)
      ? rubric.materialPointIds.filter(id => id !== pointId)
      : [...rubric.materialPointIds, pointId];
    updateRubricPoint(rubricId, { materialPointIds });
  }

  function deleteRubricPoint(id: string) {
    patchGold("rubric", working.gold.rubric.filter(item => item.id !== id));
    patchGold("mappings", working.gold.mappings.filter(item => item.rubricPointId !== id));
  }

  function setMappingStatus(rubricId: string, status: BenchmarkAnswerMapping["status"] | "") {
    const existing = mappingByRubric.get(rubricId);
    if (!status) {
      patchGold("mappings", working.gold.mappings.filter(item => item.rubricPointId !== rubricId));
      return;
    }
    if (existing) {
      patchGold("mappings", working.gold.mappings.map(item => item.rubricPointId === rubricId ? { ...item, status } : item));
      return;
    }
    patchGold("mappings", [...working.gold.mappings, { rubricPointId: rubricId, status, expectedErrorCodes: [] }]);
  }

  function updateMapping(rubricId: string, patch: Partial<BenchmarkAnswerMapping>) {
    patchGold("mappings", working.gold.mappings.map(item => item.rubricPointId === rubricId ? { ...item, ...patch } : item));
  }

  function toggleErrorCode(rubricId: string, code: string) {
    const mapping = mappingByRubric.get(rubricId);
    if (!mapping) return;
    const expectedErrorCodes = mapping.expectedErrorCodes.includes(code)
      ? mapping.expectedErrorCodes.filter(item => item !== code)
      : [...mapping.expectedErrorCodes, code];
    updateMapping(rubricId, { expectedErrorCodes });
  }

  function addHumanScore() {
    const assessorId = scoreAssessorId.trim();
    const score = Number(scoreValue);
    if (!assessorId || !Number.isFinite(score) || score < 0 || score > working.question.maxScore) {
      setMessage(`人工分必须包含 assessor ID，且分数在 0–${working.question.maxScore} 之间。`);
      return;
    }
    const observation: HumanScoreObservation = { assessorId, score, ...(scoreNotes.trim() ? { notes: scoreNotes.trim() } : {}) };
    patchGold("humanScores", [...working.gold.humanScores.filter(item => item.assessorId !== assessorId), observation]);
    setScoreAssessorId("");
    setScoreValue("");
    setScoreNotes("");
    setMessage("");
  }

  function removeHumanScore(assessorId: string) {
    patchGold("humanScores", working.gold.humanScores.filter(item => item.assessorId !== assessorId));
  }

  function revealReferenceAnswer() {
    if (!blindComplete || !working.question.referenceAnswer) return;
    const revealedAt = working.provenance?.referenceAnswerRevealedAt ?? new Date().toISOString();
    setWorking(current => ({
      ...current,
      provenance: {
        ...current.provenance,
        annotationProtocolVersion: HUMAN_GOLD_PROTOCOL_VERSION,
        referenceAnswerRevealedAt: revealedAt
      }
    }));
    setReferenceVisible(true);
  }

  function withAnnotationMetadata(next: GradingBenchmarkCase): GradingBenchmarkCase {
    return {
      ...next,
      provenance: {
        ...next.provenance,
        goldAnnotatorId: next.provenance?.goldAnnotatorId?.trim() || undefined,
        annotationProtocolVersion: HUMAN_GOLD_PROTOCOL_VERSION
      }
    };
  }

  async function saveProgress() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const next = withAnnotationMetadata({ ...working, annotationStatus: "draft" });
      const validation = await saveBenchmarkCase(next);
      setWorking(cloneCase(next));
      onSaved(next);
      setMessage(validation.warnings.length ? `草稿已保存。提醒：${validation.warnings.join("；")}` : "草稿已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function finishAdjudication() {
    if (busy) return;
    if (!working.provenance?.goldAnnotatorId?.trim()) {
      setMessage("完成 adjudication 前必须填写 Gold 标注者 ID。");
      return;
    }
    if (working.split !== "calibration" && working.split !== "holdout") {
      setMessage("真实 case 完成 adjudication 前必须固定为 calibration 或 holdout split。");
      return;
    }
    if (!blindComplete) {
      setMessage("完成 adjudication 前必须完成材料点、rubric 以及每个 rubric 的答案映射。");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const next = withAnnotationMetadata({
        ...working,
        annotationStatus: "adjudicated",
        provenance: {
          ...working.provenance,
          goldAnnotatorId: working.provenance.goldAnnotatorId.trim(),
          annotationProtocolVersion: HUMAN_GOLD_PROTOCOL_VERSION,
          annotatedAt: new Date().toISOString()
        }
      });
      const validation = await saveBenchmarkCase(next);
      setWorking(cloneCase(next));
      onSaved(next);
      setMessage(validation.warnings.length ? `Adjudication 已保存。提醒：${validation.warnings.join("；")}` : "Adjudication 已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Adjudication 保存失败。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="human-gold-editor">
    <header className="human-gold-header">
      <div><span>Human Gold · {HUMAN_GOLD_PROTOCOL_VERSION}</span><h3>{working.question.title}</h3><p>只依据题干、材料和原始作答进行盲标；此页面不读取 AI review。</p></div>
      <button className="secondary" onClick={onClose}><X size={15}/>关闭标注</button>
    </header>

    <section className="human-gold-context">
      <div><span>作答任务</span><p>{working.question.prompt}</p></div>
      <div><span>原始作答</span><p>{working.answer}</p></div>
    </section>

    <section className="human-gold-stage">
      <div className="human-gold-stage-heading"><div><span>Stage H1</span><h4>材料信息点盲抽</h4><p>先展开候选信息，不看模型，不看参考答案，不急着合并成评分点。</p></div></div>
      <div className="human-materials">{working.question.materials.map(material => <article key={material.id}><div className="human-material-heading"><div><strong>{material.label}</strong><code>{material.id}</code></div><button className="secondary small" onClick={() => addMaterialPoint(material.id)}><Plus size={14}/>从此材料加信息点</button></div><p>{material.content}</p></article>)}</div>
      <div className="human-point-list">{working.gold.materialPoints.map(point => <article className="human-edit-card" key={point.id}>
        <div className="human-edit-card-head"><code>{point.id}</code><button className="icon-button danger-soft" onClick={() => deleteMaterialPoint(point.id)}><Trash2 size={14}/></button></div>
        <div className="human-form-grid">
          <label><span>材料</span><select value={point.materialId} onChange={event => updateMaterialPoint(point.id, { materialId: event.target.value })}>{working.question.materials.map(material => <option key={material.id} value={material.id}>{material.label}</option>)}</select></label>
          <label><span>要素类型</span><select value={point.elementType} onChange={event => updateMaterialPoint(point.id, { elementType: event.target.value as ElementType })}>{ELEMENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="wide"><span>Canonical label</span><input value={point.canonicalLabel} onChange={event => updateMaterialPoint(point.id, { canonicalLabel: event.target.value })} placeholder="用最小充分概念概括这个信息点"/></label>
          <label className="wide"><span>材料证据</span><textarea value={point.evidence} onChange={event => updateMaterialPoint(point.id, { evidence: event.target.value })} placeholder="摘录或紧贴原文的证据，不写模型解释"/></label>
          <label className="human-check"><input type="checkbox" checked={point.independentDimension} onChange={event => updateMaterialPoint(point.id, { independentDimension: event.target.checked })}/><span>这是一个独立信息维度</span></label>
        </div>
      </article>)}{!working.gold.materialPoints.length && <div className="human-empty">尚未添加材料信息点。</div>}</div>
    </section>

    <section className="human-gold-stage">
      <div className="human-gold-stage-heading"><div><span>Stage H2</span><h4>人工 Rubric adjudication</h4><p>在材料点已经展开后再合并；每个 rubric 必须回指材料点。</p></div><button className="secondary" onClick={addRubricPoint}><Plus size={14}/>新增 Rubric</button></div>
      <div className="human-point-list">{working.gold.rubric.map(rubric => <article className="human-edit-card" key={rubric.id}>
        <div className="human-edit-card-head"><code>{rubric.id}</code><button className="icon-button danger-soft" onClick={() => deleteRubricPoint(rubric.id)}><Trash2 size={14}/></button></div>
        <div className="human-form-grid">
          <label className="wide"><span>Canonical label</span><input value={rubric.canonicalLabel} onChange={event => updateRubricPoint(rubric.id, { canonicalLabel: event.target.value })} placeholder="评分维度标题"/></label>
          <label><span>要素类型</span><select value={rubric.elementType} onChange={event => updateRubricPoint(rubric.id, { elementType: event.target.value as ElementType })}>{ELEMENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="wide"><span>Rubric 证据（每行一条）</span><textarea value={rubric.evidence.join("\n")} onChange={event => updateRubricPoint(rubric.id, { evidence: splitEvidence(event.target.value) })} placeholder="每行一条支持证据"/></label>
        </div>
        <div className="human-link-points"><span>关联材料点</span>{working.gold.materialPoints.length ? working.gold.materialPoints.map(point => <label key={point.id}><input type="checkbox" checked={rubric.materialPointIds.includes(point.id)} onChange={() => toggleRubricMaterialPoint(rubric.id, point.id)}/><span><code>{point.id}</code>{point.canonicalLabel || "未命名信息点"}</span></label>) : <small>先完成 Stage H1。</small>}</div>
      </article>)}{!working.gold.rubric.length && <div className="human-empty">尚未建立人工 rubric。</div>}</div>
    </section>

    <section className="human-gold-stage">
      <div className="human-gold-stage-heading"><div><span>Stage H3</span><h4>原始答案逐 Rubric 映射</h4><p>只判断考生是否覆盖人工 gold rubric；不要参考 AI 的命中判断。</p></div></div>
      <div className="human-point-list">{working.gold.rubric.map(rubric => {
        const mapping = mappingByRubric.get(rubric.id);
        return <article className="human-edit-card" key={rubric.id}>
          <div className="human-mapping-title"><div><strong>{rubric.canonicalLabel || "未命名 Rubric"}</strong><code>{rubric.id}</code></div><select value={mapping?.status ?? ""} onChange={event => setMappingStatus(rubric.id, event.target.value as BenchmarkAnswerMapping["status"] | "")}><option value="">未标注</option><option value="hit">已覆盖</option><option value="partial">部分覆盖</option><option value="missed">遗漏</option></select></div>
          {mapping && <>
            <div className={`human-status-chip human-status-${mapping.status}`}>{statusLabel(mapping.status)}</div>
            <div className="human-form-grid">
              <label className="wide"><span>答案证据 / 对应片段</span><textarea value={mapping.answerExcerpt ?? ""} onChange={event => updateMapping(rubric.id, { answerExcerpt: event.target.value })} placeholder="引用考生原始答案中的对应内容；遗漏时可留空"/></label>
              <label className="wide"><span>人工 adjudication notes</span><textarea value={mapping.notes ?? ""} onChange={event => updateMapping(rubric.id, { notes: event.target.value })} placeholder="解释为什么判 hit / partial / missed"/></label>
            </div>
            <div className="human-error-codes"><span>Expected error taxonomy</span><div>{ERROR_TAXONOMY.map(entry => <label key={entry.id}><input type="checkbox" checked={mapping.expectedErrorCodes.includes(entry.id)} onChange={() => toggleErrorCode(rubric.id, entry.id)}/><span><strong>{entry.id}</strong>{entry.label}</span></label>)}</div></div>
          </>}
        </article>;
      })}{!working.gold.rubric.length && <div className="human-empty">先完成 Stage H2。</div>}</div>
    </section>

    <section className="human-gold-stage">
      <div className="human-gold-stage-heading"><div><span>Stage H4</span><h4>人工评分与数据 Split</h4><p>人工分保留原始 assessor observation，不用模型分填补缺失。</p></div></div>
      <div className="human-form-grid">
        <label><span>Gold 标注者 ID</span><input value={working.provenance?.goldAnnotatorId ?? ""} onChange={event => setWorking(current => ({ ...current, provenance: { ...current.provenance, goldAnnotatorId: event.target.value } }))} placeholder="例如 human-a"/></label>
        <label><span>Split</span><select value={working.split ?? ""} onChange={event => setWorking(current => ({ ...current, split: event.target.value ? event.target.value as "calibration" | "holdout" : undefined }))}><option value="">暂未分配</option><option value="calibration">calibration</option><option value="holdout">holdout</option></select></label>
        <label className="wide"><span>整体 adjudication notes</span><textarea value={working.provenance?.adjudicationNotes ?? ""} onChange={event => setWorking(current => ({ ...current, provenance: { ...current.provenance, adjudicationNotes: event.target.value } }))} placeholder="记录争议点、归并规则或人工裁决依据"/></label>
      </div>
      <div className="human-score-entry"><input value={scoreAssessorId} onChange={event => setScoreAssessorId(event.target.value)} placeholder="评分者 ID"/><input type="number" min="0" max={working.question.maxScore} step="0.5" value={scoreValue} onChange={event => setScoreValue(event.target.value)} placeholder={`0–${working.question.maxScore}`}/><input value={scoreNotes} onChange={event => setScoreNotes(event.target.value)} placeholder="评分备注（可选）"/><button className="secondary" onClick={addHumanScore}><Plus size={14}/>加入人工分</button></div>
      <div className="human-score-list">{working.gold.humanScores.map(score => <div key={score.assessorId}><span><strong>{score.assessorId}</strong>{score.score}/{working.question.maxScore}{score.notes ? ` · ${score.notes}` : ""}</span><button className="icon-button danger-soft" onClick={() => removeHumanScore(score.assessorId)}><Trash2 size={13}/></button></div>)}{!working.gold.humanScores.length && <small>当前没有真实 human score；这不阻止 rubric gold 保存，但该 case 不能用于 score calibration。</small>}</div>
    </section>

    <section className="human-gold-stage reference-stage">
      <div className="human-gold-stage-heading"><div><span>Stage H5</span><h4>参考答案交叉核对</h4><p>只有前三个盲标阶段完成后才能揭示。首次揭示时间会写入 provenance。</p></div>{working.question.referenceAnswer && !referenceVisible && <button className="secondary" disabled={!blindComplete} onClick={revealReferenceAnswer}><Eye size={14}/>揭示参考答案</button>}</div>
      {!working.question.referenceAnswer ? <div className="human-empty">此题没有保存老师/机构参考答案。</div> : referenceVisible ? <div className="reference-reveal"><div><span>来源</span><strong>{working.question.referenceAnswer.source ?? "未注明"}</strong></div><p>{working.question.referenceAnswer.content}</p><small>首次揭示：{working.provenance?.referenceAnswerRevealedAt}</small></div> : <div className="reference-blind"><CircleAlert size={17}/><span>{blindComplete ? "盲标阶段已完成，可以手动揭示参考答案做最终交叉核对。" : "参考答案保持隐藏。请先完成材料点、rubric 和全部答案映射。"}</span></div>}
    </section>

    {message && <div className="human-editor-message">{message}</div>}

    <footer className="human-gold-actions">
      <button className="secondary" disabled={busy} onClick={saveProgress}><Save size={15}/>{busy ? "保存中…" : "保存标注草稿"}</button>
      <button className="primary" disabled={busy || working.annotationStatus === "adjudicated"} onClick={finishAdjudication}><Check size={15}/>完成 Adjudication</button>
    </footer>
  </div>;
}
