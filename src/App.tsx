import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Copy,
  Eraser,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  captureClipboard,
  clearClipboardHistory,
  copyClipboardItem,
  deleteClipboardItem,
  listClipboardItems,
  setClipboardFavorite,
  writeClipboardText,
} from "./lib/clipboard";
import {
  DEFAULT_AI_SETTINGS,
  getAiSettings,
  optimizePromptWithAi,
  saveAiSettings,
} from "./lib/ai";
import {
  getAutostartEnabled,
  hideMainWindow,
  setAutostartEnabled,
} from "./lib/system";
import { optimizePrompt } from "./lib/promptOptimizer";
import type { AiSettings, ClipboardItem, PromptMode } from "./types";

const HISTORY_LIMIT = 200;

const promptModes: Array<{ id: PromptMode; label: string }> = [
  { id: "smart", label: "智能" },
  { id: "concise", label: "简洁" },
  { id: "detailed", label: "详细" },
  { id: "coding", label: "编程" },
  { id: "writing", label: "写作" },
  { id: "image", label: "图像" },
  { id: "analysis", label: "分析" },
];

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
    const capture = async () => {
      try {
        const item = await captureClipboard();
        if (disposed || !item) return;
        setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, HISTORY_LIMIT));
        setSelectedId((current) => current ?? item.id);
      } catch {
        // Clipboard can be temporarily locked by another application on Windows.
      }
    };
    void capture();
    const timer = window.setInterval(capture, 800);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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

  const selected = items.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const selectedText = selected?.kind === "text" ? selected.text ?? "" : "";

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

  async function runOptimize() {
    if (!selectedText) return;
    setOptimizeError("");
    if (engine === "local") {
      setOptimized(optimizePrompt(selectedText, mode));
      return;
    }

    setOptimizing(true);
    try {
      setOptimized(await optimizePromptWithAi(selectedText, mode));
    } catch (error) {
      setOptimizeError(error instanceof Error ? error.message : String(error));
    } finally {
      setOptimizing(false);
    }
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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="C.le. Clip">
          <span className="brand-mark">C.</span><span>le.</span>
          <small>Clip</small>
        </div>

        <nav className="nav-list">
          <button className={view === "recent" ? "active" : ""} onClick={() => setView("recent")}>
            <Clipboard size={17} /> 最近
          </button>
          <button className={view === "favorites" ? "active" : ""} onClick={() => setView("favorites")}>
            <Heart size={17} /> 收藏
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="shortcut-hint">
            <span>快速呼出</span>
            <kbd>⌘/Ctrl ⇧ V</kbd>
          </div>
          <button className="settings-button" onClick={openSettings}>
            <SettingsIcon size={16} /> 设置
          </button>
        </div>
      </aside>

      <main className="history-panel">
        <header className="topbar">
          <div>
            <h1>{view === "recent" ? "剪贴板" : "收藏"}</h1>
            <p>{visibleItems.length} 条内容 · 本地保存</p>
          </div>
          <div className="topbar-actions">
            {items.some((item) => !item.favorite) && (
              <button className="icon-action" title="清除未收藏记录" onClick={clearNonFavorites}>
                <Eraser size={16} />
              </button>
            )}
            <div className="search-box">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索剪贴板…" />
              {query && <button onClick={() => setQuery("")}><X size={15} /></button>}
            </div>
          </div>
        </header>

        <section className="history-list">
          {visibleItems.length === 0 ? (
            <div className="empty-state">
              <Clipboard size={28} />
              <strong>还没有内容</strong>
              <span>复制文字或图片后会自动出现在这里。</span>
            </div>
          ) : visibleItems.map((item) => (
            <article
              key={item.id}
              className={`clip-card ${selected?.id === item.id ? "selected" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              <div className="clip-body">
                {item.kind === "image" ? (
                  <div className="image-preview-wrap">
                    {item.imageDataUrl ? <img className="clip-image" src={item.imageDataUrl} alt="剪贴板图片" /> : <ImageIcon size={22} />}
                  </div>
                ) : (
                  <p>{item.text}</p>
                )}
                <span>{item.kind === "image" ? "图片 · " : ""}{relativeTime(item.createdAt)}</span>
              </div>
              <div className="clip-actions">
                <button title="复制" onClick={(event) => { event.stopPropagation(); void copyItem(item); }}>
                  {copiedId === item.id ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button title="收藏" className={item.favorite ? "is-favorite" : ""} onClick={(event) => { event.stopPropagation(); void changeFavorite(item); }}>
                  <Heart size={16} fill={item.favorite ? "currentColor" : "none"} />
                </button>
                <button title="删除" onClick={(event) => { event.stopPropagation(); void removeItem(item.id); }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>

      <aside className="prompt-panel">
        <div className="prompt-heading">
          <div className="prompt-icon"><Sparkles size={18} /></div>
          <div>
            <h2>Prompt Lab</h2>
            <p>本地模板 + 可选 AI Provider</p>
          </div>
        </div>

        {selected?.kind === "image" ? (
          <div className="prompt-empty">
            <ImageIcon size={25} />
            <strong>当前选择的是图片</strong>
            <span>图片历史已经支持；Prompt Lab 目前先处理文字内容。</span>
          </div>
        ) : selectedText ? (
          <>
            <label className="section-label">原始内容</label>
            <div className="source-preview">{selectedText}</div>

            <div className="engine-switch">
              <button className={engine === "local" ? "active" : ""} onClick={() => setEngine("local")}>本地优化</button>
              <button className={engine === "ai" ? "active" : ""} onClick={() => setEngine("ai")}>AI 优化</button>
            </div>

            <label className="section-label">优化模式</label>
            <div className="mode-grid">
              {promptModes.map((option) => (
                <button key={option.id} className={mode === option.id ? "active" : ""} onClick={() => setMode(option.id)}>
                  {option.label}
                </button>
              ))}
            </div>

            <div className="result-header">
              <label className="section-label">C.le. 优化结果</label>
              <button disabled={optimizing} onClick={() => void runOptimize()}>
                {engine === "ai" ? "生成" : "重新生成"}
              </button>
            </div>
            {engine === "ai" && (
              <div className="provider-status">
                <ShieldCheck size={13} />
                <span>{aiSettings.model} · {aiSettings.hasApiKey ? "API Key 已安全保存" : "未保存 API Key"}</span>
              </div>
            )}
            <div className="result-box-wrap">
              {optimizing && <div className="result-loading"><LoaderCircle size={18} className="spin" /> AI 正在优化…</div>}
              <textarea value={optimized} onChange={(event) => setOptimized(event.target.value)} spellCheck={false} placeholder={engine === "ai" ? "点击“生成”开始 AI 优化" : ""} />
            </div>
            {optimizeError && <p className="inline-error">{optimizeError}</p>}

            <button className="primary-action" disabled={!optimized || optimizing} onClick={() => void copyOptimized()}>
              {copiedId === "optimized" ? <Check size={17} /> : <Sparkles size={17} />}
              {copiedId === "optimized" ? "已复制" : "复制优化结果"}
            </button>
          </>
        ) : (
          <div className="prompt-empty">
            <Sparkles size={25} />
            <span>选择一条文字剪贴板内容开始优化。</span>
          </div>
        )}
      </aside>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>C.le. Clip 设置</h2>
                <p>桌面行为与 AI Provider</p>
              </div>
              <button className="modal-close" onClick={() => setSettingsOpen(false)}><X size={18} /></button>
            </header>

            <div className="settings-section">
              <h3>系统</h3>
              <label className="switch-row">
                <div>
                  <strong>开机启动</strong>
                  <span>登录 Windows 或 macOS 后自动启动 C.le. Clip</span>
                </div>
                <input type="checkbox" checked={autostart} onChange={(event) => void changeAutostart(event.target.checked)} />
              </label>
              <div className="settings-note">关闭主窗口或按 Esc 只会隐藏应用；可从系统托盘重新打开。</div>
            </div>

            <div className="settings-section">
              <h3>AI Provider</h3>
              <label className="field-label">OpenAI-compatible Endpoint</label>
              <input className="settings-input" value={settingsForm.endpoint} onChange={(event) => setSettingsForm((current) => ({ ...current, endpoint: event.target.value }))} />
              <label className="field-label">模型</label>
              <input className="settings-input" value={settingsForm.model} onChange={(event) => setSettingsForm((current) => ({ ...current, model: event.target.value }))} placeholder="模型名称" />
              <label className="field-label">API Key</label>
              <input className="settings-input" type="password" value={settingsForm.apiKey} onChange={(event) => setSettingsForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={aiSettings.hasApiKey ? "已保存；留空保持不变" : "可留空用于本地兼容服务"} />
              <div className="settings-note with-icon">
                <ShieldCheck size={14} />
                API Key 由系统凭据库保存，不写入剪贴板数据库。
              </div>
            </div>

            <footer className="settings-footer">
              <span className="settings-message">{settingsMessage}</span>
              <button className="secondary-action" onClick={() => setSettingsOpen(false)}>取消</button>
              <button className="save-action" disabled={settingsSaving} onClick={() => void saveSettings()}>
                {settingsSaving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                保存
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
