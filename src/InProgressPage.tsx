import { useState } from "react";
import { ArrowRight, Clock3, FileText, PenLine, Trash2 } from "lucide-react";
import { questionPaperTitle, taskNumber } from "./examPaper";
import type { InProgressPractice } from "./inProgressPractice";
import type { Question } from "./types";

function savedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近已保存";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function progressText(item: InProgressPractice): string[] {
  const labels: string[] = [];
  if (item.hasFullAnswer) labels.push(`整篇作答 ${item.answerChars} 字`);
  if (item.hasEssayDrill) labels.push(`作文短练 ${item.essayStepCount}/5 步`);
  return labels;
}

export default function InProgressPage({ items, questions, onResume, onClear }: {
  items: InProgressPractice[];
  questions: Question[];
  onResume: (question: Question) => void;
  onClear: (questionId: string) => Promise<void>;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const questionById = new Map(questions.map(question => [question.id, question]));
  const resumable = items.flatMap(item => {
    const question = questionById.get(item.questionId);
    return question ? [{ item, question }] : [];
  });

  return <main className="page page-wide in-progress-page">
    <header className="page-header compact"><div><p className="eyebrow">自动保存的训练</p><h1>继续未完成的答题</h1><p>整篇答案与作文五步短练都会保留，点击即可回到原题继续。</p></div><span className="in-progress-total">{resumable.length} 道进行中</span></header>
    {resumable.length ? <div className="in-progress-list">{resumable.map(({ item, question }) => <article className="in-progress-card" key={question.id}>
      <div className="in-progress-card-main">
        <div className="in-progress-kicker"><span>{questionPaperTitle(question)}</span><span>第{taskNumber(question)}题 · {question.type}</span></div>
        <h2>{question.title}</h2>
        <p>{item.answerPreview || "已完成部分作文短练，整篇答案尚未开始。"}</p>
        <div className="in-progress-meta">{progressText(item).map(label => <span key={label}>{label.startsWith("整篇") ? <FileText size={14}/> : <PenLine size={14}/>} {label}</span>)}<span><Clock3 size={14}/> {savedTime(item.updatedAt)} 保存</span></div>
      </div>
      <div className="in-progress-actions">
        {confirmingId === question.id ? <div className="in-progress-confirm">
          <span>整篇答案和五步短练都会清空</span>
          <div><button className="secondary" disabled={clearingId === question.id} onClick={() => setConfirmingId(null)}>取消</button><button className="danger-button" disabled={clearingId === question.id} onClick={() => {
            setClearingId(question.id);
            setClearError(null);
            void onClear(question.id)
              .then(() => setConfirmingId(null))
              .catch(() => setClearError("清空失败，请重试。"))
              .finally(() => setClearingId(null));
          }}>{clearingId === question.id ? "正在清空…" : "确认清空"}</button></div>
        </div> : <><button className="clear-draft-button" onClick={() => setConfirmingId(question.id)}><Trash2 size={15}/>清空内容</button><button className="primary" onClick={() => onResume(question)}>继续作答 <ArrowRight size={16}/></button></>}
      </div>
    </article>)}</div> : <div className="empty-state standalone in-progress-empty"><PenLine size={28}/><strong>没有未完成的答题</strong><span>开始作答后，写下的答案或作文短练会自动出现在这里。</span></div>}
    {clearError && <p className="in-progress-error" role="alert">{clearError}</p>}
  </main>;
}
