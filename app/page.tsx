"use client";

import React, { useState, useEffect, useRef } from "react";
import { Menu, X, Plus, Sun, Moon, ArrowRight, Paperclip, ChevronDown, Cpu } from "lucide-react";

// ─── Gemma Models ─────────────────────────────────────────────────────────────
const GEMMA_MODELS = [
  { id: "google/gemma-4-31b-it",   label: "Gemma 4 31B" },
  { id: "google/gemma-4-26b-a4b-it", label: "Gemma 4 26B" },
  { id: "google/gemma-3-27b-it",   label: "Gemma 3 27B" },
  { id: "google/gemma-3-12b-it",   label: "Gemma 3 12B" },
  { id: "google/gemma-3-4b-it",    label: "Gemma 3 4B" },
  { id: "google/gemma-3n-e4b-it",  label: "Gemma 3n E4B" },
] as const;

type GemmaModelId = typeof GEMMA_MODELS[number]["id"];

interface ModelConfig {
  router:   GemmaModelId;
  selector: GemmaModelId;
  writer:   GemmaModelId;
}

const DEFAULT_MODELS: ModelConfig = {
  router:   "google/gemma-4-31b-it",
  selector: "google/gemma-4-26b-a4b-it",
  writer:   "google/gemma-3-12b-it",
};

interface Source {
  title: string;
  url: string;
  snippet: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Source[];
  status?: string;
}

export default function HomePage() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isChatMode, setIsChatMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODELS);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // (Scroll logic moved to ChatInterface)

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

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSearchQuery(e.target.value);
    setShowPlaceholder(e.target.value === "");
  };

  const handleSubmit = async () => {
    if (!searchQuery.trim()) return;

    const query = searchQuery.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setSearchQuery("");
    setIsChatMode(true);
    setIsTyping(true);

    const aiId = (Date.now() + 1).toString();
    let initialized = false;

    /** Add or update the AI message in state */
    const patchAI = (patch: Partial<Message>) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === aiId ? { ...m, ...patch } : m))
      );

    /** Lazily create the AI message on first meaningful event */
    const initAI = (patch: Partial<Message> = {}) => {
      if (initialized) return;
      initialized = true;
      setMessages((prev) => [
        ...prev,
        { id: aiId, role: "assistant", content: "", timestamp: new Date(), ...patch },
      ]);
      setIsTyping(false);
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, models: modelConfig }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;

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

            // Writer token
            const token: string = parsed.choices?.[0]?.delta?.content ?? "";
            if (!token) continue;

            if (!initialized) {
              initAI({ content: token, status: undefined });
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiId
                    ? { ...m, content: m.content + token, status: undefined }
                    : m
                )
              );
            }
          } catch { /* malformed chunk — skip */ }
        }
      }
    } catch {
      setIsTyping(false);
      if (!initialized) {
        setMessages((prev) => [
          ...prev,
          { id: aiId, role: "assistant", content: "Something went wrong. Please try again.", timestamp: new Date() },
        ]);
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
    setIsChatMode(false);
    setMessages([]);
    setSearchQuery("");
  };

  return (
    <div className={`relative h-[100dvh] w-screen overflow-hidden ${mounted ? "" : "no-transition"}`}>
      <div className="grid-background" style={{ width: "100vw", height: "100dvh", position: "fixed" }} />
      <div className="grid-background-spotlight hidden sm:block" />

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <Header
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onToggleSidebar={toggleSidebar}
        isSidebarOpen={isSidebarOpen}
        mounted={mounted}
        isChatMode={isChatMode}
        onNewChat={startNewChat}
        modelConfig={modelConfig}
        onModelChange={setModelConfig}
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
        />
      ) : (
        <LandingInterface
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          placeholder={showPlaceholder ? placeholders[placeholderIndex] : ""}
          onSuggestionClick={setSearchQuery}
        />
      )}
    </div>
  );
}

function Logo() {
  return (
    <div className="mb-8 text-center animate-fade-in">
      <h1 className="text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
        Gemma
        <span className="ml-2 font-light text-[var(--accent-color)]">Search</span>
      </h1>
    </div>
  );
}

interface LandingInterfaceProps {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  onSuggestionClick: (text: string) => void;
}

function LandingInterface({ searchQuery, onSearchChange, onSubmit, onKeyDown, placeholder, onSuggestionClick }: LandingInterfaceProps) {
  return (
    <main className="relative z-10 flex h-full items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-3xl">
        <Logo />

        <SearchBox
          value={searchQuery}
          onChange={onSearchChange}
          onSubmit={onSubmit}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />

        <SuggestedQueries onSelect={onSuggestionClick} />
      </div>
    </main>
  );
}

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
}: ChatInterfaceProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  // Smart scrolling
  useEffect(() => {
    if (!userHasScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, userHasScrolledUp, messagesEndRef]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // If user is within 100px of the bottom, consider them at the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setUserHasScrolledUp(!isAtBottom);
  };

  const placeholders = [
    "Send a message...",
    "Ask a query...",
    "Add an image...",
    "What would you like to explore?",
  ];

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    onSearchChange(e);

    // Auto-resize textarea
    textarea.style.height = "auto";
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 200);
    textarea.style.height = `${newHeight}px`;
  };

  return (
    <main className="relative z-10 flex h-full flex-col pb-6 pt-20 sm:pt-24">
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto w-full px-4 sm:px-6 py-6 sm:py-4"
      >
        <div className="max-w-3xl w-full mx-auto">
          {messages.map((message, idx) => (
            <ResearchCardMessage key={message.id} message={message} isFirst={idx === 0} />
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
              paddingTop: "16px",
              paddingBottom: "42px",
              outline: "none",
              transition: "color 150ms ease",
            }}
            rows={1}
          />
          <div className="absolute left-3 bottom-3 flex gap-2">
            <button
              className="rounded-lg p-2 transition-colors"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
              }}
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={onSubmit}
            disabled={!searchQuery.trim()}
            className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: searchQuery.trim() ? "var(--accent-color)" : "var(--bg-tertiary)",
              color: searchQuery.trim() ? "#ffffff" : "var(--text-secondary)",
            }}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      </div>
    </main>
  );
}

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-6 animate-fade-in`}
      style={{ animationDelay: "0.1s" }}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-5 py-3.5 ${
          isUser ? "rounded-br-sm" : "rounded-bl-sm"
        }`}
        style={{
          backgroundColor: isUser ? "var(--accent-color)" : "var(--bg-secondary)",
          color: isUser ? "#ffffff" : "var(--text-primary)",
          boxShadow: "var(--shadow-subtle)",
        }}
      >
        <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-6 animate-fade-in">
      <div
        className="rounded-2xl rounded-bl-sm px-5 py-4"
        style={{
          backgroundColor: "var(--bg-secondary)",
          boxShadow: "var(--shadow-subtle)",
        }}
      >
        <div className="flex gap-1.5">
          <span
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              backgroundColor: "var(--text-tertiary)",
              animationDelay: "0ms",
            }}
          />
          <span
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              backgroundColor: "var(--text-tertiary)",
              animationDelay: "150ms",
            }}
          />
          <span
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              backgroundColor: "var(--text-tertiary)",
              animationDelay: "300ms",
            }}
          />
        </div>
      </div>
    </div>
  );
}

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

// STYLE 2: Research Card - Clean, readable, research-focused
interface ResearchCardMessageProps {
  message: Message;
  isFirst: boolean;
}

function ResearchCardMessage({ message, isFirst }: ResearchCardMessageProps) {
  const isUser = message.role === "user";


  return (
    <div className={`mb-8 ${isFirst ? "mt-4 sm:mt-0" : "mt-12"} animate-fade-in`}>
      {isUser ? (
        <div className="flex justify-end mb-8">
          <div className="max-w-lg">
            <div
              className="rounded-xl px-5 py-3.5 border"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <p className="text-[0.95rem] leading-relaxed">{message.content}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          {/* Sources */}
          {message.sources && message.sources.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {message.sources.map((src, i) => (
                <a
                  key={i}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all duration-200 hover:scale-[1.03]"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-tertiary)",
                  }}
                  title={src.snippet}
                >
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--accent-color)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="max-w-[160px] truncate">{src.title}</span>
                </a>
              ))}
            </div>
          )}

          {/* Content */}
          <article className="prose-readable" style={{ fontFamily: "var(--font-body)" }}>
            {message.content ? <MarkdownContent content={message.content} /> : (
              <div className="flex items-center gap-2.5 py-2">
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ backgroundColor: "var(--accent-color)", animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                <span style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>
                  {message.status ?? "Thinking…"}
                </span>
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    onChange(e as any);

    // Auto-resize textarea
    textarea.style.height = "auto";
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 80), 300);
    textarea.style.height = `${newHeight}px`;
  };

  return (
    <div className="relative mb-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <div
        className="relative rounded-2xl border transition-all duration-300 ease-out hover:shadow-xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: isFocused ? "var(--accent-color)" : "var(--border-color)",
          boxShadow: isFocused ? "0 0 0 3px var(--accent-glow)" : "var(--shadow-medium)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent px-5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none overflow-y-auto"
          style={{
            fontSize: "1rem",
            lineHeight: "1.5",
            minHeight: "98px",
            maxHeight: "320px",
            paddingTop: "18px",
            paddingBottom: "42px",
            outline: "none",
            transition: "color 150ms ease",
          }}
          rows={1}
        />
        <button
          className="absolute left-3 bottom-3 rounded-lg p-2"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
          }}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: value.trim() ? "var(--accent-color)" : "var(--bg-tertiary)",
            color: value.trim() ? "#ffffff" : "var(--text-secondary)",
          }}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SuggestedQueries({ onSelect }: { onSelect: (t: string) => void }) {
  const suggestions = [
    { icon: "📰", text: "What are the latest developments in AI?" },
    { icon: "📉", text: "How did the stock market perform today?" },
    { icon: "🌤️", text: "What's the weather forecast for New York this week?" },
    { icon: "🏀", text: "Who won the NBA finals last night?" },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-3 animate-fade-in" style={{ animationDelay: "0.2s" }}>
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelect(suggestion.text)}
          className="flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm transition-all duration-100"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            color: "var(--text-secondary)",
            boxShadow: "var(--shadow-subtle)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "var(--shadow-medium)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "var(--shadow-subtle)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <span className="text-base hidden sm:inline">{suggestion.icon}</span>
          <span>{suggestion.text}</span>
        </button>
      ))}
    </div>
  );
}

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  mounted: boolean;
  isChatMode?: boolean;
  onNewChat?: () => void;
  modelConfig: ModelConfig;
  onModelChange: (c: ModelConfig) => void;
}

function Header({
  isDark,
  onToggleTheme,
  onToggleSidebar,
  isSidebarOpen,
  mounted,
  isChatMode = false,
  onNewChat,
  modelConfig,
  onModelChange,
}: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-20 px-3 sm:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleSidebar}
            className="rounded-xl p-2.5 text-[var(--text-primary)] transition-all duration-200 hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] active:scale-95"
            style={{ boxShadow: "var(--shadow-subtle)" }}
            aria-label="Toggle sidebar"
          >
            {isSidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          {isChatMode && onNewChat && (
            <button
              onClick={onNewChat}
              className="flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] animate-slide-in-left"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                boxShadow: "var(--shadow-subtle)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
              }}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New chat</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ModelPicker config={modelConfig} onChange={onModelChange} />
          <button
            onClick={onToggleTheme}
            className="rounded-xl p-2.5 text-[var(--text-primary)] transition-all duration-200 hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] active:scale-95"
            style={{ boxShadow: "var(--shadow-subtle)" }}
            aria-label="Toggle theme"
          >
            {mounted ? (
              isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </button>

          <button
            className="hidden sm:block rounded-xl px-5 py-2.5 font-medium text-sm transition-all duration-200"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-subtle)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--accent-color)";
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
          >
            Sign in
          </button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [chats, setChats] = useState([
    { id: 1, title: "Understanding machine learning", date: "Today" },
    { id: 2, title: "React component optimization", date: "Yesterday" },
    { id: 3, title: "Design patterns overview", date: "3 days ago" },
  ]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 w-80 transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border-color)",
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: "var(--border-color)" }}>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Chats
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--text-tertiary)] transition-all duration-200 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <button
            className="mx-4 mb-4 mt-6 flex items-center gap-3 rounded-xl px-4 py-3.5 font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
            }}
          >
            <Plus className="h-5 w-5 flex-shrink-0" />
            <span>New chat</span>
          </button>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="mb-4 px-2 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Recent
            </div>
            {chats.map((chat) => (
              <button
                key={chat.id}
                className="mb-2 w-full rounded-xl px-4 py-3 text-left transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <div className="truncate text-sm font-medium">{chat.title}</div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {chat.date}
                </div>
              </button>
            ))}
          </div>

          <div className="border-t p-4" style={{ borderColor: "var(--border-color)" }}>
            <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200 hover:scale-[1.01] hover:bg-[var(--bg-tertiary)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium" style={{ backgroundColor: "var(--accent-color)", color: "#ffffff" }}>
                U
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Guest
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Sign in to save chats
                </div>
              </div>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  // Split on bold, italic, inline-code, and links
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded px-1.5 py-0.5 text-[0.875em] font-mono"
          style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--accent-color)" }}>
          {part.slice(1, -1)}
        </code>
      );
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link)
      return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer"
        style={{ color: "var(--accent-color)", textDecoration: "underline" }}>{link[1]}</a>;
    return part;
  });
}

function MarkdownContent({ content }: { content: string }) {
  const lines  = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: { text: string; ordered: boolean }[] = [];
  let isOrdered = false;
  let codeLines: string[]  = [];
  let inCode    = false;

  const flushList = (key: string) => {
    if (!listItems.length) return;
    const items = listItems.map((li, j) => (
      <li key={j} className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {renderInline(li.text)}
      </li>
    ));
    nodes.push(
      isOrdered
        ? <ol key={key} className="mb-4 pl-6 space-y-1.5 list-decimal">{items}</ol>
        : <ul key={key} className="mb-4 pl-5 space-y-1.5 list-disc">{items}</ul>
    );
    listItems = [];
  };

  lines.forEach((line, idx) => {
    const key = String(idx);

    // Code fence
    if (line.startsWith("```")) {
      if (!inCode) { inCode = true; codeLines = []; }
      else {
        inCode = false;
        flushList(key + "l");
        nodes.push(
          <pre key={key} className="mb-4 rounded-xl p-4 overflow-x-auto text-sm font-mono"
            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
      }
      return;
    }
    if (inCode) { codeLines.push(line); return; }

    // Headings (### before ## before #)
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    // Also treat **Entire line** as an h3-style header
    const boldHeader = !h1 && !h2 && !h3 && line.match(/^\*\*([^*]+)\*\*\s*$/);

    if (h3) { flushList(key + "l"); nodes.push(<h3 key={key} className="text-base font-semibold mt-6 mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h3[1])}</h3>); return; }
    if (h2) { flushList(key + "l"); nodes.push(<h2 key={key} className="text-lg font-semibold mt-7 mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h2[1])}</h2>); return; }
    if (h1) { flushList(key + "l"); nodes.push(<h1 key={key} className="text-xl font-semibold mt-8 mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h1[1])}</h1>); return; }
    if (boldHeader) { flushList(key + "l"); nodes.push(<h3 key={key} className="text-base font-semibold mt-6 mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{boldHeader[1]}</h3>); return; }

    // Ordered list
    const ol = line.match(/^(\d+)\.\s+(.+)/);
    if (ol) {
      if (listItems.length && !isOrdered) flushList(key + "l");
      isOrdered = true;
      listItems.push({ text: ol[2], ordered: true });
      return;
    }

    // Unordered list
    const ul = line.match(/^[-*+]\s+(.+)/);
    if (ul) {
      if (listItems.length && isOrdered) flushList(key + "l");
      isOrdered = false;
      listItems.push({ text: ul[1], ordered: false });
      return;
    }

    // Empty line → flush list
    if (!line.trim()) { flushList(key + "l"); return; }

    // Paragraph
    flushList(key + "l");
    nodes.push(
      <p key={key} className="mb-3 leading-relaxed" style={{ color: "var(--text-secondary)", fontSize: "0.965rem" }}>
        {renderInline(line)}
      </p>
    );
  });

  flushList("final");
  return <>{nodes}</>;
}

// ─── Model Picker ─────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<keyof ModelConfig, string> = {
  router:   "Router",
  selector: "Selector",
  writer:   "Writer",
};

function ModelPicker({ config, onChange }: { config: ModelConfig; onChange: (c: ModelConfig) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-95"
        style={{
          backgroundColor: open ? "var(--bg-tertiary)" : "var(--bg-secondary)",
          color: "var(--text-secondary)",
          boxShadow: "var(--shadow-subtle)",
        }}
        aria-label="Select agent models"
      >
        <Cpu className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
        <span className="hidden sm:inline">Models</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 sm:w-72 rounded-2xl border p-4 z-50"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
            Agent Models
          </p>
          <div className="space-y-3">
            {(Object.keys(AGENT_LABELS) as (keyof ModelConfig)[]).map((agent) => (
              <div key={agent} className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium w-16 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                  {AGENT_LABELS[agent]}
                </span>
                <select
                  value={config[agent]}
                  onChange={(e) => onChange({ ...config, [agent]: e.target.value as GemmaModelId })}
                  className="flex-1 rounded-lg px-2.5 py-1.5 text-xs border appearance-none cursor-pointer outline-none"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {GEMMA_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-3 leading-snug" style={{ color: "var(--text-tertiary)" }}>
            All models via OpenRouter · Changes apply to next query
          </p>
        </div>
      )}
    </div>
  );
}
