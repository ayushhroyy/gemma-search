"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Plus, ArrowRight, Paperclip, ChevronDown, Cpu, Square, Copy, Download, Pencil, Check } from "lucide-react";
import { loadApiKeysState } from "./lib/apiKeys";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { SettingsPanel } from "./components/SettingsPanel";
import { MarkdownContent, ThinkingLeaf } from "./components/MarkdownRenderer";
import {
  type ModelConfig,
  type Message,
  DEFAULT_MODELS,
  MAX_SSE_BUFFER,
} from "./lib/types";

// Simple ID generator fallback for browsers without crypto.randomUUID
const generateId = () => {
  try {
    if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

// ─── Home Page ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isChatMode, setIsChatMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODELS);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsTyping(false);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          return prev.map(m => m.id === last.id ? { ...m, content: "Stream stopped.", status: undefined } : m);
        }
        return prev;
      });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => setSelectedImage(null);

  const placeholders = [
    "Send a message...",
    "Ask a query...",
    "Add an image...",
    "What would you like to explore?",
  ];

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 3000);

    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty("--mouse-x", `${e.clientX}px`);
      document.documentElement.style.setProperty("--mouse-y", `${e.clientY}px`);
      document.documentElement.style.setProperty("--spotlight-opacity", "1");
    };

    const handleMouseLeave = () => {
      document.documentElement.style.setProperty("--spotlight-opacity", "0");
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const userOverride = localStorage.getItem("theme");
      if (!userOverride) {
        const newTheme = e.matches ? "dark" : "light";
        setIsDark(e.matches);
        if (newTheme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      clearInterval(interval);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    const themeValue = newTheme ? "dark" : "light";
    localStorage.setItem("theme", themeValue);
    if (newTheme) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSearchQuery(e.target.value);
    setShowPlaceholder(e.target.value === "");
  };

  const handleSubmit = async () => {
    if (!searchQuery.trim() && !selectedImage) return;

    const query = searchQuery.trim();
    const imageToSend = selectedImage;
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: query,
      timestamp: new Date(),
      image: imageToSend || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setSearchQuery("");
    setSelectedImage(null);
    setIsChatMode(true);
    setIsTyping(true);

    const aiId = generateId();
    let initialized = false;

    const patchAI = (patch: Partial<Message>) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === aiId ? { ...m, ...patch } : m))
      );

    const initAI = (patch: Partial<Message> = {}) => {
      if (initialized) return;
      initialized = true;
      setMessages((prev) => [
        ...prev,
        { id: aiId, role: "assistant", content: "", timestamp: new Date(), ...patch },
      ]);
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const apiKeysState = loadApiKeysState();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          models: modelConfig,
          image: imageToSend,
          apiKeys: {
            keys: apiKeysState.keys,
            customEndpoints: apiKeysState.customEndpoints,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processLines = (lines: string[]) => {
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;

          try {
            const parsed = JSON.parse(raw);

            if (parsed.type === "status") {
              initAI({ status: parsed.message });
              if (initialized) patchAI({ status: parsed.message });
              continue;
            }

            if (parsed.type === "sources") {
              initAI({ sources: parsed.data });
              patchAI({ sources: parsed.data });
              continue;
            }

            if (parsed.type === "error") {
              initAI({ content: `Error: ${parsed.message}`, status: undefined });
              patchAI({ content: `Error: ${parsed.message}`, status: undefined });
              continue;
            }

            if (parsed.type === "cost") {
              patchAI({
                cost: parsed.value as number,
                promptTokens: parsed.promptTokens as number,
                completionTokens: parsed.completionTokens as number,
              });
              continue;
            }

            const delta = parsed.choices?.[0]?.delta;
            const token: string = delta?.content ?? "";
            const reasoning: string = delta?.reasoning ?? delta?.thought ?? "";

            if (!token && !reasoning) continue;

            if (!initialized) {
              initAI({
                content: token,
                reasoning: reasoning,
                status: undefined,
              });
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiId
                    ? {
                        ...m,
                        content: m.content + token,
                        reasoning: (m.reasoning || "") + reasoning,
                        status: undefined,
                      }
                    : m
                )
              );
            }
          } catch { /* malformed chunk — skip */ }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const remainingLines = buffer.split("\n");
            processLines(remainingLines);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Bounded SSE buffer
        if (buffer.length > MAX_SSE_BUFFER) {
          buffer = buffer.slice(-Math.floor(MAX_SSE_BUFFER / 2));
        }

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        processLines(lines);
      }
      setIsTyping(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setIsTyping(false);
      if (!initialized) {
        setMessages((prev) => [
          ...prev,
          { id: aiId, role: "assistant", content: "Something went wrong. Please try again.", timestamp: new Date() },
        ]);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startNewChat = () => {
    stopStream();
    setIsChatMode(false);
    setMessages([]);
    setSearchQuery("");
    setSelectedImage(null);
  };

  return (
    <ErrorBoundary>
      <div className={`relative h-[100dvh] w-screen overflow-hidden ${mounted ? "" : "no-transition"}`}>
        <div className="grid-background" style={{ width: "100vw", height: "100dvh", position: "fixed" }} />
        <div className="grid-background-spotlight hidden sm:block" />

        <Header
          isDark={isDark}
          onToggleTheme={toggleTheme}
          mounted={mounted}
          isChatMode={isChatMode}
          onNewChat={startNewChat}
          modelConfig={modelConfig}
          onModelChange={setModelConfig}
          onShowSettings={() => setShowSettings(true)}
        />

        {isChatMode ? (
          <ChatInterface
            messages={messages}
            isTyping={isTyping}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            placeholderIndex={placeholderIndex}
            showPlaceholder={showPlaceholder}
            messagesEndRef={messagesEndRef}
            onStop={stopStream}
            onAttach={handleImageUpload}
            selectedImage={selectedImage}
            onRemoveImage={removeImage}
          />
        ) : (
          <LandingInterface
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            placeholder={showPlaceholder ? placeholders[placeholderIndex] : ""}
            onSuggestionClick={setSearchQuery}
            isTyping={isTyping}
            onStop={stopStream}
            onAttach={handleImageUpload}
            selectedImage={selectedImage}
            onRemoveImage={removeImage}
          />
        )}

        <SettingsPanel
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      </div>
    </ErrorBoundary>
  );
}

// ─── Logo ────────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="text-center animate-fade-in-up">
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Gemma
        <span className="ml-2 font-light" style={{ color: "var(--accent-color)" }}>Search</span>
      </h1>
    </div>
  );
}

// ─── Landing Interface ───────────────────────────────────────────────────────────

interface LandingInterfaceProps {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  onSuggestionClick: (text: string) => void;
  isTyping?: boolean;
  onStop?: () => void;
  onAttach?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedImage?: string | null;
  onRemoveImage?: () => void;
}

function LandingInterface({ searchQuery, onSearchChange, onSubmit, onKeyDown, placeholder, onSuggestionClick, isTyping, onStop, onAttach, selectedImage, onRemoveImage }: LandingInterfaceProps) {
  return (
    <main className="relative z-10 flex h-full items-center justify-center px-4 sm:px-6">
      <div className="relative w-full max-w-3xl flex items-center justify-center">
        <div className="absolute -top-[clamp(4rem,8vh,6rem)] left-0 right-0 flex justify-center pointer-events-none">
          <Logo />
        </div>
        <div className="relative w-full">
          <SearchBox
            value={searchQuery}
            onChange={onSearchChange}
            onSubmit={onSubmit}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            isTyping={isTyping}
            onStop={onStop}
            onAttach={onAttach}
            selectedImage={selectedImage}
            onRemoveImage={onRemoveImage}
          />
        </div>
        <div className="absolute -bottom-[clamp(5rem,12vh,8rem)] left-0 right-0 flex justify-center pointer-events-none">
          <SuggestedQueries onSelect={onSuggestionClick} />
        </div>
      </div>
    </main>
  );
}

// ─── Chat Interface ──────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  messages: Message[];
  isTyping: boolean;
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholderIndex: number;
  showPlaceholder: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onStop: () => void;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedImage: string | null;
  onRemoveImage: () => void;
}

function ChatInterface({
  messages,
  isTyping,
  searchQuery,
  onSearchChange,
  onSubmit,
  onKeyDown,
  placeholderIndex,
  showPlaceholder,
  messagesEndRef,
  onStop,
  onAttach,
  selectedImage,
  onRemoveImage,
}: ChatInterfaceProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isAutoScrolling = useRef(false);
  const userInteracted = useRef(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onUserScroll = () => {
      if (!isAutoScrolling.current) userInteracted.current = true;
    };
    container.addEventListener("wheel", onUserScroll, { passive: true });
    container.addEventListener("touchmove", onUserScroll, { passive: true });
    return () => {
      container.removeEventListener("wheel", onUserScroll);
      container.removeEventListener("touchmove", onUserScroll);
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (userInteracted.current) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 80) {
        userInteracted.current = false;
      } else return;
    }
    isAutoScrolling.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { isAutoScrolling.current = false; });
    });
  }, [messages, isTyping, messagesEndRef]);

  const placeholders = [
    "Send a message...",
    "Ask a query...",
    "Add an image...",
    "What would you like to explore?",
  ];

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    onSearchChange(e);
    textarea.style.height = "auto";
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 200);
    textarea.style.height = `${newHeight}px`;
  };

  return (
    <main className="relative z-10 flex h-full flex-col pb-6 pt-20 sm:pt-24">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto w-full px-4 sm:px-6 py-6 sm:py-4">
        <div className="max-w-3xl w-full mx-auto">
          {messages.map((message, idx) => (
            <ResearchCardMessage
              key={message.id}
              message={message}
              isFirst={idx === 0}
              onEditUserMessage={(content) => {
                onSearchChange({ target: { value: content } } as React.ChangeEvent<HTMLTextAreaElement>);
              }}
            />
          ))}
          {isTyping && <MinimalTyping />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="w-full px-4 sm:px-6">
        <div className="max-w-3xl w-full mx-auto">
          <div
            className="relative rounded-2xl border transition-all duration-300 ease-out"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: isFocused ? "var(--accent-color)" : "var(--border-color)",
              boxShadow: isFocused ? "0 0 0 3px var(--accent-glow), var(--shadow-medium)" : "var(--shadow-medium)",
            }}
          >
            {selectedImage && (
              <div className="px-5 pt-4 pb-2 relative">
                <div className="relative inline-block group">
                  <img src={selectedImage} alt="Attached" className="h-16 w-16 object-cover rounded-xl border" style={{ borderColor: "var(--border-color)" }} />
                  <button onClick={onRemoveImage}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={searchQuery}
              onChange={handleChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={onKeyDown}
              placeholder={showPlaceholder ? placeholders[placeholderIndex] : ""}
              className="w-full bg-transparent px-5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none overflow-y-auto"
              style={{
                fontSize: "0.95rem",
                lineHeight: "1.5",
                minHeight: "56px",
                maxHeight: "200px",
                paddingTop: selectedImage ? "8px" : "16px",
                paddingBottom: "42px",
                outline: "none",
                transition: "color 150ms ease",
              }}
              rows={1}
            />
            <div className="absolute left-3 bottom-3 flex gap-2">
              <label className="rounded-lg p-2 transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)]"
                style={{ color: "var(--text-secondary)" }}>
                <Paperclip className="h-4 w-4" />
                <input type="file" accept="image/*" className="hidden" onChange={onAttach} />
              </label>
            </div>
            {isTyping ? (
              <button onClick={onStop}
                className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors bg-red-500 hover:bg-red-600 text-white">
                <Square className="h-4 w-4 fill-current" />
              </button>
            ) : (
              <button onClick={onSubmit}
                disabled={!searchQuery.trim() && !selectedImage}
                className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: (searchQuery.trim() || selectedImage) ? "var(--accent-color)" : "var(--bg-tertiary)",
                  color: (searchQuery.trim() || selectedImage) ? "#ffffff" : "var(--text-secondary)",
                }}>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Typing Indicator ────────────────────────────────────────────────────────────

function MinimalTyping() {
  return (
    <div className="mb-8 animate-fade-in flex justify-center">
      <div className="flex gap-2">
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--accent-color)", animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--accent-color)", animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: "var(--accent-color)", animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

// ─── Research Card Message ───────────────────────────────────────────────────────

interface ResearchCardMessageProps {
  message: Message;
  isFirst: boolean;
  onEditUserMessage?: (content: string) => void;
}

function ResearchCardMessage({ message, isFirst, onEditUserMessage }: ResearchCardMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [userCopied, setUserCopied] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);

  const handleCopyAssistant = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    const messageElement = document.getElementById(`message-${message.id}`);
    if (!messageElement) return;

    const html2pdf = (await import("html2pdf.js")).default;
    const isDark = document.documentElement.classList.contains("dark");
    const opt = {
      margin: [10, 10, 10, 10] as [number, number, number, number],
      filename: `gemma-response-${Date.now()}.pdf`,
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
    };

    const tempContainer = document.createElement("div");
    tempContainer.style.padding = "20px";
    tempContainer.style.backgroundColor = isDark ? "#141414" : "#ffffff";
    tempContainer.style.color = isDark ? "#fafafa" : "#000000";
    tempContainer.innerHTML = messageElement.innerHTML;

    try {
      await html2pdf().set(opt).from(tempContainer).save();
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    }
  };

  const handleCopyUser = () => {
    navigator.clipboard.writeText(message.content);
    setUserCopied(true);
    setTimeout(() => setUserCopied(false), 2000);
  };

  return (
    <div className={`mb-8 ${isFirst ? "mt-4 sm:mt-0" : "mt-12"} animate-fade-in`}>
      {isUser ? (
        <div className="flex justify-end mb-8">
          <div className="max-w-lg group">
            <div className="rounded-xl px-5 py-3.5 border"
              style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}>
              {message.image && (
                <div className="mb-4">
                  <img src={message.image} alt="User attached" className="max-w-xs h-auto rounded-xl border" style={{ borderColor: "var(--border-color)" }} />
                </div>
              )}
              <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap">{message.content}</p>
            </div>
            <div className="flex justify-end gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <button onClick={handleCopyUser}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                style={{ color: "var(--text-tertiary)", backgroundColor: "var(--bg-secondary)" }} title="Copy">
                {userCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{userCopied ? "Copied" : "Copy"}</span>
              </button>
              {onEditUserMessage && (
                <button onClick={() => onEditUserMessage(message.content)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                  style={{ color: "var(--text-tertiary)", backgroundColor: "var(--bg-secondary)" }} title="Edit">
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          {message.sources && message.sources.length > 0 && (
            <div className="mb-6">
              <button onClick={() => setSourcesCollapsed(!sourcesCollapsed)}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--accent-color)" }}>
                    {message.sources.length}
                  </span>
                  Sources
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${sourcesCollapsed ? 'rotate-180' : ''}`} />
              </button>
              {!sourcesCollapsed && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {message.sources.map((src, i) => (
                    <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all duration-200 hover:scale-[1.03]"
                      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-tertiary)" }}
                      title={src.snippet}>
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                        style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--accent-color)" }}>
                        {i + 1}
                      </span>
                      <span className="max-w-[160px] truncate">{src.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {message.reasoning && <ThinkingLeaf content={message.reasoning} />}

          <article id={`message-${message.id}`} className="prose-readable" style={{ fontFamily: "var(--font-body)" }}>
            {message.content ? <MarkdownContent content={message.content} /> : (
              <div className="flex items-center gap-2.5 py-2">
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ backgroundColor: "var(--accent-color)", animationDelay: `${delay}ms` }} />
                  ))}
                </div>
                <span style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>
                  {message.status ?? "Thinking..."}
                </span>
              </div>
            )}
          </article>

          {message.content && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button onClick={handleCopyAssistant}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs border transition-all duration-150 hover:scale-[1.02]"
                style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-tertiary)" }}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy"}</span>
              </button>
              <button onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs border transition-all duration-150 hover:scale-[1.02]"
                style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-tertiary)" }}>
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
              {typeof message.cost === "number" && (
                <CostBadge cost={message.cost} promptTokens={message.promptTokens} completionTokens={message.completionTokens} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Search Box ──────────────────────────────────────────────────────────────────

function SearchBox({
  value, onChange, onSubmit, onKeyDown, placeholder, isTyping, onStop, onAttach, selectedImage, onRemoveImage,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  isTyping?: boolean;
  onStop?: () => void;
  onAttach?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedImage?: string | null;
  onRemoveImage?: () => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    onChange(e);
    textarea.style.height = "auto";
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 80), 300);
    textarea.style.height = `${newHeight}px`;
  };

  return (
    <div className="relative mb-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <div className="relative rounded-2xl border transition-all duration-300 ease-out hover:shadow-xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: isFocused ? "var(--accent-color)" : "var(--border-color)",
          boxShadow: isFocused ? "0 0 0 3px var(--accent-glow)" : "var(--shadow-medium)",
        }}>
        {selectedImage && (
          <div className="px-5 pt-4 pb-2 relative">
            <div className="relative inline-block group">
              <img src={selectedImage} alt="Attached" className="h-16 w-16 object-cover rounded-xl border" style={{ borderColor: "var(--border-color)" }} />
              <button onClick={onRemoveImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        <textarea ref={textareaRef} value={value} onChange={handleChange}
          onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
          onKeyDown={onKeyDown} placeholder={placeholder}
          className="w-full bg-transparent px-5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none overflow-y-auto"
          style={{
            fontSize: "1rem", lineHeight: "1.5",
            minHeight: "98px", maxHeight: "320px",
            paddingTop: selectedImage ? "8px" : "18px",
            paddingBottom: "42px", outline: "none",
            transition: "color 150ms ease",
          }}
          rows={1} />
        <div className="absolute left-3 bottom-3 flex gap-2">
          <label className="rounded-lg p-2 transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)]"
            style={{ color: "var(--text-secondary)" }}>
            <Paperclip className="h-4 w-4" />
            <input type="file" accept="image/*" className="hidden" onChange={onAttach} />
          </label>
        </div>
        {isTyping ? (
          <button onClick={onStop}
            className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors bg-red-500 hover:bg-red-600 text-white">
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button onClick={onSubmit}
            disabled={!value.trim() && !selectedImage}
            className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: (value.trim() || selectedImage) ? "var(--accent-color)" : "var(--bg-tertiary)",
              color: (value.trim() || selectedImage) ? "#ffffff" : "var(--text-secondary)",
            }}>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Suggested Queries ───────────────────────────────────────────────────────────

function SuggestedQueries({ onSelect }: { onSelect: (t: string) => void }) {
  const suggestions = [
    { icon: "📰", label: "News" },
    { icon: "📉", label: "Stocks" },
    { icon: "🌤️", label: "Weather" },
    { icon: "🏀", label: "Sports" },
  ];

  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-2 animate-fade-in w-full px-4" style={{ animationDelay: "0.2s" }}>
      {suggestions.map((suggestion, index) => (
        <button key={index} onClick={() => onSelect(suggestion.label)}
          className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200"
          style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-secondary)", boxShadow: "var(--shadow-subtle)" }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-medium)"; e.currentTarget.style.borderColor = "var(--accent-color)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-subtle)"; e.currentTarget.style.borderColor = "var(--border-color)"; }}>
          <span className="text-lg">{suggestion.icon}</span>
          <span>{suggestion.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Cost Badge ──────────────────────────────────────────────────────────────────

function CostBadge({ cost, promptTokens, completionTokens }: { cost: number; promptTokens?: number; completionTokens?: number }) {
  const formatted = cost === 0
    ? "$0.0000"
    : cost < 0.0001
    ? `$${cost.toExponential(2)}`
    : `$${cost.toFixed(Math.max(4, 2 - Math.floor(Math.log10(cost))))}`;

  const totalTokens = (promptTokens || 0) + (completionTokens || 0);

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-xs border ml-auto"
      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-tertiary)" }}
      title={`Cost: ${formatted}\nInput: ${promptTokens?.toLocaleString() || 0} tokens\nOutput: ${completionTokens?.toLocaleString() || 0} tokens`}>
      <div className="flex items-center gap-1.5">
        <span style={{ color: "var(--accent-color)", fontWeight: 600 }}>⚡</span>
        <span>{formatted}</span>
      </div>
      {totalTokens > 0 && (
        <div className="flex items-center gap-1.5 pl-3 border-l" style={{ borderColor: "var(--border-color)" }}>
          <Cpu className="w-3 h-3 opacity-60" style={{ color: "var(--accent-color)" }} />
          <span>{totalTokens.toLocaleString()} tokens</span>
        </div>
      )}
    </div>
  );
}
