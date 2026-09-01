import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { BookOpen, Check, Eraser, ExternalLink, FileText, Highlighter, LoaderCircle, Minus, PenLine, Plus, RefreshCw, Sparkles, Target, Trash2, Underline, Undo2 } from "lucide-react";
import { errorMessage } from "./errorMessage";
import { acquireDailyReadingPlan, DAILY_ARTICLE_TARGET, dateKey, type DailyArticleScope, type DailyNewsArticle, type DailyReadingPlan } from "./dailyReading";
import { dailyReadingStore } from "./dailyReadingStore";
import { deepReadQuestion, type MaterialDeepReadOutput } from "./materialLearning";
import { loadMaterialDeepReadSnapshot, saveMaterialDeepReadSnapshot } from "./materialLearningStore";
import { getReadingSelectionRange, READING_HIGHLIGHT_COLORS, ReadingTextStage, type ReadingAiMark, type ReadingAnnotationMode, type ReadingInkMode } from "./ReadingAnnotation";
import { getPracticeAnnotations, getPracticeInkStrokes, savePracticeAnnotations, savePracticeInkStrokes, type PracticeHighlightColor, type PracticeInkStroke, type PracticeTextAnnotation } from "./practiceSessionStore";
import type { Question } from "./types";

const MATERIAL_FONT_KEY = "shenlun:material-font-size:v2";
const MATERIAL_FONT_MIN = 16;
const MATERIAL_FONT_MAX = 24;
const MATERIAL_FONT_DEFAULT = 18;

function articleAsQuestion(article: DailyNewsArticle, plan: DailyReadingPlan): Question {
  return {
    id: article.id,
    title: `每日时事｜${article.title}`,
    year: Number(plan.date.slice(0, 4)),
    region: article.scope === "anhui" ? "安徽" : article.scope === "regional" ? "地方" : "全国",
    type: "概括归纳",
    difficulty: "进阶",
    score: 20,
    wordLimit: 300,
    prompt: "从本文提炼问题、做法、成效和内在机制，形成一张可迁移的申论素材卡。",
    materials: [{ id: `${article.id}-body`, label: "时事原文", content: article.content }],
    tags: [article.role === "policy" ? "政策制度" : "基层案例", "每日时事"],
    source: "local",
    createdAt: plan.generatedAt
  };
}

function scopeLabel(scope: DailyArticleScope): string {
  if (scope === "anhui") return "安徽实践";
  if (scope === "regional") return "地方实践";
  return "中央 / 全国";
}

function roleLabel(role: DailyNewsArticle["role"]): string {
  return role === "policy" ? "政策 / 制度" : "案例 / 现场";
}

function readFontSize(): number {
  const raw = Number(localStorage.getItem(MATERIAL_FONT_KEY));
  return Number.isFinite(raw) ? Math.min(MATERIAL_FONT_MAX, Math.max(MATERIAL_FONT_MIN, Math.round(raw))) : MATERIAL_FONT_DEFAULT;
}

function aiMarkForArticle(article: DailyNewsArticle | null, output: MaterialDeepReadOutput | null): ReadingAiMark[] {
  if (!article || !output) return [];
  return output.annotations.flatMap((annotation, index) => {
    const start = article.content.indexOf(annotation.quote);
    return start >= 0 ? [{ start, end: start + annotation.quote.length, type: annotation.type, keyPoint: annotation.keyPoint, index }] : [];
  });
}

export default function DailyMaterialPage() {
  const today = dateKey();
  const [plan, setPlan] = useState<DailyReadingPlan | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [articleFilter, setArticleFilter] = useState<"all" | "policy" | "case">("all");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("正在准备今日新闻…");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [output, setOutput] = useState<MaterialDeepReadOutput | null>(null);
  const [deepReading, setDeepReading] = useState(false);
  const [deepReadError, setDeepReadError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [annotationMode, setAnnotationMode] = useState<ReadingAnnotationMode>(null);
  const [inkMode, setInkMode] = useState<ReadingInkMode>(null);
  const [highlightColor, setHighlightColor] = useState<PracticeHighlightColor>("yellow");
  const [annotations, setAnnotations] = useState<PracticeTextAnnotation[]>([]);
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false);
  const [inkStrokes, setInkStrokes] = useState<PracticeInkStroke[]>([]);
  const [inkLoaded, setInkLoaded] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(readFontSize);

  const selectedArticle = plan?.articles.find(article => article.id === selectedId) ?? plan?.articles[0] ?? null;
  const selectedQuestion = useMemo(
    () => selectedArticle && plan ? articleAsQuestion(selectedArticle, plan) : null,
    [plan, selectedArticle]
  );
  const filteredArticles = useMemo(
    () => plan?.articles.filter(article => articleFilter === "all" || article.role === articleFilter) ?? [],
    [articleFilter, plan]
  );
  const aiMarks = useMemo(() => aiMarkForArticle(selectedArticle, output), [output, selectedArticle]);

  useEffect(() => {
    let cancelled = false;
    void dailyReadingStore.load(today).then(stored => {
      if (cancelled) return;
      if (stored) {
        setPlan(stored);
        setSelectedId(stored.articles[0]?.id ?? "");
        setLoading(false);
      } else {
        void refreshPlan();
      }
    }).catch(() => void refreshPlan());
    return () => { cancelled = true; };
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    setOutput(null);
    setDeepReadError(null);
    setLinkError(null);
    setAnnotations([]);
    setInkStrokes([]);
    setAnnotationsLoaded(false);
    setInkLoaded(false);
    setAnnotationMode(null);
    setInkMode(null);
    setSelectedAnnotationId(null);
    if (!selectedQuestion || !selectedArticle) return () => { cancelled = true; };
    void Promise.all([
      loadMaterialDeepReadSnapshot(selectedQuestion).catch(() => null),
      getPracticeAnnotations(selectedArticle.id).catch(error => {
        console.error("Failed to load daily article annotations.", error);
        return [] as PracticeTextAnnotation[];
      }),
      getPracticeInkStrokes(selectedArticle.id).catch(error => {
        console.error("Failed to load daily article ink strokes.", error);
        return [] as PracticeInkStroke[];
      })
    ]).then(([snapshot, storedAnnotations, storedInk]) => {
      if (cancelled) return;
      if (snapshot) setOutput(snapshot.result);
      setAnnotations(storedAnnotations);
      setInkStrokes(storedInk);
      setAnnotationsLoaded(true);
      setInkLoaded(true);
    });
    return () => { cancelled = true; };
  }, [selectedArticle, selectedQuestion]);

  useEffect(() => {
    localStorage.setItem(MATERIAL_FONT_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    if (!annotationsLoaded || !selectedArticle) return;
    const timer = window.setTimeout(() => {
      void savePracticeAnnotations(selectedArticle.id, annotations).catch(error => console.error("Failed to save daily article annotations.", error));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [annotations, annotationsLoaded, selectedArticle]);

  useEffect(() => {
    if (!inkLoaded || !selectedArticle) return;
    const timer = window.setTimeout(() => {
      void savePracticeInkStrokes(selectedArticle.id, inkStrokes).catch(error => console.error("Failed to save daily article ink strokes.", error));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [inkLoaded, inkStrokes, selectedArticle]);

  async function refreshPlan() {
    setLoading(true);
    setLoadError(null);
    setPlan(null);
    setSelectedId("");
    setProgress("正在准备今日新闻…");
    try {
      const next = await acquireDailyReadingPlan(new Date(), setProgress);
      await dailyReadingStore.save(next);
      setPlan(next);
      setSelectedId(next.articles[0]?.id ?? "");
    } catch (error) {
      setLoadError(errorMessage(error, "今日新闻获取失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }

  function openArticle(articleId: string) {
    setSelectedId(articleId);
    setDeepReadError(null);
    setLinkError(null);
  }

  async function openOfficialArticle(url: string) {
    setLinkError(null);
    try {
      if (isTauri()) {
        await invoke("open_external_url", { url });
        return;
      }
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.assign(url);
    } catch (error) {
      setLinkError(errorMessage(error, "无法打开官方原文，请检查系统默认浏览器设置。"));
    }
  }

  function annotateSelection(materialId: string, event: MouseEvent<HTMLElement>) {
    if (!annotationMode || !annotationsLoaded || inkMode) return;
    const range = getReadingSelectionRange(event.currentTarget, event);
    if (!range) return;
    const id = crypto.randomUUID();
    setAnnotations(current => [...current, {
      id,
      materialId,
      start: range.start,
      end: range.end,
      type: annotationMode,
      ...(annotationMode === "highlight" ? { color: highlightColor } : {})
    }]);
    setSelectedAnnotationId(id);
  }

  function commitInkStroke(stroke: PracticeInkStroke) {
    setInkStrokes(current => [...current, stroke].slice(-500));
  }

  function eraseInkStroke(strokeId: string) {
    setInkStrokes(current => current.filter(item => item.id !== strokeId));
  }

  function undoLastAnnotation() {
    setAnnotations(current => {
      if (!current.length) return current;
      const next = current.slice(0, -1);
      setSelectedAnnotationId(next.at(-1)?.id ?? null);
      return next;
    });
  }

  function deleteSelectedAnnotation() {
    if (!selectedAnnotationId) return;
    setAnnotations(current => current.filter(item => item.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  }

  function undoLastInkStroke() {
    setInkStrokes(current => current.length ? current.slice(0, -1) : current);
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
  }

  const readerAnnotations = output?.annotations ?? [];

  return <main className="page page-wide material-bank-page daily-material-page">
    <header className="daily-header">
      <div>
        <p className="eyebrow">{today} · 每日时事</p>
        <h1>今天读什么</h1>
        <p>中央政策与全国治理案例为主，穿插不同地区实践。每天 {DAILY_ARTICLE_TARGET} 篇，点击任意一篇即可阅读。</p>
      </div>
    </header>

    {loading && <section className="daily-loading"><LoaderCircle className="spin" size={25}/><strong>{progress}</strong><span>正在从公开权威栏目加载今日新闻正文。</span></section>}
    {!loading && loadError && <section className="daily-loading error"><RefreshCw size={24}/><strong>今天还没有准备好新闻</strong><span>{loadError}</span><button className="primary" onClick={() => void refreshPlan()}>重新获取</button></section>}

    {!loading && plan && <>
      <section className="daily-selection-head">
        <div><strong>今日推送</strong><span>{plan.articles.length} 篇 · 中央为主，地方来源分散</span></div>
        <button className="secondary" onClick={() => void refreshPlan()}><RefreshCw size={14}/>换一批</button>
      </section>
      <nav className="daily-filter-tabs" aria-label="新闻筛选">
        {([['all', `全部 ${plan.articles.length}`], ['policy', `政策制度 ${plan.articles.filter(article => article.role === "policy").length}`], ['case', `案例实践 ${plan.articles.filter(article => article.role === "case").length}`]] as const).map(([value, label]) => <button key={value} className={articleFilter === value ? "active" : ""} onClick={() => setArticleFilter(value)}>{label}</button>)}
      </nav>
      <section className="daily-article-picker" aria-label="今日新闻">
        {filteredArticles.map(article => {
          const active = selectedArticle?.id === article.id;
          const read = plan.readArticleIds.includes(article.id);
          return <button key={article.id} className={`${active ? "active" : ""} ${read ? "read" : ""}`} aria-pressed={active} onClick={() => openArticle(article.id)}>
            <span className="daily-article-number">{String(plan.articles.indexOf(article) + 1).padStart(2, "0")}</span>
            <div><small>{roleLabel(article.role)} · {scopeLabel(article.scope)}</small><strong>{article.title}</strong><p>{article.summary}</p><em>{article.source} · {article.publishedAt || "近期"}</em></div>
            <span className="daily-article-check">{active ? "阅读中" : "打开"}</span>
            {read && <span className="daily-article-read">已读</span>}
          </button>;
        })}
      </section>

      {selectedArticle && selectedQuestion && <>
        <section className="daily-reader-toolbar">
          <div><span>{selectedArticle.source}</span><span>{scopeLabel(selectedArticle.scope)}</span><span>{selectedArticle.publishedAt || "近期发布"}</span><span>正文 {selectedArticle.content.length} 字</span></div>
          <div><button className="daily-official-link" onClick={() => void openOfficialArticle(selectedArticle.url)}>查看官方原文<ExternalLink size={13}/></button><button className="primary" disabled={deepReading} onClick={() => void runDeepRead()}>{deepReading ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} {deepReading ? "提炼中…" : output ? "重新提炼" : "AI 提炼"}</button></div>
        </section>
        {linkError && <div className="deep-read-error">{linkError}</div>}
        {deepReadError && <div className="deep-read-error">{deepReadError}</div>}
        <section className="daily-reading-sheet">
          <article>
            <div className="source-paper-title"><FileText size={18}/><strong>{selectedArticle.title}</strong><span>{selectedArticle.providerName}</span></div>
            <div className="annotation-toolbar daily-annotation-toolbar" aria-label="新闻标注工具">
              <div className="annotation-tool-group"><FileText size={15}/><strong>原文标注</strong></div>
              <button title="按申论答题要素给原文分类标记" disabled={!annotationsLoaded} className={annotationMode === "highlight" ? "active" : ""} onClick={() => { setInkMode(null); setAnnotationMode(mode => mode === "highlight" ? null : "highlight"); }}><Highlighter size={15}/><span>要素标注</span></button>
              {annotationMode === "highlight" && <div className="highlight-color-palette" aria-label="记号笔颜色">
                {READING_HIGHLIGHT_COLORS.map(item => <button type="button" key={item.value} className={`highlight-color-dot color-${item.value} ${highlightColor === item.value ? "selected" : ""}`} title={`${item.label}：${item.hint}`} aria-label={`${item.label}：${item.hint}`} onClick={() => setHighlightColor(item.value)}><i aria-hidden="true"/><span className="highlight-color-name">{item.label}</span></button>)}
              </div>}
              <button title="标出转折、因果、递进、并列等逻辑关系" disabled={!annotationsLoaded} className={annotationMode === "underline" ? "active" : ""} onClick={() => { setInkMode(null); setAnnotationMode(mode => mode === "underline" ? null : "underline"); }}><Underline size={15}/><span>逻辑线</span></button>
              <button title="在原文上直接画线或圈出重点" disabled={!inkLoaded} className={inkMode === "pen" ? "active" : ""} onClick={() => { setAnnotationMode(null); setInkMode(mode => mode === "pen" ? null : "pen"); }}><PenLine size={15}/><span>画笔</span></button>
              <button title="擦除已经画出的笔迹" disabled={!inkLoaded || !inkStrokes.length} className={inkMode === "eraser" ? "active" : ""} onClick={() => { setAnnotationMode(null); setInkMode(mode => mode === "eraser" ? null : "eraser"); }}><Eraser size={15}/><span>橡皮</span></button>
              <button title="撤销最近一次文字标记" disabled={!annotations.length} onClick={undoLastAnnotation}><Undo2 size={15}/><span>撤销标记</span></button>
              <button title="删除当前选中的文字标记" disabled={!selectedAnnotationId} onClick={deleteSelectedAnnotation}><Trash2 size={15}/><span>删除当前</span></button>
              <button title="撤销最近一笔" disabled={!inkStrokes.length} onClick={undoLastInkStroke}><Undo2 size={15}/><span>撤销笔迹</span></button>
              <div className="material-font-controls">
                <button type="button" disabled={fontSize <= MATERIAL_FONT_MIN} onClick={() => setFontSize(value => Math.max(MATERIAL_FONT_MIN, value - 1))} aria-label="减小正文大小"><Minus size={13}/><span>A</span></button>
                <span className="material-font-value" aria-live="polite">{fontSize}px</span>
                <button type="button" disabled={fontSize >= MATERIAL_FONT_MAX} onClick={() => setFontSize(value => Math.min(MATERIAL_FONT_MAX, value + 1))} aria-label="增大正文大小"><Plus size={13}/><span>A</span></button>
              </div>
            </div>
            <ReadingTextStage
              materialId={selectedArticle.id}
              content={selectedArticle.content}
              fontSize={fontSize}
              annotations={annotations}
              aiMarks={aiMarks}
              selectedAnnotationId={selectedAnnotationId}
              annotationMode={annotationMode}
              inkMode={inkMode}
              strokes={inkStrokes}
              onAnnotateSelection={annotateSelection}
              onSelectAnnotation={setSelectedAnnotationId}
              onClearAnnotationSelection={() => setSelectedAnnotationId(null)}
              onCommitStroke={commitInkStroke}
              onEraseStroke={eraseInkStroke}
            />
          </article>
          <aside>
            <div className="key-point-heading"><Target size={18}/><strong>{output ? "AI 提炼" : "阅读笔记"}</strong>{output && <span>{readerAnnotations.length}</span>}</div>
            {output ? <ol>{readerAnnotations.map((annotation, index) => <li key={`${annotation.quote}-${index}`} className={`point-${annotation.type}`}><span>{index + 1}</span><p>{annotation.keyPoint}</p></li>)}</ol> : <div className="daily-reading-empty"><strong>边读边标</strong><span>用高亮、逻辑线或画笔留下自己的阅读痕迹。</span></div>}
          </aside>
        </section>
        {output && <section className="daily-material-card">
          <div><BookOpen size={17}/><strong>申论素材卡</strong></div>
          <p>{output.referenceAnswer}</p>
          <details><summary>查看迁移角度与表达</summary><div>{output.essayAngles.map(item => <p key={item.claim}><strong>{item.claim}</strong>：{item.reasoning}</p>)}{output.expressions.map(item => <p key={item.phrase}><strong>{item.phrase}</strong>：{item.meaning}</p>)}</div></details>
        </section>}
        <div className="daily-finish"><button className="secondary" onClick={() => void markRead()}><Check size={15}/>{plan.readArticleIds.includes(selectedArticle.id) ? "已标记为已读" : "标记为已读"}</button><span>已读 {plan.readArticleIds.length}/{plan.articles.length}</span></div>
      </>}
    </>}
  </main>;
}
