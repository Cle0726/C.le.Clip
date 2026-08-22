import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clipboard,
  Copy,
  Heart,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { readClipboardText, writeClipboardText } from "./lib/clipboard";
import { optimizePrompt } from "./lib/promptOptimizer";
import type { ClipboardItem, PromptMode } from "./types";

const STORAGE_KEY = "cle.clip.history.v1";
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

function loadItems(): ClipboardItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
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

export default function App() {
  const [items, setItems] = useState<ClipboardItem[]>(loadItems);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"recent" | "favorites">("recent");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [mode, setMode] = useState<PromptMode>("smart");
  const [optimized, setOptimized] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const lastClipboard = useRef("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    let disposed = false;
    const capture = async () => {
      const text = await readClipboardText();
      if (disposed || !text || !text.trim() || text === lastClipboard.current) return;
      lastClipboard.current = text;
      setItems((current) => {
        const existing = current.find((item) => item.text === text);
        const next: ClipboardItem = {
          id: existing?.id ?? crypto.randomUUID(),
          kind: "text",
          text,
          createdAt: Date.now(),
          favorite: existing?.favorite ?? false,
        };
        return [next, ...current.filter((item) => item.text !== text)].slice(0, HISTORY_LIMIT);
      });
    };

    capture();
    const timer = window.setInterval(capture, 700);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (view === "favorites" && !item.favorite) return false;
      return !needle || item.text.toLocaleLowerCase().includes(needle);
    });
  }, [items, query, view]);

  const selected = items.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;

  useEffect(() => {
    setOptimized(selected ? optimizePrompt(selected.text, mode) : "");
  }, [selected?.id, mode]);

  async function copyItem(item: ClipboardItem) {
    await writeClipboardText(item.text);
    lastClipboard.current = item.text;
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 900);
  }

  async function copyOptimized() {
    if (!optimized) return;
    await writeClipboardText(optimized);
    lastClipboard.current = optimized;
    setCopiedId("optimized");
    window.setTimeout(() => setCopiedId(null), 900);
  }

  function toggleFavorite(id: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, favorite: !item.favorite } : item)),
    );
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId(null);
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

        <div className="sidebar-note">
          <Sparkles size={15} />
          <span>Prompt Lab 已启用</span>
        </div>
      </aside>

      <main className="history-panel">
        <header className="topbar">
          <div>
            <h1>{view === "recent" ? "剪贴板" : "收藏"}</h1>
            <p>{visibleItems.length} 条内容</p>
          </div>
          <div className="search-box">
            <Search size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索剪贴板…" />
            {query && <button onClick={() => setQuery("")}><X size={15} /></button>}
          </div>
        </header>

        <section className="history-list">
          {visibleItems.length === 0 ? (
            <div className="empty-state">
              <Clipboard size={28} />
              <strong>还没有内容</strong>
              <span>复制文字后会自动出现在这里。</span>
            </div>
          ) : visibleItems.map((item) => (
            <article
              key={item.id}
              className={`clip-card ${selected?.id === item.id ? "selected" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              <div className="clip-body">
                <p>{item.text}</p>
                <span>{relativeTime(item.createdAt)}</span>
              </div>
              <div className="clip-actions">
                <button title="复制" onClick={(e) => { e.stopPropagation(); copyItem(item); }}>
                  {copiedId === item.id ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button title="收藏" className={item.favorite ? "is-favorite" : ""} onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}>
                  <Heart size={16} fill={item.favorite ? "currentColor" : "none"} />
                </button>
                <button title="删除" onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}>
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
            <p>优化当前剪贴板内容</p>
          </div>
        </div>

        {selected ? (
          <>
            <label className="section-label">原始内容</label>
            <div className="source-preview">{selected.text}</div>

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
              <button onClick={() => setOptimized(optimizePrompt(selected.text, mode))}>重新生成</button>
            </div>
            <textarea value={optimized} onChange={(e) => setOptimized(e.target.value)} spellCheck={false} />

            <button className="primary-action" onClick={copyOptimized}>
              {copiedId === "optimized" ? <Check size={17} /> : <Sparkles size={17} />}
              {copiedId === "optimized" ? "已复制" : "复制优化结果"}
            </button>
          </>
        ) : (
          <div className="prompt-empty">
            <Sparkles size={25} />
            <span>选择一条剪贴板内容开始优化。</span>
          </div>
        )}
      </aside>
    </div>
  );
}
