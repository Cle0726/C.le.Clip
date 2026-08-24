import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Eraser,
  FileText,
  Heart,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  captureClipboard,
  clearClipboardHistory,
  copyClipboardItem,
  deleteClipboardItem,
  isTauriRuntime,
  listClipboardItems,
  setClipboardFavorite,
  subscribeClipboardUpdates,
  writeClipboardText,
} from "./lib/clipboard";
import {
  DEFAULT_AI_SETTINGS,
  getAiSettings,
  optimizePromptWithAi,
  runAiAction,
  saveAiSettings,
} from "./lib/ai";
import {
  getAutostartEnabled,
  hideMainWindow,
  setAutostartEnabled,
} from "./lib/system";
import { optimizePrompt } from "./lib/promptOptimizer";
import type { AiActionKind, AiSettings, ClipboardItem, PromptMode } from "./types";

const HISTORY_LIMIT = 200;

const promptModes: Array<{ id: PromptMode; label: string; hint: string }> = [
  { id: "smart", label: "通用", hint: "平衡结构与表达" },
  { id: "concise", label: "精简", hint: "删去冗余" },
  { id: "detailed", label: "详细", hint: "补足上下文" },
  { id: "coding", label: "开发者", hint: "面向代码任务" },
  { id: "writing", label: "写作", hint: "改善语言表达" },
  { id: "image", label: "图像", hint: "图像生成提示" },
  { id: "analysis", label: "分析", hint: "强调推理结构" },
];

type QuickAction = {
  id: string;
  label: string;
  description: string;
  promptMode?: PromptMode;
  aiAction?: AiActionKind;
};

function looksLikeCode(value: string) {
  const text = value.trim();
  if (!text) return false;
  const codeSignals = [
    /\b(function|const|let|var|class|interface|import|export|return)\b/,
    /\b(def|from|async|await|lambda)\b/,
    /=>|::|\{[\s\S]*\}|<\/?[a-z][^>]*>/i,
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/i,
  ];
  return codeSignals.some((pattern) => pattern.test(text));
}

function buildQuickActions(text: string): QuickAction[] {
  if (!text.trim()) return [];

  if (looksLikeCode(text)) {
    return [
      { id: "optimize", label: "优化 Prompt", description: "把需求整理成更清晰的开发任务", promptMode: "smart" },
      { id: "explain-code", label: "解释代码", description: "梳理作用、关键逻辑和注意点", aiAction: "explain-code" },
      { id: "coding", label: "编程模式", description: "重写为面向实现的技术提示", promptMode: "coding" },
      { id: "translate", label: "翻译", description: "保持代码与术语结构进行翻译", aiAction: "translate" },
    ];
  }

  const actions: QuickAction[] = [
    { id: "optimize", label: "优化 Prompt", description: "把原始想法整理成可直接使用的提示", promptMode: "smart" },
    { id: "detailed", label: "补充细节", description: "补足目标、约束、输入与输出要求", promptMode: "detailed" },
  ];

  if (text.length >= 180) {
    actions.push({ id: "summarize", label: "总结内容", description: "提炼重点并压缩长文本", aiAction: "summarize" });
  } else {
    actions.push({ id: "writing", label: "润色表达", description: "改善语气、结构与可读性", promptMode: "writing" });
  }
  actions.push({ id: "translate", label: "翻译", description: "保留原意并自然转换语言", aiAction: "translate" });
  return actions;
}

function relativeTime(timestamp: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function App() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"recent" | "favorites">("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"actions" | "prompt">("actions");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mode, setMode] = useState<PromptMode>("smart");
  const [engine, setEngine] = useState<"local" | "ai">("local");
  const [optimized, setOptimized] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [autostart, setAutostart] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    endpoint: DEFAULT_AI_SETTINGS.endpoint,
    model: DEFAULT_AI_SETTINGS.model,
    apiKey: "",
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let disposed = false;
    Promise.all([listClipboardItems(HISTORY_LIMIT), getAiSettings(), getAutostartEnabled()])
      .then(([history, settings, autostartEnabled]) => {
        if (disposed) return;
        setItems(history);
        setSelectedId(history[0]?.id ?? null);
        setAiSettings(settings);
        setSettingsForm({ endpoint: settings.endpoint, model: settings.model, apiKey: "" });
        setAutostart(autostartEnabled);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;

    const ingest = (item: ClipboardItem) => {
      if (disposed) return;
      setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, HISTORY_LIMIT));
      setSelectedId((current) => current ?? item.id);
    };

    const capture = async () => {
      try {
        const item = await captureClipboard();
        if (item) ingest(item);
      } catch {
        // Clipboard can be temporarily locked by another application on Windows.
      }
    };

    if (isTauriRuntime()) {
      void subscribeClipboardUpdates(ingest).then((stop) => {
        if (disposed) stop();
        else stopListening = stop;
      });
      void capture();

      return () => {
        disposed = true;
        stopListening?.();
      };
    }

    void capture();
    const timer = window.setInterval(capture, 800);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const searchShortcut = !settingsOpen && event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (searchShortcut) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key !== "Escape") return;
      if (settingsOpen) {
        setSettingsOpen(false);
      } else {
        void hideMainWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (view === "favorites" && !item.favorite) return false;
      const haystack = item.kind === "image" ? "图片 image" : item.text ?? "";
      return !needle || haystack.toLocaleLowerCase().includes(needle);
    });
  }, [items, query, view]);

  const favoriteCount = useMemo(() => items.filter((item) => item.favorite).length, [items]);
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const selectedText = selected?.kind === "text" ? selected.text ?? "" : "";
  const quickActions = useMemo(() => buildQuickActions(selectedText), [selectedText]);

  useEffect(() => {
    setDetailsOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    setOptimizeError("");
    if (!selectedText) {
      setOptimized("");
      return;
    }
    if (engine === "local") {
      setOptimized(optimizePrompt(selectedText, mode));
    } else {
      setOptimized("");
    }
  }, [selected?.id, selectedText, mode, engine]);

  async function copyItem(item: ClipboardItem) {
    try {
      await copyClipboardItem(item);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 900);
    } catch {
      // Keep the UI responsive if the OS clipboard is temporarily unavailable.
    }
  }

  async function copyOptimized() {
    if (!optimized) return;
    await writeClipboardText(optimized);
    setCopiedId("optimized");
    window.setTimeout(() => setCopiedId(null), 900);
  }

  async function changeFavorite(item: ClipboardItem) {
    const nextFavorite = !item.favorite;
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, favorite: nextFavorite } : entry));
    try {
      await setClipboardFavorite(item.id, nextFavorite);
    } catch {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, favorite: item.favorite } : entry));
    }
  }

  async function removeItem(id: string) {
    await deleteClipboardItem(id).catch(() => undefined);
    setItems((current) => current.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function clearNonFavorites() {
    await clearClipboardHistory(true).catch(() => undefined);
    setItems((current) => current.filter((item) => item.favorite));
    setSelectedId((current) => items.some((item) => item.id === current && item.favorite) ? current : null);
  }

  async function runPromptMode(nextMode: PromptMode) {
    if (!selectedText) return;
    setMode(nextMode);
    setOptimizeError("");

    if (engine === "local") {
      setOptimized(optimizePrompt(selectedText, nextMode));
      return;
    }

    setOptimizing(true);
    try {
      setOptimized(await optimizePromptWithAi(selectedText, nextMode));
    } catch (error) {
      setOptimizeError(error instanceof Error ? error.message : String(error));
    } finally {
      setOptimizing(false);
    }
  }

  async function runQuickAction(action: QuickAction) {
    if (action.promptMode) {
      await runPromptMode(action.promptMode);
      return;
    }
    if (!selectedText || !action.aiAction) return;

    setEngine("ai");
    setOptimizeError("");
    setOptimizing(true);
    try {
      setOptimized(await runAiAction(selectedText, action.aiAction));
    } catch (error) {
      setOptimizeError(error instanceof Error ? error.message : String(error));
    } finally {
      setOptimizing(false);
    }
  }

  async function runOptimize() {
    if (!selectedText) return;
    await runPromptMode(mode);
  }

  function openSettings() {
    setSettingsMessage("");
    setSettingsForm({ endpoint: aiSettings.endpoint, model: aiSettings.model, apiKey: "" });
    setSettingsOpen(true);
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      const updated = await saveAiSettings({
        endpoint: settingsForm.endpoint,
        model: settingsForm.model,
        apiKey: settingsForm.apiKey || undefined,
      });
      setAiSettings(updated);
      setSettingsForm((current) => ({ ...current, apiKey: "" }));
      setSettingsMessage("设置已保存");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingsSaving(false);
    }
  }

  async function changeAutostart(enabled: boolean) {
    setAutostart(enabled);
    try {
      await setAutostartEnabled(enabled);
    } catch {
      setAutostart(!enabled);
    }
  }

  return (
    <div className="desktop-stage">
      <div className="app-shell">
        <aside className="sidebar glass-panel">
          <div className="brand-block" aria-label="C.le. Clip">
            <div className="brand-orb" aria-hidden="true"><span>C.</span></div>
            <div className="brand-copy">
              <div className="brand"><span className="brand-mark">C.</span><span>le.</span><small>Clip</small></div>
              <p>Clipboard → Actions → AI</p>
            </div>
          </div>

          <nav className="nav-list" aria-label="剪贴板视图">
            <button className={view === "recent" ? "active" : ""} onClick={() => setView("recent")}>
              <span className="nav-icon"><Clipboard size={18} /></span>
              <span className="nav-label">最近</span>
              <span className="nav-count">{items.length}</span>
            </button>
            <button className={view === "favorites" ? "active" : ""} onClick={() => setView("favorites")}>
              <span className="nav-icon"><Heart size={18} /></span>
              <span className="nav-label">收藏</span>
              <span className="nav-count">{favoriteCount}</span>
            </button>
          </nav>

          <div className="sidebar-bottom">
            <div className="local-card">
              <span className="sync-dot" />
              <div>
                <strong>Local First</strong>
                <span>历史默认只保存在此设备</span>
              </div>
            </div>
            <button className="settings-button" onClick={openSettings}>
              <SettingsIcon size={17} /> <span>设置</span>
            </button>
            <div className="shortcut-hint"><span>快速呼出</span><kbd>⌘ / Ctrl ⇧ V</kbd></div>
          </div>
        </aside>

        <main className="history-panel glass-panel">
          <header className="topbar">
            <div className="topbar-title">
              <span>{view === "recent" ? "剪贴板" : "收藏"}</span>
              <small>{visibleItems.length} 条</small>
            </div>
            <div className="search-box">
              <Search size={17} />
              <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文字或图片" />
              <kbd>⌘K</kbd>
              {query && <button title="清除搜索" onClick={() => setQuery("")}><X size={14} /></button>}
            </div>
          </header>

          <div className="history-toolbar">
            <button onClick={() => selected && void copyItem(selected)} disabled={!selected}>
              <Copy size={15} /> 复制当前
            </button>
            <button onClick={() => selected && void changeFavorite(selected)} disabled={!selected}>
              <Heart size={15} /> {selected?.favorite ? "取消收藏" : "收藏"}
            </button>
            <span className="toolbar-spacer" />
            <button className="quiet-danger" onClick={clearNonFavorites} disabled={!items.some((item) => !item.favorite)} title="清除所有未收藏历史">
              <Eraser size={15} /> 清空未收藏
            </button>
          </div>

          <div className="history-section-heading">
            <div>
              <strong>{query ? `“${query}”` : view === "recent" ? "最近复制" : "已收藏内容"}</strong>
              <span>{query ? `${visibleItems.length} 个结果` : "双击任意内容可立即复制"}</span>
            </div>
            <span className="storage-pill"><ShieldCheck size={12} /> 本地</span>
          </div>

          <section className="history-list">
            {visibleItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><Clipboard size={26} /></div>
                <strong>{query ? "没有找到匹配内容" : view === "favorites" ? "还没有收藏" : "还没有剪贴板记录"}</strong>
                <span>{query ? "换一个关键词试试。" : "复制文字或图片后，它会自动出现在这里。"}</span>
              </div>
            ) : visibleItems.map((item) => (
              <article
                key={item.id}
                className={`clip-card ${selected?.id === item.id ? "selected" : ""}`}
                onClick={() => setSelectedId(item.id)}
                onDoubleClick={() => void copyItem(item)}
              >
                <div className={`clip-type ${item.kind === "image" ? "image-type" : "text-type"}`}>
                  {item.kind === "image" ? (
                    item.imageDataUrl
                      ? <img className="clip-image" src={item.imageDataUrl} alt="剪贴板图片" />
                      : <ImageIcon size={22} />
                  ) : <FileText size={21} />}
                </div>

                <div className="clip-body">
                  {item.kind === "image" ? <p className="image-caption">剪贴板图片</p> : <p>{item.text}</p>}
                  <span>
                    {relativeTime(item.createdAt)}
                    <i>·</i>
                    {item.kind === "image" ? "图片" : `${item.text?.length ?? 0} 字`}
                    {item.favorite && <><i>·</i><b>已收藏</b></>}
                  </span>
                </div>

                <div className="clip-actions">
                  <button title="复制" onClick={(event) => { event.stopPropagation(); void copyItem(item); }}>
                    {copiedId === item.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                  <button title="收藏" className={item.favorite ? "is-favorite" : ""} onClick={(event) => { event.stopPropagation(); void changeFavorite(item); }}>
                    <Heart size={15} fill={item.favorite ? "currentColor" : "none"} />
                  </button>
                  <button title="删除" onClick={(event) => { event.stopPropagation(); void removeItem(item.id); }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </section>

          <footer className="history-footer">
            <span>{view === "favorites" ? `${favoriteCount} 条收藏` : `${items.length} 条历史`}</span>
            <span>最多保留 {HISTORY_LIMIT} 条未收藏记录</span>
          </footer>
        </main>

        <aside className="workspace-panel glass-panel">
          <header className="workspace-header">
            <div>
              <span className="workspace-kicker">C.le. Actions</span>
              <h2>从复制到下一步</h2>
            </div>
            <div className="workspace-tabs" role="tablist" aria-label="C.le. Actions 工作区">
              <button className={workspaceView === "actions" ? "active" : ""} onClick={() => setWorkspaceView("actions")}><Zap size={14} /> 快捷动作</button>
              <button className={workspaceView === "prompt" ? "active" : ""} onClick={() => setWorkspaceView("prompt")}><Sparkles size={14} /> Prompt Lab</button>
            </div>
          </header>

          {!selected ? (
            <div className="workspace-empty">
              <div className="empty-icon"><Sparkles size={25} /></div>
              <strong>选择一条剪贴板内容</strong>
              <span>右侧会显示快捷动作、Prompt 优化和处理结果。</span>
            </div>
          ) : (
            <div className="workspace-scroll">
              <section className="selection-card">
                <div className="selection-topline">
                  <div className="selection-type">
                    {selected.kind === "image" ? <ImageIcon size={14} /> : <FileText size={14} />}
                    <span>{selected.kind === "image" ? "图片" : "文本"}</span>
                  </div>
                  <div className="selection-actions">
                    <button title="复制原始内容" onClick={() => void copyItem(selected)}>{copiedId === selected.id ? <Check size={14} /> : <Copy size={14} />}</button>
                    <button title="收藏" className={selected.favorite ? "is-favorite" : ""} onClick={() => void changeFavorite(selected)}><Heart size={14} fill={selected.favorite ? "currentColor" : "none"} /></button>
                  </div>
                </div>

                {selected.kind === "image" ? (
                  <div className="selection-image-wrap">
                    {selected.imageDataUrl ? <img src={selected.imageDataUrl} alt="当前选中的剪贴板图片" /> : <ImageIcon size={30} />}
                  </div>
                ) : (
                  <p className="selection-text">{selectedText}</p>
                )}

                <button className="details-toggle" onClick={() => setDetailsOpen((current) => !current)}>
                  <Info size={13} /> 详情 {detailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {detailsOpen && (
                  <div className="selection-details">
                    <span><b>保存时间</b>{new Date(selected.createdAt).toLocaleString()}</span>
                    <span><b>类型</b>{selected.kind === "image" ? "图片" : "纯文本"}</span>
                    <span><b>大小</b>{selected.kind === "image" ? "图像内容" : `${selectedText.length} 字`}</span>
                  </div>
                )}
              </section>

              {selected.kind === "image" ? (
                <section className="workspace-message">
                  <ImageIcon size={22} />
                  <div><strong>图片已经进入历史</strong><span>当前版本可以预览、收藏和重新复制；图片 AI 动作将在后续版本加入。</span></div>
                </section>
              ) : workspaceView === "actions" ? (
                <>
                  <section className="workspace-section">
                    <div className="section-heading-row">
                      <div><span className="section-eyebrow">SMART ACTIONS</span><h3>下一步做什么？</h3></div>
                      <span className="engine-badge">{engine === "local" ? "本地" : "AI"}</span>
                    </div>
                    <div className="action-grid action-grid-rich">
                      {quickActions.map((action, index) => (
                        <button key={action.id} className={index === 0 ? "featured" : ""} disabled={optimizing} onClick={() => void runQuickAction(action)}>
                          <span className="action-icon">{index === 0 ? <Sparkles size={16} /> : <Zap size={15} />}</span>
                          <span><strong>{action.label}</strong><small>{action.description}</small></span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="engine-inline-card">
                    <div><strong>处理引擎</strong><span>本地模板默认不联网；AI 仅在主动执行时使用。</span></div>
                    <div className="engine-switch">
                      <button className={engine === "local" ? "active" : ""} onClick={() => setEngine("local")}>本地</button>
                      <button className={engine === "ai" ? "active" : ""} onClick={() => setEngine("ai")}>AI Provider</button>
                    </div>
                  </section>
                </>
              ) : (
                <section className="workspace-section prompt-lab-section">
                  <div className="section-heading-row">
                    <div><span className="section-eyebrow">PROMPT LAB</span><h3>重新组织这段内容</h3></div>
                  </div>

                  <div className="engine-row">
                    <span className="section-label">处理引擎</span>
                    <div className="engine-switch wide">
                      <button className={engine === "local" ? "active" : ""} onClick={() => setEngine("local")}>本地优化</button>
                      <button className={engine === "ai" ? "active" : ""} onClick={() => setEngine("ai")}>AI Provider</button>
                    </div>
                  </div>

                  {engine === "ai" && (
                    <div className="provider-status">
                      <ShieldCheck size={13} />
                      <span>{aiSettings.model} · {aiSettings.hasApiKey ? "API Key 已安全保存" : "未保存 API Key"}</span>
                    </div>
                  )}

                  <span className="section-label">Prompt 模式</span>
                  <div className="mode-grid mode-grid-rich">
                    {promptModes.map((option) => (
                      <button key={option.id} className={mode === option.id ? "active" : ""} onClick={() => setMode(option.id)}>
                        <strong>{option.label}</strong><small>{option.hint}</small>
                      </button>
                    ))}
                  </div>

                  <button className="generate-action" disabled={optimizing} onClick={() => void runOptimize()}>
                    {optimizing ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                    {engine === "ai" ? "生成优化结果" : "应用本地模板"}
                  </button>
                </section>
              )}

              {selectedText && (
                <section className="result-section">
                  <div className="result-header">
                    <div><span className="section-eyebrow">OUTPUT</span><h3>处理结果</h3></div>
                    <span>{optimized.length} 字</span>
                  </div>
                  <div className="result-box-wrap">
                    {optimizing && <div className="result-loading"><LoaderCircle size={18} className="spin" /> C.le. 正在处理…</div>}
                    <textarea
                      value={optimized}
                      onChange={(event) => setOptimized(event.target.value)}
                      spellCheck={false}
                      placeholder={engine === "ai" ? "执行快捷动作或在 Prompt Lab 中生成结果" : "本地优化结果会显示在这里"}
                    />
                  </div>
                  {optimizeError && <p className="inline-error">{optimizeError}</p>}
                  <div className="result-actions">
                    <button className="secondary-result-action" onClick={() => setWorkspaceView("prompt")}><Sparkles size={15} /> 继续调整</button>
                    <button className="primary-action" disabled={!optimized || optimizing} onClick={() => void copyOptimized()}>
                      {copiedId === "optimized" ? <Check size={16} /> : <Copy size={16} />}
                      {copiedId === "optimized" ? "已复制" : "复制结果"}
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}
        </aside>

        {settingsOpen && (
          <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
            <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
              <header>
                <div><span className="settings-kicker">C.le. Clip</span><h2>设置</h2><p>桌面行为、隐私与 AI Provider</p></div>
                <button className="modal-close" onClick={() => setSettingsOpen(false)}><X size={18} /></button>
              </header>

              <div className="settings-grid">
                <section className="settings-section">
                  <div className="settings-section-title"><SettingsIcon size={16} /><div><h3>系统</h3><span>桌面启动与窗口行为</span></div></div>
                  <label className="switch-row">
                    <div><strong>开机启动</strong><span>登录 Windows 或 macOS 后自动启动 C.le. Clip</span></div>
                    <input type="checkbox" checked={autostart} onChange={(event) => void changeAutostart(event.target.checked)} />
                  </label>
                  <div className="settings-note">关闭主窗口或按 Esc 只会隐藏应用，可从系统托盘重新打开。</div>
                </section>

                <section className="settings-section">
                  <div className="settings-section-title"><ShieldCheck size={16} /><div><h3>AI Provider</h3><span>OpenAI-compatible 服务</span></div></div>
                  <label className="field-label">Endpoint</label>
                  <input className="settings-input" value={settingsForm.endpoint} onChange={(event) => setSettingsForm((current) => ({ ...current, endpoint: event.target.value }))} />
                  <label className="field-label">模型</label>
                  <input className="settings-input" value={settingsForm.model} onChange={(event) => setSettingsForm((current) => ({ ...current, model: event.target.value }))} placeholder="模型名称" />
                  <label className="field-label">API Key</label>
                  <input className="settings-input" type="password" value={settingsForm.apiKey} onChange={(event) => setSettingsForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={aiSettings.hasApiKey ? "已保存；留空保持不变" : "可留空用于本地兼容服务"} />
                  <div className="settings-note with-icon"><ShieldCheck size={14} />API Key 由系统凭据库保存，不写入剪贴板数据库。</div>
                </section>
              </div>

              <footer className="settings-footer">
                <span className="settings-message">{settingsMessage}</span>
                <button className="secondary-action" onClick={() => setSettingsOpen(false)}>取消</button>
                <button className="save-action" disabled={settingsSaving} onClick={() => void saveSettings()}>
                  {settingsSaving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} 保存
                </button>
              </footer>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
