"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertCircle, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, CircleDashed,
  Clock3, Inbox, Layers3, LoaderCircle, MessageCircle, Pencil, Plus, RotateCcw,
  Search, Send, Sparkles, StickyNote, Trash2, WandSparkles, X,
} from "lucide-react";
import type { DashboardStats, QuestionDetail, QuestionSummary, QuestionStatus } from "@/lib/types";
import { CATEGORIES } from "@/lib/questions";

type Filter = "all" | "todo" | "learning" | "mastered" | "due";
type Tab = "answer" | "discussion";
type ListResponse = { questions: QuestionSummary[]; stats: DashboardStats; categories: string[] };

const STATUS_LABELS: Record<QuestionStatus, string> = { todo: "待做", learning: "学习中", mastered: "已掌握" };
const FILTER_LABELS: Record<Filter, string> = { all: "全部题目", todo: "待做题目", learning: "学习中", mastered: "已掌握", due: "待复习" };
const SAMPLE_QUESTIONS = "1. HashMap 为什么线程不安全？\n2. MySQL 索引失效有哪些常见情况？\n3. TCP 三次握手为什么不是两次？\n4. Redis 的 RDB 和 AOF 有什么区别？";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后重试。");
  return data as T;
}

function relativeDate(value: string): string {
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export default function HomePage() {
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ total: 0, todo: 0, learning: 0, mastered: 0, due: 0 });
  const [categories, setCategories] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [tab, setTab] = useState<Tab>("answer");
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteEditText, setNoteEditText] = useState("");
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [answerDraft, setAnswerDraft] = useState("");

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    if (filter === "due") params.set("due", "true");
    else if (filter !== "all") params.set("status", filter);
    try {
      const data = await requestJson<ListResponse>(`/api/questions?${params.toString()}`);
      setQuestions(data.questions);
      setStats(data.stats);
      setCategories(data.categories);
      setSelectedId((current) => current && data.questions.some((q) => q.id === current) ? current : data.questions[0]?.id || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoadingList(false);
    }
  }, [search, category, filter]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    requestJson<{ aiConfigured: boolean }>("/api/config")
      .then((data) => setAiReady(data.aiConfigured))
      .catch(() => setAiReady(false));
  }, []);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let active = true;
    requestJson<{ question: QuestionDetail }>(`/api/questions/${selectedId}`)
      .then((data) => { if (active) setDetail(data.question); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "加载题目失败"); });
    return () => { active = false; };
  }, [selectedId]);

  const importCount = useMemo(() => importText.split(/\n+/).map((s) => s.trim()).filter(Boolean).length, [importText]);

  async function applyQuestionAction(url: string, method: string, body?: unknown, busyName = "save") {
    setBusy(busyName); setError(null); setNotice(null);
    try {
      const result = await requestJson<{ question: QuestionDetail }>(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      setDetail(result.question);
      await loadList();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setBusy("import"); setError(null); setNotice(null);
    try {
      const result = await requestJson<{ imported: number; duplicates: number; warning?: string }>("/api/questions/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: importText }),
      });
      setNotice(`导入 ${result.imported} 道题${result.duplicates ? `，跳过 ${result.duplicates} 道重复题` : ""}。${result.warning ? ` ${result.warning}` : ""}`);
      setImportOpen(false); setImportText(""); setFilter("all"); setCategory(null); setSearch("");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally { setBusy(null); }
  }

  async function handleChat() {
    if (!detail || !chatInput.trim()) return;
    const message = chatInput.trim();
    const ok = await applyQuestionAction(`/api/questions/${detail.id}/chat`, "POST", { message }, "chat");
    if (ok) { setChatInput(""); setTab("discussion"); }
  }

  async function handleDeleteQuestion() {
    if (!detail || !window.confirm("确定删除这道题及其答案、对话和备注吗？")) return;
    setBusy("delete"); setError(null);
    try {
      await requestJson<{ ok: boolean }>(`/api/questions/${detail.id}`, { method: "DELETE" });
      setDetail(null); setSelectedId(null); await loadList();
      setNotice("题目已删除。");
    } catch (err) { setError(err instanceof Error ? err.message : "删除失败"); }
    finally { setBusy(null); }
  }

  function selectQuestion(id: string) {
    setSelectedId(id); setTab("answer"); setEditingAnswer(false); setEditingNote(null); setError(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BookOpen size={21} strokeWidth={2.3} /></div>
          <div><div className="brand-name">知题<span className="brand-dot">.</span></div><div className="brand-caption">秋招知识库</div></div>
        </div>
        <div className="sidebar-section-label">工作台</div>
        <nav className="main-nav" aria-label="题目状态">
          <button className={`nav-item ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}><Layers3 size={17} /><span>全部题目</span><b>{stats.total}</b></button>
          <button className={`nav-item ${filter === "todo" ? "active" : ""}`} onClick={() => setFilter("todo")}><Inbox size={17} /><span>待做</span><b>{stats.todo}</b></button>
          <button className={`nav-item ${filter === "learning" ? "active" : ""}`} onClick={() => setFilter("learning")}><CircleDashed size={17} /><span>学习中</span><b>{stats.learning}</b></button>
          <button className={`nav-item ${filter === "mastered" ? "active" : ""}`} onClick={() => setFilter("mastered")}><CheckCircle2 size={17} /><span>已掌握</span><b>{stats.mastered}</b></button>
          <button className={`nav-item ${filter === "due" ? "active" : ""}`} onClick={() => setFilter("due")}><Clock3 size={17} /><span>待复习</span><b>{stats.due}</b></button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label">知识分类</div>
        <nav className="category-nav" aria-label="知识分类">
          <button className={`category-item ${category === null ? "selected" : ""}`} onClick={() => setCategory(null)}><span className="category-dot all-dot" />所有分类</button>
          {categories.map((item) => <button key={item} className={`category-item ${category === item ? "selected" : ""}`} onClick={() => setCategory(item)}><span className="category-dot" />{item}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-bottom-icon"><Sparkles size={17} /></div><div><strong>一点点，答得上</strong><span>每天解决一个不懂的点</span></div></div>
      </aside>

      <main className="workspace">
        <header className="topbar"><div className="breadcrumb">我的题库 <ChevronRight size={15} /> <strong>{FILTER_LABELS[filter]}</strong></div><div className={`ai-indicator ${aiReady ? "ready" : ""}`}><span />{aiReady === null ? "正在检查 AI" : aiReady ? "AI 已连接" : "AI 未配置"}</div></header>
        <div className="workspace-content">
          <div className="page-heading"><div><div className="eyebrow">INTERVIEW PREP / 2026</div><h1>{FILTER_LABELS[filter]}<span className="heading-period">.</span></h1><p>把不会的变成会的，把会的变成答得好的。</p></div><button className="primary-button" onClick={() => setImportOpen(true)}><Plus size={18} /> 批量导入题目</button></div>

          <div className="stats-grid">
            <div className="stat-card"><div className="stat-icon violet"><BookOpen size={18} /></div><span>题目总数</span><strong>{stats.total}</strong></div>
            <div className="stat-card"><div className="stat-icon orange"><Inbox size={18} /></div><span>等待开始</span><strong>{stats.todo}</strong></div>
            <div className="stat-card"><div className="stat-icon blue"><CircleDashed size={18} /></div><span>正在学习</span><strong>{stats.learning}</strong></div>
            <div className="stat-card"><div className="stat-icon green"><CheckCircle2 size={18} /></div><span>已经掌握</span><strong>{stats.mastered}</strong></div>
          </div>

          {aiReady === false && <div className="config-banner"><AlertCircle size={18} /><span>AI 功能尚未连接。导入仍可使用关键词分类；生成答案和追问需要在 <code>.env.local</code> 中配置模型。</span></div>}
          {notice && <div className="notice-banner"><Check size={17} /><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice(null)}><X size={16} /></button></div>}
          {error && <div className="error-banner"><AlertCircle size={17} /><span>{error}</span><button aria-label="关闭错误" onClick={() => setError(null)}><X size={16} /></button></div>}

          <div className="content-header"><div><h2>题目列表</h2><span>{questions.length} 道题</span></div><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索题目、分类或标签" aria-label="搜索题目" /></div></div>
          <div className="content-grid">
            <section className="question-list" aria-label="题目列表">
              {loadingList ? <div className="list-empty"><LoaderCircle className="spin" size={24} />正在加载题库...</div> : questions.length ? questions.map((question, index) => <button key={question.id} className={`question-row ${selectedId === question.id ? "selected" : ""}`} onClick={() => selectQuestion(question.id)}><div className="question-row-top"><span className="question-index">{String(index + 1).padStart(2, "0")}</span><span className={`status-pill status-${question.status}`}>{STATUS_LABELS[question.status]}</span></div><div className="question-title">{question.title}</div><div className="question-row-bottom"><span className="category-badge">{question.category}</span>{question.noteCount > 0 && <span className="row-meta"><StickyNote size={13} /> {question.noteCount} 个薄弱点</span>}<span className="row-date">{relativeDate(question.updatedAt)}</span></div><ChevronRight className="row-chevron" size={18} /></button>) : <div className="list-empty"><div className="empty-icon"><Inbox size={26} /></div><strong>{stats.total ? "没有符合条件的题目" : "你的题库还是空的"}</strong><p>{stats.total ? "试试其他筛选条件或搜索关键词。" : "先导入几道题，开始建立自己的秋招知识库。"}</p>{!stats.total && <button className="text-button" onClick={() => { setImportText(SAMPLE_QUESTIONS); setImportOpen(true); }}>试试示例题目 <ArrowRight size={16} /></button>}</div>}
            </section>

            <section className="detail-panel" aria-label="题目详情">
              {detail && selectedId === detail.id ? <>
                <div className="detail-top"><div className="detail-overline"><select className="category-select" aria-label="修改分类" value={detail.category} disabled={Boolean(busy)} onChange={(event) => applyQuestionAction(`/api/questions/${detail.id}`, "PATCH", { category: event.target.value }, "category")}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select><span className="detail-separator">/</span><select className="status-select" aria-label="修改状态" value={detail.status} disabled={Boolean(busy)} onChange={(event) => applyQuestionAction(`/api/questions/${detail.id}`, "PATCH", { status: event.target.value }, "status")}><option value="todo">待做</option><option value="learning">学习中</option><option value="mastered">已掌握</option></select></div><div className="detail-actions"><button className="icon-button" title="删除题目" aria-label="删除题目" onClick={handleDeleteQuestion} disabled={Boolean(busy)}><Trash2 size={17} /></button></div></div>
                <h2 className="detail-title">{detail.title}</h2>
                <div className="detail-meta"><span>收录于 {new Date(detail.createdAt).toLocaleDateString("zh-CN")}</span><span className="detail-meta-dot" /><span>{detail.answer ? "已有答案" : "尚未生成答案"}</span></div>
                {detail.tags.length > 0 && <div className="detail-tags">{detail.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
                <div className="detail-tabs"><button className={tab === "answer" ? "active" : ""} onClick={() => setTab("answer")}><BookOpen size={16} />参考答案</button><button className={tab === "discussion" ? "active" : ""} onClick={() => setTab("discussion")}><MessageCircle size={16} />追问讨论 {detail.messages.length ? <span>{Math.floor(detail.messages.length / 2)}</span> : null}</button></div>

                {tab === "answer" ? <div className="answer-view">
                  {detail.answer ? <>
                    <div className="answer-toolbar"><div><span className="answer-source"><Sparkles size={14} />{detail.answer.source === "ai" ? "AI 生成" : "手动编辑"}</span><span className="answer-updated">{relativeDate(detail.answer.createdAt)}更新</span></div><div className="answer-tools"><button title="编辑答案" onClick={() => { setEditingAnswer(!editingAnswer); setAnswerDraft(detail.answer?.content || ""); }}><Pencil size={15} />编辑</button><button title="重新生成答案" onClick={() => applyQuestionAction(`/api/questions/${detail.id}/answer`, "POST", undefined, "answer")} disabled={Boolean(busy) || !aiReady}><RotateCcw size={15} />重生成</button></div></div>
                    {editingAnswer ? <div className="answer-editor"><textarea value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} aria-label="编辑答案" /><div><button className="ghost-button" onClick={() => setEditingAnswer(false)}>取消</button><button className="small-primary" disabled={Boolean(busy)} onClick={async () => { const ok = await applyQuestionAction(`/api/questions/${detail.id}/answer`, "PATCH", { content: answerDraft }, "save-answer"); if (ok) setEditingAnswer(false); }}>保存答案</button></div></div> : <article className="markdown-body"><ReactMarkdown>{detail.answer.content}</ReactMarkdown></article>}
                  </> : editingAnswer ? <div className="answer-editor new-answer"><textarea value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} placeholder="写下你自己的面试答案..." aria-label="手动编写答案" /><div><button className="ghost-button" onClick={() => setEditingAnswer(false)}>取消</button><button className="small-primary" disabled={Boolean(busy) || !answerDraft.trim()} onClick={async () => { const ok = await applyQuestionAction(`/api/questions/${detail.id}/answer`, "PATCH", { content: answerDraft }, "save-answer"); if (ok) setEditingAnswer(false); }}>保存答案</button></div></div> : <div className="answer-empty"><div className="answer-empty-icon"><WandSparkles size={27} /></div><h3>为这道题生成一份答案</h3><p>从面试回答到原理和常见追问，整理成方便复习的结构。</p><button className="primary-button" disabled={Boolean(busy) || !aiReady} onClick={() => applyQuestionAction(`/api/questions/${detail.id}/answer`, "POST", undefined, "answer")}>{busy === "answer" ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} 生成参考答案</button><button className="manual-answer-button" onClick={() => { setAnswerDraft(""); setEditingAnswer(true); }}><Pencil size={14} />手动编写</button>{!aiReady && <small>需要先配置 AI 服务才能生成</small>}</div>}
                  <div className="notes-section"><div className="section-title"><div><StickyNote size={17} /><h3>我的薄弱点</h3><span>{detail.notes.length}</span></div></div>{detail.notes.length ? <div className="notes-list">{detail.notes.map((note) => <div className="note-item" key={note.id}><span className="note-accent" />{editingNote === note.id ? <div className="note-edit"><textarea value={noteEditText} onChange={(event) => setNoteEditText(event.target.value)} /><div><button onClick={() => setEditingNote(null)}>取消</button><button onClick={async () => { const ok = await applyQuestionAction(`/api/notes/${note.id}`, "PATCH", { content: noteEditText }, "note"); if (ok) setEditingNote(null); }}>保存</button></div></div> : <><p>{note.content}</p><div className="note-actions"><button aria-label="编辑备注" title="编辑备注" onClick={() => { setEditingNote(note.id); setNoteEditText(note.content); }}><Pencil size={14} /></button><button aria-label="删除备注" title="删除备注" onClick={() => applyQuestionAction(`/api/notes/${note.id}`, "DELETE", undefined, "note")}><X size={15} /></button></div></>}</div>)}</div> : <p className="notes-placeholder">追问时说出不理解的地方，AI 会帮你整理在这里。也可以手动添加。</p>}<div className="add-note"><input value={noteInput} onChange={(event) => setNoteInput(event.target.value)} onKeyDown={async (event) => { if (event.key === "Enter" && noteInput.trim()) { const ok = await applyQuestionAction(`/api/questions/${detail.id}/notes`, "POST", { content: noteInput }, "note"); if (ok) setNoteInput(""); } }} placeholder="手动记下一个薄弱点..." aria-label="添加薄弱点" /><button disabled={!noteInput.trim() || Boolean(busy)} onClick={async () => { const ok = await applyQuestionAction(`/api/questions/${detail.id}/notes`, "POST", { content: noteInput }, "note"); if (ok) setNoteInput(""); }} aria-label="保存薄弱点"><Plus size={18} /></button></div></div>
                </div> : <div className="discussion-view"><div className="discussion-intro"><div className="discussion-intro-icon"><MessageCircle size={20} /></div><div><strong>有哪里没弄懂？直接问。</strong><p>围绕这道题继续讨论，明确的薄弱点会自动记到备注里。</p></div></div><div className="message-list">{detail.messages.length ? detail.messages.map((message) => <div key={message.id} className={`message ${message.role}`}><div className="message-avatar">{message.role === "user" ? "我" : <Sparkles size={15} />}</div><div className="message-content"><div className="message-name">{message.role === "user" ? "我" : "知题 AI"}<span>{relativeDate(message.createdAt)}</span></div><div className="markdown-body"><ReactMarkdown>{message.content}</ReactMarkdown></div></div></div>) : <div className="chat-empty">还没有追问。可以试试：“这个原理能举个例子吗？”</div>}</div><div className="chat-composer"><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleChat(); } }} placeholder="输入你的疑问，Enter 发送 · Shift + Enter 换行" aria-label="输入追问" rows={3} /><div><span>讨论只围绕当前题目</span><button className="small-primary" onClick={handleChat} disabled={!chatInput.trim() || Boolean(busy) || !aiReady}>{busy === "chat" ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}发送</button></div></div></div>}

                <div className="review-bar"><div><Clock3 size={17} /><span>学完这道题了吗？</span></div><div><button className="ghost-button" onClick={() => applyQuestionAction(`/api/questions/${detail.id}/review`, "POST", { result: "again" }, "review")} disabled={Boolean(busy)}>还需巩固</button><button className="review-done" onClick={() => applyQuestionAction(`/api/questions/${detail.id}/review`, "POST", { result: "good" }, "review")} disabled={Boolean(busy)}><Check size={16} />已掌握</button></div></div>
              </> : <div className="detail-empty"><div><BookOpen size={28} /></div><h3>选择一道题，开始学习</h3><p>答案、追问和薄弱点都会保存在题目下。</p></div>}
            </section>
          </div>
        </div>
      </main>

      {importOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setImportOpen(false); }}><div className="import-modal" role="dialog" aria-modal="true" aria-label="批量导入题目"><div className="modal-header"><div className="modal-icon"><Plus size={21} /></div><button className="icon-button" onClick={() => setImportOpen(false)} aria-label="关闭" disabled={Boolean(busy)}><X size={20} /></button></div><h2>批量导入题目</h2><p>每行一道题。系统会自动去重并分类，新题目先进入待做。</p><textarea autoFocus value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={SAMPLE_QUESTIONS} aria-label="粘贴题目列表" /><div className="import-hint"><span>{importCount} 行内容 · 单次最多 150 道</span><button onClick={() => setImportText(SAMPLE_QUESTIONS)}>填入示例</button></div><div className="modal-footer"><button className="ghost-button" onClick={() => setImportOpen(false)} disabled={Boolean(busy)}>取消</button><button className="primary-button" onClick={handleImport} disabled={!importText.trim() || Boolean(busy)}>{busy === "import" ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{busy === "import" ? "正在导入和分类..." : "导入题库"}</button></div></div></div>}
    </div>
  );
}
