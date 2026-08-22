import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Database, PenLine, RefreshCw, TestTube2 } from "lucide-react";
import HumanGoldEditor from "./HumanGoldEditor";
import type { GradingBenchmarkCase } from "./grading/benchmark/types";
import { persistence } from "./storage";
import "./benchmarkLab.css";

function formatStatus(testCase: GradingBenchmarkCase): string {
  if (testCase.annotationStatus === "adjudicated") {
    return testCase.split ? `已标注 · ${testCase.split}` : "已标注";
  }
  return "待人工标注";
}

function blindInspectionJson(testCase: GradingBenchmarkCase): string {
  const question = testCase.question.referenceAnswer
    ? {
        ...testCase.question,
        referenceAnswer: {
          content: "[BLINDED_UNTIL_REFERENCE_CROSS_CHECK]",
          ...(testCase.question.referenceAnswer.source ? { source: testCase.question.referenceAnswer.source } : {})
        }
      }
    : testCase.question;
  return JSON.stringify({ ...testCase, question }, null, 2);
}

export default function BenchmarkLabSection() {
  const [cases, setCases] = useState<GradingBenchmarkCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setStatus("");
    try {
      const loaded = await persistence.listBenchmarkDrafts();
      setCases(loaded);
    } catch (error) {
      console.error("Failed to load benchmark drafts.", error);
      setStatus("无法读取 Benchmark Draft。正常训练数据不受影响。");
    } finally {
      setLoading(false);
    }
  }

  async function rescan() {
    setLoading(true);
    setStatus("");
    try {
      await persistence.initialize();
      const loaded = await persistence.listBenchmarkDrafts();
      setCases(loaded);
      setStatus("已重新扫描本机训练记录；已存在的人工标注不会被自动回填覆盖。");
    } catch (error) {
      console.error("Benchmark draft rescan failed.", error);
      setStatus("重新扫描失败。正常训练记录仍然保留。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => {
    const draft = cases.filter(item => item.annotationStatus !== "adjudicated").length;
    const adjudicated = cases.filter(item => item.annotationStatus === "adjudicated").length;
    const scored = cases.filter(item => item.gold.humanScores.length > 0).length;
    return { draft, adjudicated, scored };
  }, [cases]);

  function updateCase(updated: GradingBenchmarkCase) {
    setCases(current => current.map(item => item.id === updated.id ? updated : item));
    if (updated.annotationStatus === "adjudicated") setEditingCaseId(null);
  }

  return <section className="settings-section benchmark-lab-section">
    <div className="settings-section-heading">
      <div>
        <h2>Benchmark Lab</h2>
        <p>真实训练记录先冻结成 draft，再由人工按 material-first 协议完成 gold。模型输出不进入人工标注页面。</p>
      </div>
      <div className="benchmark-lab-icon"><TestTube2 size={22}/></div>
    </div>

    <div className="benchmark-lab-metrics">
      <div><span>待人工标注</span><strong>{counts.draft}</strong></div>
      <div><span>已 adjudicated</span><strong>{counts.adjudicated}</strong></div>
      <div><span>有真实人工分</span><strong>{counts.scored}</strong></div>
    </div>

    <div className="benchmark-lab-toolbar">
      <div className="benchmark-lab-note"><Database size={16}/><span>只捕获手工导入题的真实作答；内置 synthetic debug 题不会自动混入这里。</span></div>
      <button className="secondary" disabled={loading} onClick={rescan}><RefreshCw size={15}/>{loading ? "扫描中…" : "重新扫描"}</button>
    </div>

    {status && <div className="benchmark-lab-status">{status}</div>}

    {loading && !cases.length ? <div className="benchmark-lab-empty">正在读取本机 Benchmark Draft…</div> : cases.length ? <div className="benchmark-case-list">
      {cases.map(testCase => {
        const open = openCaseId === testCase.id;
        const editing = editingCaseId === testCase.id;
        const adjudicated = testCase.annotationStatus === "adjudicated";
        return <article className="benchmark-case-card" key={testCase.id}>
          <button className="benchmark-case-summary" onClick={() => setOpenCaseId(open ? null : testCase.id)}>
            <div>
              <span>{formatStatus(testCase)}</span>
              <strong>{testCase.question.title}</strong>
              <small>{testCase.question.type} · {testCase.question.maxScore} 分 · ≤ {testCase.question.wordLimit} 字 · {testCase.question.materials.length} 则材料</small>
            </div>
            <div className="benchmark-case-right"><code>{testCase.id}</code>{open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</div>
          </button>
          {open && <div className="benchmark-case-detail">
            <div className="benchmark-snapshot-grid">
              <div><span>作答任务</span><p>{testCase.question.prompt}</p></div>
              <div><span>原始作答</span><p>{testCase.answer}</p></div>
            </div>
            <div className="benchmark-material-preview"><span>材料快照</span>{testCase.question.materials.map(material => <div key={material.id}><strong>{material.label}</strong><p>{material.content}</p></div>)}</div>
            <label className="benchmark-json"><span>盲标检查 JSON（参考答案已隐藏）</span><textarea readOnly value={blindInspectionJson(testCase)} /></label>
            <div className="benchmark-readonly-warning">原始 case 仍保存可选参考答案，但盲标检查界面不展示正文。Human Gold 编辑器也不读取 AI review。</div>
            {!adjudicated && <div className="benchmark-annotation-actions"><button className="primary" onClick={() => setEditingCaseId(editing ? null : testCase.id)}><PenLine size={15}/>{editing ? "收起人工标注" : testCase.gold.materialPoints.length ? "继续人工标注" : "开始人工标注"}</button></div>}
            {adjudicated && <div className="benchmark-adjudicated-lock">该 case 已完成 adjudication，普通 Lab 界面保持只读。后续若发现 gold 错误，应通过带修订记录的纠错流程处理，而不是静默覆盖。</div>}
          </div>}
          {editing && !adjudicated && <HumanGoldEditor testCase={testCase} onSaved={updateCase} onClose={() => setEditingCaseId(null)} />}
        </article>;
      })}
    </div> : <div className="benchmark-lab-empty">还没有真实训练 draft。先手工导入一道真实题并完成一次作答，系统会自动冻结快照。</div>}
  </section>;
}
