import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen, Check, Clock3, ExternalLink, FileText, LoaderCircle, RefreshCw, Sparkles, Target
} from "lucide-react";
import { errorMessage } from "./errorMessage";
import {
  acquireDailyReadingPlan,
  dateKey,
  getDailyReadingTheme,
  type DailyNewsArticle,
  type DailyReadingPlan
} from "./dailyReading";
import { dailyReadingStore } from "./dailyReadingStore";
import { deepReadQuestion, type DeepReadAnnotation, type MaterialDeepReadOutput } from "./materialLearning";
import { loadMaterialDeepReadSnapshot, saveMaterialDeepReadSnapshot } from "./materialLearningStore";
import type { Question } from "./types";

function articleAsQuestion(article: DailyNewsArticle, plan: DailyReadingPlan): Question {
  return {
    id: article.id,
    title: `每日时事精读｜${article.title}`,
    year: Number(plan.date.slice(0, 4)),
    region: article.scope === "anhui" ? "安徽" : "国家",
    type: "概括归纳",
    difficulty: "进阶",
    score: 20,
    wordLimit: 300,
    prompt: `围绕“${plan.theme.name}”，从本文提炼问题、做法、成效和内在机制，形成一张可用于行政执法申论的素材卡。`,
    materials: [{ id: `${article.id}-body`, label: "时事原文", content: article.content }],
    tags: [plan.theme.name, article.role === "policy" ? "政策制度" : "基层案例", "每日时事"],
    source: "local",
    createdAt: plan.generatedAt
  };
}

function MarkedArticle({ content, annotations }: { content: string; annotations: DeepReadAnnotation[] }) {
  const matches = annotations
    .map((annotation, annotationIndex) => ({ annotation, annotationIndex, start: content.indexOf(annotation.quote) }))
    .filter(match => match.start >= 0)
    .sort((a, b) => a.start - b.start || b.annotation.quote.length - a.annotation.quote.length)
    .filter((match, index, all) => index === 0 || match.start >= all[index - 1].start + all[index - 1].annotation.quote.length);
  if (!matches.length) return <>{content}</>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) nodes.push(content.slice(cursor, match.start));
    nodes.push(<mark key={`${match.start}-${match.annotationIndex}`} className={`material-mark mark-${match.annotation.type}`} title={match.annotation.keyPoint}>
      {match.annotation.quote}<sup>{match.annotationIndex + 1}</sup>
    </mark>);
    cursor = match.start + match.annotation.quote.length;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return <>{nodes}</>;
}

function formatTimer(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function DailyMaterialPage({ onSwitchPast }: { onSwitchPast: () => void }) {
  const today = dateKey();
  const [plan, setPlan] = useState<DailyReadingPlan | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("正在准备今日主题…");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [output, setOutput] = useState<MaterialDeepReadOutput | null>(null);
  const [deepReading, setDeepReading] = useState(false);
  const [deepReadError, setDeepReadError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(20 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  const selectedArticle = plan?.articles.find(article => article.id === selectedId) ?? plan?.articles[0] ?? null;
  const selectedQuestion = useMemo(
    () => selectedArticle && plan ? articleAsQuestion(selectedArticle, plan) : null,
    [plan, selectedArticle]
  );

  useEffect(() => {
    let cancelled = false;
    void dailyReadingStore.load(today).then(stored => {
      if (cancelled) return;
      if (stored?.articles.length === 2) {
        setPlan(stored);
        setSelectedId(stored.articles[0].id);
        setLoading(false);
      } else {
        void refreshPlan();
      }
    }).catch(() => void refreshPlan());
    return () => { cancelled = true; };
  }, [today]);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = globalThis.setInterval(() => setSeconds(value => {
      if (value <= 1) {
        setTimerRunning(false);
        return 0;
      }
      return value - 1;
    }), 1000);
    return () => globalThis.clearInterval(timer);
  }, [timerRunning]);

  useEffect(() => {
    let cancelled = false;
    setOutput(null);
    setDeepReadError(null);
    if (!selectedQuestion) return () => { cancelled = true; };
    void loadMaterialDeepReadSnapshot(selectedQuestion).then(snapshot => {
      if (!cancelled && snapshot) setOutput(snapshot.result);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedQuestion]);

  async function refreshPlan() {
    setLoading(true);
    setLoadError(null);
    setProgress("正在准备今日主题…");
    try {
      const next = await acquireDailyReadingPlan(new Date(), setProgress);
      await dailyReadingStore.save(next);
      setPlan(next);
      setSelectedId(next.articles[0]?.id ?? "");
      setSeconds(20 * 60);
      setTimerRunning(false);
    } catch (error) {
      setLoadError(errorMessage(error, "今日素材获取失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }

  async function runDeepRead() {
    if (!selectedQuestion || deepReading) return;
    setDeepReading(true);
    setDeepReadError(null);
    try {
      const result = await deepReadQuestion(selectedQuestion);
      await saveMaterialDeepReadSnapshot(selectedQuestion, result);
      setOutput(result);
    } catch (error) {
      setDeepReadError(errorMessage(error, "AI 提炼失败，请检查模型配置。"));
    } finally {
      setDeepReading(false);
    }
  }

  async function markRead() {
    if (!plan || !selectedArticle) return;
    const next = await dailyReadingStore.markRead(plan, selectedArticle.id);
    setPlan(next);
    const unread = next.articles.find(article => !next.readArticleIds.includes(article.id));
    if (unread) setSelectedId(unread.id);
  }

  const theme = plan?.theme ?? getDailyReadingTheme();
  return <main className="page page-wide material-bank-page daily-material-page">
    <nav className="material-mode-tabs" aria-label="素材精读类型">
      <button onClick={onSwitchPast}>真题精读</button>
      <button className="active">每日时事 <span>20 分钟</span></button>
    </nav>

    <header className="daily-header">
      <div>
        <p className="eyebrow">{today} · 今日主题</p>
        <h1>{theme.name}</h1>
        <p>{theme.focus}。{theme.readingPrompt}</p>
      </div>
      <div className={`daily-timer ${timerRunning ? "running" : ""}`}>
        <Clock3 size={18}/><strong>{formatTimer(seconds)}</strong>
        <button onClick={() => setTimerRunning(value => !value)} disabled={!plan}>{timerRunning ? "暂停" : seconds < 20 * 60 ? "继续" : "开始"}</button>
      </div>
    </header>

    {loading && <section className="daily-loading"><LoaderCircle className="spin" size={25}/><strong>{progress}</strong><span>只保留有制度、过程、问题或成效细节的文章。</span></section>}
    {!loading && loadError && <section className="daily-loading error"><RefreshCw size={24}/><strong>今天尚未取到两篇合格素材</strong><span>{loadError}</span><button className="primary" onClick={() => void refreshPlan()}>重新获取</button></section>}

    {plan && <>
      <section className="daily-plan-bar">
        <div><strong>今日两篇</strong><span>① 政策/制度 7 分钟　② 基层/安徽案例 7 分钟　③ 合并提炼 6 分钟</span></div>
        <button className="secondary" disabled={loading} onClick={() => void refreshPlan()}><RefreshCw size={14}/>重新选取</button>
      </section>
      <details className="daily-method-note"><summary>为什么这样选</summary><p>行政执法卷重点测查依法办事与公共服务；本地真题样本又高频出现工作提纲、公开信、问题对策等任务。因此系统不按热搜选稿，而是优先保留含“对象—问题—依据—动作—成效”的制度材料和基层案例，并按权威性、时效性、主题相关度、材料结构完整度评分；纯会议消息和重复标题降权。</p></details>
      <section className="daily-article-picker">
        {plan.articles.map((article, index) => {
          const read = plan.readArticleIds.includes(article.id);
          return <button key={article.id} className={`${selectedArticle?.id === article.id ? "active" : ""} ${read ? "read" : ""}`} onClick={() => setSelectedId(article.id)}>
            <span className="daily-article-number">0{index + 1}</span>
            <div><small>{article.role === "policy" ? "政策 / 制度" : "案例 / 现场"} · {article.scope === "anhui" ? "安徽" : "全国"}</small><strong>{article.title}</strong><p>{article.selectionReason}</p><em>{article.source} · {article.publishedAt || "近期"} · 入选分 {article.score}</em></div>
            {read && <Check size={18}/>}
          </button>;
        })}
      </section>

      {selectedArticle && <>
        <section className="daily-reader-toolbar">
          <div><span>{selectedArticle.source}</span><span>{selectedArticle.publishedAt || "近期发布"}</span><span>正文 {selectedArticle.content.length} 字</span></div>
          <div><a href={selectedArticle.url} target="_blank" rel="noreferrer">查看官方原文<ExternalLink size={13}/></a><button className="primary" disabled={deepReading} onClick={() => void runDeepRead()}>{deepReading ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} {output ? "重新提炼" : "AI 提炼"}</button></div>
        </section>
        {deepReadError && <div className="deep-read-error">{deepReadError}</div>}
        <section className={`daily-reading-sheet ${output ? "with-points" : ""}`}>
          <article>
            <div className="source-paper-title"><FileText size={18}/><strong>{selectedArticle.title}</strong></div>
            <div className="daily-source-text"><MarkedArticle content={selectedArticle.content} annotations={output?.annotations ?? []}/></div>
          </article>
          <aside>
            <div className="key-point-heading"><Target size={18}/><strong>{output ? "申论提炼" : "阅读任务"}</strong></div>
            {output ? <ol>{output.annotations.map((annotation, index) => <li key={`${annotation.quote}-${index}`} className={`point-${annotation.type}`}><span>{index + 1}</span><p>{annotation.keyPoint}</p></li>)}</ol> : <div className="daily-reading-prompts"><p><strong>第一遍：</strong>圈出主体、对象、矛盾和政策目的。</p><p><strong>第二遍：</strong>标出做法、制度机制、数据和成效。</p><p><strong>读完：</strong>用“问题—做法—机制—成效”复述，不抄新闻导语。</p></div>}
          </aside>
        </section>
        {output && <section className="daily-material-card">
          <div><BookOpen size={17}/><strong>300 字申论素材卡</strong></div>
          <p>{output.referenceAnswer}</p>
          <details><summary>查看迁移角度与表达</summary><div>{output.essayAngles.map(item => <p key={item.claim}><strong>{item.claim}</strong>：{item.reasoning}</p>)}{output.expressions.map(item => <p key={item.phrase}><strong>{item.phrase}</strong>：{item.meaning}</p>)}</div></details>
        </section>}
        <div className="daily-finish"><button className="secondary" onClick={() => void markRead()}><Check size={15}/>{plan.readArticleIds.includes(selectedArticle.id) ? "已完成这篇" : "读完并看下一篇"}</button><span>进度 {plan.readArticleIds.length}/2</span></div>
      </>}
    </>}
  </main>;
}
