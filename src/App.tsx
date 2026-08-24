import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Eraser,
  FileText,
  Heart,
  Image as ImageIcon,
  Languages,
  List,
  LoaderCircle,
  MoreHorizontal,
  Pin,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
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

type ClipFilter = "all" | "text" | "image" | "code";
type HistoryView = "recent" | "favorites";

type ActionItem = {
  id: "copy" | "optimize" | "coding" | "translate" | "summarize" | "explain-code";
  label: string;
  description: string;
  shortcut?: string;
  promptMode?: PromptMode;
  aiAction?: AiActionKind;
};

const promptModes: Array<{ id: PromptMode; label: string }> = [
  { id: "smart", label: "通用" },
  { id: "concise", label: "精简" },
  { id: "detailed", label: "详细" },
  { id: "coding", label: "开发者" },
  { id: "writing", label: "写作" },
  { id: "image", label: "图像" },
  { id: "analysis", label: "分析" },
];

function looksLikeCode(value: string) {
  const text = value.trim();
  if (!text) return false;
  return [
    /\b(function|const|let|var|class|interface|import|export|return)\b/,
    /\b(def|from|async|await|lambda)\b/,
    /=>|::|\{[\s\S]*\}|<\/?[a-z][^>]*>/i,
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/i,
    /^#!\/.*\b(bash|sh|zsh|python|node)\b/m,
  ].some((pattern) => pattern.test(text));
}

function relativeTime(timestamp: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function actionIcon(action: ActionItem["id"]) {
  if (action === "copy") return <Copy size={20} />;
  if (action === "optimize") return <Sparkles size={20} />;
  if (action === "coding") return <Code2 size={20} />;
  if (action === "translate") return <Languages size={20} />;
  if (action === "explain-code") return <Braces size={20} />;
  return <List size={20} />;
}

export default function App() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<HistoryView>("recent");
  const [filter, setFilter] = useState<ClipFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [mode, setMode] = useState<PromptMode>("smart");
  const [engine, setEngine] = useState<"local" | "ai">("local");
  const [optimized, setOptimized] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
  const aiRequestRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    void Promise.allSettled([
      listClipboardItems(HISTORY_LIMIT),
      getAiSettings(),
      getAutostartEnabled(),
    ]).then(([historyResult, aiResult, autostartResult]) => {
      if (disposed) return;

      if (historyResult.status === "fulfilled") {
        setItems(historyResult.value);
        setSelectedId(historyResult.value[0]?.id ?? null);
      }

      if (aiResult.status === "fulfilled") {
        setAiSettings(aiResult.value);
        setSettingsForm({
          endpoint: aiResult.value.endpoint,
          model: aiResult.value.model,
          apiKey: "",
        });
      }

      if (autostartResult.status === "fulfilled") {
        setAutostart(autostartResult.value);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;

    const ingest = (item: ClipboardItem) => {
      if (disposed) return;
      setItems((current) => [
        item,
        ...current.filter((entry) => entry.id !== item.id),
      ].slice(0, HISTORY_LIMIT));
      setSelectedId((current) => current ?? item.id);
    };

    const capture = async () => {
      try {
        const item = await captureClipboard();
        if (item) ingest(item);
      } catch {
        // The OS clipboard can be temporarily locked by another application.
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
      const searchShortcut = !settingsOpen
        && event.key.toLowerCase() === "k"
        && (event.metaKey || event.ctrlKey);

      if (searchShortcut) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key !== "Escape") return;
      if (settingsOpen) {
        setSettingsOpen(false);
      } else if (menuOpenId) {
        setMenuOpenId(null);
      } else {
        void hideMainWindow();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpenId, settingsOpen]);

  const baseItems = useMemo(
    () => view === "favorites" ? items.filter((item) => item.favorite) : items,
    [items, view],
  );

  const counts = useMemo(() => {
    let text = 0;
    let image = 0;
    let code = 0;

    for (const item of baseItems) {
      if (item.kind === "image") {
        image += 1;
      } else if (looksLikeCode(item.text ?? "")) {
        code += 1;
      } else {
        text += 1;
      }
    }

    return { all: baseItems.length, text, image, code };
  }, [baseItems]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();

    return baseItems.filter((item) => {
      const text = item.text ?? "";
      const isCode = item.kind === "text" && looksLikeCode(text);

      if (filter === "image" && item.kind !== "image") return false;
      if (filter === "code" && !isCode) return false;
      if (filter === "text" && (item.kind !== "text" || isCode)) return false;

      if (!needle) return true;
      const haystack = item.kind === "image" ? "图片 image" : text;
      return haystack.toLocaleLowerCase().includes(needle);
    });
  }, [baseItems, filter, query]);

  const selected = visibleItems.find((item) => item.id === selectedId)
    ?? visibleItems[0]
    ?? null;
  const selectedText = selected?.kind === "text" ? selected.text ?? "" : "";

  useEffect(() => {
    aiRequestRef.current += 1;
    setOptimizing(false);
    setOptimizeError("");
    setOptimized("");
    setPromptOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [selected, selectedId]);

  const actions = useMemo<ActionItem[]>(() => {
    if (!selectedText) return [];
    const code = looksLikeCode(selectedText);

    return [
      {
        id: "copy",
        label: "复制当前",
        description: "将内容重新写入系统剪贴板",
      },
      {
        id: "optimize",
        label: "优化 Prompt",
        description: "优化为更清晰、更有效的 Prompt",
        shortcut: "⌘ 1",
        promptMode: "smart",
      },
      {
        id: "coding",
        label: "编程模式",
        description: "整理为开发任务或代码需求",
        shortcut: "⌘ 2",
        promptMode: "coding",
      },
      {
        id: "translate",
        label: "翻译",
        description: "在中文与英文之间自然转换",
        shortcut: "⌘ 3",
        aiAction: "translate",
      },
      code
        ? {
            id: "explain-code",
            label: "解释代码",
            description: "解释代码的功能、流程和风险",
            shortcut: "⌘ 4",
            aiAction: "explain-code",
          }
        : {
            id: "summarize",
            label: "总结内容",
            description: "提炼重点、约束与行动项",
            shortcut: "⌘ 4",
            aiAction: "summarize",
          },
    ];
  }, [selectedText]);

  async function copyItem(item: ClipboardItem) {
    try {
      await copyClipboardItem(item);
      setCopiedId(item.id);
      window.setTimeout(() => {
        setCopiedId((current) => current === item.id ? null : current);
      }, 900);
    } catch {
      // Keep the UI responsive if the clipboard is temporarily unavailable.
    }
  }

  async function copyOptimized() {
    if (!optimized) return;
    try {
      await writeClipboardText(optimized);
      setCopiedId("optimized");
      window.setTimeout(() => {
        setCopiedId((current) => current === "optimized" ? null : current);
      }, 900);
    } catch {
      setOptimizeError("无法写入系统剪贴板");
    }
  }

  async function changeFavorite(item: ClipboardItem) {
    const nextFavorite = !item.favorite;
    setItems((current) => current.map((entry) => (
      entry.id === item.id ? { ...entry, favorite: nextFavorite } : entry
    )));

    try {
      await setClipboardFavorite(item.id, nextFavorite);
    } catch {
      setItems((current) => current.map((entry) => (
        entry.id === item.id ? { ...entry, favorite: item.favorite } : entry
      )));
    }
  }

  async function removeItem(id: string) {
    const snapshot = items;
    setItems((current) => current.filter((item) => item.id !== id));
    setMenuOpenId(null);

    try {
      await deleteClipboardItem(id);
      if (selectedId === id) setSelectedId(null);
    } catch {
      setItems(snapshot);
    }
  }

  async function clearNonFavorites() {
    const snapshot = items;
    setItems((current) => current.filter((item) => item.favorite));

    try {
      await clearClipboardHistory(true);
      setSelectedId((current) => (
        snapshot.some((item) => item.id === current && item.favorite) ? current : null
      ));
    } catch {
      setItems(snapshot);
    }
  }

  async function runPromptMode(nextMode: PromptMode) {
    if (!selectedText) return;
    setMode(nextMode);
    setPromptOpen(true);
    setOptimizeError("");

    if (engine === "local") {
      setOptimized(optimizePrompt(selectedText, nextMode));
      return;
    }

    const requestId = ++aiRequestRef.current;
    setOptimizing(true);
    try {
      const result = await optimizePromptWithAi(selectedText, nextMode);
      if (aiRequestRef.current === requestId) setOptimized(result);
    } catch (error) {
      if (aiRequestRef.current === requestId) {
        setOptimizeError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (aiRequestRef.current === requestId) setOptimizing(false);
    }
  }

  async function runQuickAction(action: ActionItem) {
    if (!selected) return;

    if (action.id === "copy") {
      await copyItem(selected);
      return;
    }

    if (action.promptMode) {
      await runPromptMode(action.promptMode);
      return;
    }

    if (!selectedText || !action.aiAction) return;

    setEngine("ai");
    setPromptOpen(true);
    setOptimizeError("");
    const requestId = ++aiRequestRef.current;
    setOptimizing(true);

    try {
      const result = await runAiAction(selectedText, action.aiAction);
      if (aiRequestRef.current === requestId) setOptimized(result);
    } catch (error) {
      if (aiRequestRef.current === requestId) {
        setOptimizeError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (aiRequestRef.current === requestId) setOptimizing(false);
    }
  }

  function openSettings() {
    setSettingsMessage("");
    setSettingsForm({
      endpoint: aiSettings.endpoint,
      model: aiSettings.model,
      apiKey: "",
    });
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
    const previous = autostart;
    setAutostart(enabled);
    try {
      await setAutostartEnabled(enabled);
    } catch {
      setAutostart(previous);
    }
  }

  function selectFilter(next: ClipFilter) {
    setFilter(next);
    setMenuOpenId(null);
  }

  return (
    <div className="reference-stage" onMouseDown={() => setMenuOpenId(null)}>
      <div className="reference-window">
        <header className="window-header" data-tauri-drag-region>
          <div className="reference-brand" data-tauri-drag-region>
            <div className="reference-brand-mark" aria-hidden="true"><span>C</span></div>
            <strong>C.le.</strong>
          </div>

          <div className="window-controls">
            <button
              className={view === "favorites" ? "active" : ""}
              title="收藏内容"
              onClick={() => setView((current) => current === "favorites" ? "recent" : "favorites")}
            >
              <Pin size={18} />
            </button>
            <button
              className={view === "recent" && filter === "all" && !query ? "active" : ""}
              title="全部历史"
              onClick={() => {
                setView("recent");
                setFilter("all");
                setQuery("");
              }}
            >
              <Clock size={18} />
            </button>
            <button title="设置" onClick={openSettings}><MoreHorizontal size={19} /></button>
            <button title="隐藏 C.le. Clip" onClick={() => void hideMainWindow()}><X size={19} /></button>
          </div>
        </header>

        <div className="reference-content">
          <section className="reference-history">
            <div className="reference-search">
              <Search size={19} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索剪贴板内容…"
              />
              <kbd>⌘ K</kbd>
            </div>

            <div className="reference-filters" aria-label="剪贴板类型筛选">
              <button className={filter === "all" ? "active" : ""} onClick={() => selectFilter("all")}>
                全部 <b>{counts.all}</b>
              </button>
              <button className={filter === "text" ? "active" : ""} onClick={() => selectFilter("text")}>
                文本 <b>{counts.text}</b>
              </button>
              <button className={filter === "image" ? "active" : ""} onClick={() => selectFilter("image")}>
                图片 <b>{counts.image}</b>
              </button>
              <button className={filter === "code" ? "active" : ""} onClick={() => selectFilter("code")}>
                代码 <b>{counts.code}</b>
              </button>
              <button
                className="filter-next"
                title={view === "favorites" ? "返回最近" : "查看收藏"}
                onClick={() => setView((current) => current === "favorites" ? "recent" : "favorites")}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="reference-list">
              {visibleItems.length === 0 ? (
                <div className="reference-empty">
                  <FileText size={30} />
                  <strong>{query ? "没有找到匹配内容" : view === "favorites" ? "还没有收藏内容" : "还没有剪贴板记录"}</strong>
                  <span>{query ? "换一个关键词试试。" : "复制文字、代码或图片后会自动出现在这里。"}</span>
                </div>
              ) : visibleItems.map((item) => {
                const code = item.kind === "text" && looksLikeCode(item.text ?? "");
                const isSelected = selected?.id === item.id;

                return (
                  <article
                    key={item.id}
                    className={`reference-clip ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                    onDoubleClick={() => void copyItem(item)}
                  >
                    {isSelected && <span className="selection-dot" />}
                    <div className={`clip-thumbnail ${item.kind === "image" ? "image" : code ? "code" : "text"}`}>
                      {item.kind === "image" ? (
                        item.imageDataUrl
                          ? <img src={item.imageDataUrl} alt="剪贴板图片" />
                          : <ImageIcon size={24} />
                      ) : code ? <Code2 size={24} /> : <span>T</span>}
                    </div>

                    <div className="clip-copy">
                      {item.kind === "image" ? (
                        <>
                          <strong>剪贴板图片</strong>
                          <p>图片内容 · 双击可重新复制</p>
                        </>
                      ) : (
                        <p className={code ? "code-preview" : ""}>{item.text}</p>
                      )}
                      <small>{relativeTime(item.createdAt)}{item.favorite ? " · 已收藏" : ""}</small>
                    </div>

                    <div className="clip-card-actions">
                      {item.favorite && <Star className="favorite-star" size={15} fill="currentColor" />}
                      <button
                        title="更多"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuOpenId((current) => current === item.id ? null : item.id);
                        }}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                    </div>

                    {menuOpenId === item.id && (
                      <div className="clip-menu" onMouseDown={(event) => event.stopPropagation()}>
                        <button onClick={(event) => { event.stopPropagation(); void copyItem(item); }}>
                          <Copy size={14} /> 复制
                        </button>
                        <button onClick={(event) => { event.stopPropagation(); void changeFavorite(item); setMenuOpenId(null); }}>
                          <Heart size={14} /> {item.favorite ? "取消收藏" : "收藏"}
                        </button>
                        <button className="danger" onClick={(event) => { event.stopPropagation(); void removeItem(item.id); }}>
                          <Trash2 size={14} /> 删除
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <button className="list-more" title="滚动查看更多"><ChevronDown size={21} /></button>
          </section>

          <section className="reference-detail">
            {!selected ? (
              <div className="detail-empty">
                <Sparkles size={30} />
                <strong>选择一条剪贴板内容</strong>
                <span>这里会显示内容详情与 C.le. Actions。</span>
              </div>
            ) : (
              <>
                <div className="selected-meta">
                  <span>{selected.kind === "image" ? "图片" : looksLikeCode(selectedText) ? "代码" : "文本"}</span>
                  <div>
                    {selected.kind === "text" && <span>{selectedText.length} 字符</span>}
                    <button title="复制当前内容" onClick={() => void copyItem(selected)}>
                      {copiedId === selected.id ? <Check size={17} /> : <Copy size={17} />}
                    </button>
                  </div>
                </div>

                <div className="selected-preview">
                  {selected.kind === "image" ? (
                    selected.imageDataUrl
                      ? <img src={selected.imageDataUrl} alt="当前选中的剪贴板图片" />
                      : <ImageIcon size={36} />
                  ) : (
                    <p className={looksLikeCode(selectedText) ? "code-preview" : ""}>{selectedText}</p>
                  )}
                </div>

                {selected.kind === "image" ? (
                  <div className="image-action-stack">
                    <button className="reference-action" onClick={() => void copyItem(selected)}>
                      <span className="action-symbol blue"><Copy size={20} /></span>
                      <span className="action-copy"><strong>复制图片</strong><small>重新写入系统剪贴板</small></span>
                    </button>
                    <button className="reference-action" onClick={() => void changeFavorite(selected)}>
                      <span className="action-symbol gold"><Star size={20} /></span>
                      <span className="action-copy"><strong>{selected.favorite ? "取消收藏" : "收藏图片"}</strong><small>保存到收藏内容中</small></span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="reference-actions">
                      {actions.map((action) => (
                        <button
                          key={action.id}
                          className={`reference-action ${action.id === "optimize" ? "accent-action" : ""}`}
                          disabled={optimizing}
                          onClick={() => void runQuickAction(action)}
                        >
                          <span className={`action-symbol ${action.id}`}>{actionIcon(action.id)}</span>
                          <span className="action-copy">
                            <strong>{action.label}</strong>
                            <small>{action.description}</small>
                          </span>
                          {action.shortcut
                            ? <kbd>{action.shortcut}</kbd>
                            : action.id === "copy" ? <span className="return-arrow">↩</span> : null}
                        </button>
                      ))}
                    </div>

                    {promptOpen && (
                      <div className="prompt-drawer">
                        <div className="prompt-drawer-head">
                          <div>
                            <strong>Prompt Lab</strong>
                            <span>选择处理方式后重新生成</span>
                          </div>
                          <button title="关闭 Prompt Lab" onClick={() => setPromptOpen(false)}><X size={16} /></button>
                        </div>

                        <div className="engine-switch">
                          <button
                            className={engine === "local" ? "active" : ""}
                            onClick={() => {
                              aiRequestRef.current += 1;
                              setOptimizing(false);
                              setEngine("local");
                            }}
                          >本地优化</button>
                          <button
                            className={engine === "ai" ? "active" : ""}
                            onClick={() => setEngine("ai")}
                          >AI Provider</button>
                        </div>

                        {engine === "ai" && (
                          <div className="provider-note">
                            <ShieldCheck size={13} />
                            <span>{aiSettings.model} · {aiSettings.hasApiKey ? "API Key 已保存" : "未保存 API Key"}</span>
                          </div>
                        )}

                        <div className="mode-row">
                          {promptModes.map((option) => (
                            <button
                              key={option.id}
                              className={mode === option.id ? "active" : ""}
                              onClick={() => setMode(option.id)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>

                        <button className="regenerate" disabled={optimizing} onClick={() => void runPromptMode(mode)}>
                          {optimizing ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
                          {engine === "ai" ? "重新生成" : "应用本地模板"}
                        </button>

                        <div className="result-editor">
                          {optimizing && <div className="result-loading"><LoaderCircle size={18} className="spin" /> C.le. 正在处理…</div>}
                          <textarea
                            value={optimized}
                            onChange={(event) => setOptimized(event.target.value)}
                            spellCheck={false}
                            placeholder="处理结果会显示在这里"
                          />
                          <div className="result-footer">
                            <span>{optimized.length} 字</span>
                            <button disabled={!optimized || optimizing} onClick={() => void copyOptimized()}>
                              {copiedId === "optimized" ? <Check size={15} /> : <Copy size={15} />}
                              {copiedId === "optimized" ? "已复制" : "复制结果"}
                            </button>
                          </div>
                        </div>
                        {optimizeError && <p className="inline-error">{optimizeError}</p>}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="reference-footer">
          <div className="shortcut-keys"><kbd>⌘ / Ctrl</kbd><kbd>⇧</kbd><kbd>V</kbd></div>
          <span>快速唤起 C.le. Clip</span>
          <Sparkles size={14} />
          <span className="footer-spacer" />
          {items.some((item) => !item.favorite) && (
            <button title="清空未收藏历史" onClick={() => void clearNonFavorites()}>
              <Eraser size={15} /> 清空未收藏
            </button>
          )}
        </footer>

        {settingsOpen && (
          <div className="settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
            <section className="reference-settings" onMouseDown={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <span>C.le. Clip</span>
                  <h2>设置</h2>
                </div>
                <button title="关闭" onClick={() => setSettingsOpen(false)}><X size={19} /></button>
              </header>

              <div className="settings-card">
                <div className="settings-card-title"><SettingsIcon size={17} /><strong>系统</strong></div>
                <label className="settings-switch-row">
                  <div><strong>开机启动</strong><span>登录系统后自动启动 C.le. Clip</span></div>
                  <input type="checkbox" checked={autostart} onChange={(event) => void changeAutostart(event.target.checked)} />
                </label>
                <div className="settings-note">关闭窗口时应用会隐藏到系统托盘，不会退出程序。</div>
              </div>

              <div className="settings-card">
                <div className="settings-card-title"><ShieldCheck size={17} /><strong>AI Provider</strong></div>
                <label className="field-row">
                  <span>Endpoint</span>
                  <input value={settingsForm.endpoint} onChange={(event) => setSettingsForm((current) => ({ ...current, endpoint: event.target.value }))} />
                </label>
                <label className="field-row">
                  <span>模型</span>
                  <input value={settingsForm.model} onChange={(event) => setSettingsForm((current) => ({ ...current, model: event.target.value }))} />
                </label>
                <label className="field-row">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={settingsForm.apiKey}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder={aiSettings.hasApiKey ? "已保存；留空保持不变" : "可留空用于本地兼容服务"}
                  />
                </label>
                <div className="settings-note secure"><ShieldCheck size={14} />API Key 由系统凭据库保存，不写入剪贴板数据库。</div>
              </div>

              <footer>
                <span>{settingsMessage}</span>
                <button className="cancel" onClick={() => setSettingsOpen(false)}>取消</button>
                <button className="save" disabled={settingsSaving} onClick={() => void saveSettings()}>
                  {settingsSaving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                  保存
                </button>
              </footer>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
