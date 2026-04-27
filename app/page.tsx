"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Menu, X, Plus, Sun, Moon, ArrowRight, Paperclip, ChevronDown, Cpu, Square, Copy, Download, Pencil, Check } from "lucide-react";
import mermaid from "mermaid";

// ─── Gemma Models ─────────────────────────────────────────────────────────────
const GEMMA_MODELS = [
  { id: "google/gemma-4-31b-it",    label: "Gemma 4 31B" },
  { id: "google/gemma-4-26b-a4b-it", label: "Gemma 4 26B" },
  { id: "google/gemma-3-27b-it",    label: "Gemma 3 27B" },
  { id: "google/gemma-3-12b-it",    label: "Gemma 3 12B" },
  { id: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 24B" },
  { id: "mistralai/ministral-14b-2512", label: "Ministral 14B" },
  { id: "mistralai/ministral-8b-2512", label: "Ministral 8B" },
  { id: "mistralai/ministral-3b-2512", label: "Ministral 3B" },
  { id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B" },
  { id: "qwen/qwen3-32b", label: "Qwen 3 32B" },
  { id: "qwen/qwen3-30b-a3b-instruct-2507", label: "Qwen 3 30B MoE" },
] as const;

type GemmaModelId = typeof GEMMA_MODELS[number]["id"];

interface ModelConfig {
  router:   string;
  selector: string;
  writer:   string;
  /** Uni-model mode: one model handles routing + writing */
  uniMode:  boolean;
  /** The model used in uni mode */
  uni:      string;
}

const DEFAULT_MODELS: ModelConfig = {
  router:   "google/gemma-4-31b-it",
  selector: "google/gemma-4-26b-a4b-it",
  writer:   "mistralai/mistral-small-3.2-24b-instruct",
  uniMode:  false,
  uni:      "google/gemma-4-31b-it",
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
  status?: string;
  sources?: Source[];
  image?: string;
  /** Total cost of all LLM calls for this response, in USD */
  cost?: number;
  /** Thinking/reasoning process for specific models */
  reasoning?: string;
  promptTokens?: number;
  completionTokens?: number;
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
    if (!searchQuery.trim() && !selectedImage) return;

    const query = searchQuery.trim();
    const imageToSend = selectedImage;
    const userMessage: Message = {
      id: Date.now().toString(),
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
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, models: modelConfig, image: imageToSend }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Helper to process a batch of SSE lines
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

            // Cost event — emitted after the stream ends
            if (parsed.type === "cost") {
              patchAI({ 
                cost: parsed.value as number,
                promptTokens: parsed.promptTokens as number,
                completionTokens: parsed.completionTokens as number
              });
              continue;
            }

            // Writer tokens (content or reasoning)
            const delta = parsed.choices?.[0]?.delta;
            const token: string = delta?.content ?? "";
            const reasoning: string = delta?.reasoning ?? delta?.thought ?? "";

            if (!token && !reasoning) continue;

            if (!initialized) {
              initAI({ 
                content: token, 
                reasoning: reasoning,
                status: undefined 
              });
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiId
                    ? { 
                        ...m, 
                        content: m.content + token, 
                        reasoning: (m.reasoning || "") + reasoning,
                        status: undefined 
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
          // Process any remaining lines in buffer before exit
          if (buffer.trim()) {
            const remainingLines = buffer.split("\n");
            processLines(remainingLines);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
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
  isTyping?: boolean;
  onStop?: () => void;
  onAttach?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedImage?: string | null;
  onRemoveImage?: () => void;
}

function LandingInterface({ searchQuery, onSearchChange, onSubmit, onKeyDown, placeholder, onSuggestionClick, isTyping, onStop, onAttach, selectedImage, onRemoveImage }: LandingInterfaceProps) {
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
          isTyping={isTyping}
          onStop={onStop}
          onAttach={onAttach}
          selectedImage={selectedImage}
          onRemoveImage={onRemoveImage}
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
  onStop,
  onAttach,
  selectedImage,
  onRemoveImage,
}: ChatInterfaceProps & {
  onStop: () => void;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedImage: string | null;
  onRemoveImage: () => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const isProgrammaticScroll = React.useRef(false);

  // Smart scrolling
  useEffect(() => {
    if (!userHasScrolledUp) {
      isProgrammaticScroll.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      requestAnimationFrame(() => {
        isProgrammaticScroll.current = false;
      });
    }
  }, [messages, isTyping, userHasScrolledUp, messagesEndRef]);

  const handleScroll = () => {
    if (!scrollContainerRef.current || isProgrammaticScroll.current) return;
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
            <ResearchCardMessage
              key={message.id}
              message={message}
              isFirst={idx === 0}
              onEditUserMessage={(content) => {
                onSearchChange({ target: { value: content } } as any);
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
                <button 
                  onClick={onRemoveImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
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
            <label
              className="rounded-lg p-2 transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)]"
              style={{
                color: "var(--text-secondary)",
              }}
            >
              <Paperclip className="h-4 w-4" />
              <input type="file" accept="image/*" className="hidden" onChange={onAttach} />
            </label>
          </div>
          {isTyping ? (
            <button
              onClick={onStop}
              className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors bg-red-500 hover:bg-red-600 text-white"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={!searchQuery.trim() && !selectedImage}
              className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: (searchQuery.trim() || selectedImage) ? "var(--accent-color)" : "var(--bg-tertiary)",
                color: (searchQuery.trim() || selectedImage) ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
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

function ResearchCardMessage({ message, isFirst, onEditUserMessage }: ResearchCardMessageProps & { onEditUserMessage?: (content: string) => void }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [userCopied, setUserCopied] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);

  const handleCopyAssistant = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([message.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gemma-response-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
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
            <div
              className="rounded-xl px-5 py-3.5 border"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {message.image && (
                <div className="mb-4">
                  <img src={message.image} alt="User attached" className="max-w-xs h-auto rounded-xl border" style={{ borderColor: "var(--border-color)" }} />
                </div>
              )}
              <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap">{message.content}</p>
            </div>
            {/* User action buttons */}
            <div className="flex justify-end gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <button
                onClick={handleCopyUser}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                style={{ color: "var(--text-tertiary)", backgroundColor: "var(--bg-secondary)" }}
                title="Copy"
              >
                {userCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{userCopied ? "Copied" : "Copy"}</span>
              </button>
              {onEditUserMessage && (
                <button
                  onClick={() => onEditUserMessage(message.content)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                  style={{ color: "var(--text-tertiary)", backgroundColor: "var(--bg-secondary)" }}
                  title="Edit"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          {/* Sources with collapse */}
          {message.sources && message.sources.length > 0 && (
            <div className="mb-6">
              {/* Collapse bar */}
              <button
                onClick={() => setSourcesCollapsed(!sourcesCollapsed)}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--accent-color)" }}>
                    {message.sources.length}
                  </span>
                  Sources
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${sourcesCollapsed ? 'rotate-180' : ''}`} />
              </button>

              {/* Collapsible sources */}
              {!sourcesCollapsed && (
                <div className="flex flex-wrap gap-2 mt-2">
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
            </div>
          )}

          {/* Thinking process */}
          {message.reasoning && (
            <ThinkingLeaf content={message.reasoning} />
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

          {/* Assistant action buttons + cost badge */}
          {message.content && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button
                onClick={handleCopyAssistant}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs border transition-all duration-150 hover:scale-[1.02]"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-tertiary)",
                }}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy"}</span>
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs border transition-all duration-150 hover:scale-[1.02]"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-tertiary)",
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .md</span>
              </button>
              {/* Cost badge — shown once cost is received */}
              {typeof message.cost === "number" && (
                <CostBadge 
                  cost={message.cost} 
                  promptTokens={message.promptTokens} 
                  completionTokens={message.completionTokens} 
                />
              )}
            </div>
          )}
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
  isTyping,
  onStop,
  onAttach,
  selectedImage,
  onRemoveImage,
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
        {selectedImage && (
          <div className="px-5 pt-4 pb-2 relative">
            <div className="relative inline-block group">
              <img src={selectedImage} alt="Attached" className="h-16 w-16 object-cover rounded-xl border" style={{ borderColor: "var(--border-color)" }} />
              <button 
                onClick={onRemoveImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
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
            paddingTop: selectedImage ? "8px" : "18px",
            paddingBottom: "42px",
            outline: "none",
            transition: "color 150ms ease",
          }}
          rows={1}
        />
        <div className="absolute left-3 bottom-3 flex gap-2">
          <label
            className="rounded-lg p-2 transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)]"
            style={{
              color: "var(--text-secondary)",
            }}
          >
            <Paperclip className="h-4 w-4" />
            <input type="file" accept="image/*" className="hidden" onChange={onAttach} />
          </label>
        </div>
        {isTyping ? (
          <button
            onClick={onStop}
            className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors bg-red-500 hover:bg-red-600 text-white"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!value.trim() && !selectedImage}
            className="absolute right-3 bottom-3 rounded-lg p-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: (value.trim() || selectedImage) ? "var(--accent-color)" : "var(--bg-tertiary)",
              color: (value.trim() || selectedImage) ? "#ffffff" : "var(--text-secondary)",
            }}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function SuggestedQueries({ onSelect }: { onSelect: (t: string) => void }) {
  const suggestions = [
    { icon: "📰", text: "Latest news" },
    { icon: "📉", text: "Stock market" },
    { icon: "🌤️", text: "Weather forecast" },
    { icon: "🏀", text: "Sports scores" },
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
          <span className="text-base">{suggestion.icon}</span>
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

let mermaidInitialized = false;

function initializeMermaid() {
  if (mermaidInitialized) return;
  mermaidInitialized = true;
  mermaid.initialize({
    startOnLoad: false,
    suppressErrorRendering: true,
    theme: "base",
    themeVariables: {
      primaryColor: "#6366f1",
      primaryTextColor: "#f8fafc",
      primaryBorderColor: "#475569",
      lineColor: "#475569",
      secondaryColor: "#334155",
      tertiaryColor: "#1e293b",
      background: "#0f172a",
      mainBkg: "#334155",
      nodeBorder: "#475569",
      fontSize: "14px",
    },
    securityLevel: "loose",
  });
}

function MermaidChart({ code, id }: { code: string; id: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (typeof window !== "undefined") {
      initializeMermaid();
      mermaid.render(id, code)
        .then(({ svg }) => {
          if (!cancelled) setSvg(svg);
        })
        .catch((err) => {
          // Silently discard — never show mermaid errors to the user
          console.debug("[MermaidChart] render failed:", err);
          if (!cancelled) setFailed(true);
          // Remove any error SVGs injected by Mermaid
          const errorSvg = document.getElementById(id);
          if (errorSvg) errorSvg.remove();
          const dErrorSvg = document.getElementById(`d${id}`);
          if (dErrorSvg) dErrorSvg.remove();
        });
    }
    return () => { cancelled = true; };
  }, [code, id]);

  // On error or still loading — render nothing visible
  if (failed || !svg) return null;

  return (
    <div
      className="mb-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ maxWidth: "100%", overflowX: "auto" }}
    />
  );
}

function renderTable(lines: string[]): React.ReactNode {
  const rows: string[][] = [];
  const alignments: ("left" | "center" | "right")[] = [];

  for (const line of lines) {
    const cells = line.split("|").filter(c => c.trim() !== "");
    if (cells.length === 0) continue;

    // Check if this is the separator row (contains only -, :, and spaces)
    if (cells.every(c => /^[\s:-]+$/.test(c))) {
      for (const cell of cells) {
        if (cell.includes(":")) {
          if (cell.startsWith(":") && cell.endsWith(":")) alignments.push("center");
          else if (cell.endsWith(":")) alignments.push("right");
          else alignments.push("left");
        } else {
          alignments.push("left");
        }
      }
      continue;
    }

    rows.push(cells.map(c => c.trim()));
  }

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border-color)" }}>
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead style={{ backgroundColor: "var(--bg-tertiary)" }}>
          <tr>
            {rows[0]?.map((cell, i) => (
              <th
                key={i}
                className="px-4 py-2 font-semibold"
                style={{
                  color: "var(--text-primary)",
                  textAlign: alignments[i] || "left",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, ri) => (
            <tr
              key={ri}
              style={{
                backgroundColor: ri % 2 === 0 ? "transparent" : "var(--bg-tertiary)",
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-4 py-2"
                  style={{
                    color: "var(--text-secondary)",
                    textAlign: alignments[ci] || "left",
                    borderBottom: ci === row.length - 1 ? "none" : "1px solid var(--border-color)",
                  }}
                >
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Split on bold, italic, inline-code, links, and images
  const parts = text.split(/(!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    // Image syntax: ![alt](url)
    const img = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      return (
        <RenderableImage key={i} alt={img[1]} src={img[2]} />
      );
    }
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

// ─── Image Modal ─────────────────────────────────────────────────────────────

function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl font-light hover:opacity-80 transition-opacity"
        aria-label="Close"
      >
        ×
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function RenderableImage({ alt, src }: { alt: string; src: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
        style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
        <span>🖼️</span>
        <span>{alt || "Image"}</span>
      </span>
    );
  }

  return (
    <>
      <div className="flex justify-center my-4">
        <img
          src={src}
          alt={alt}
          className="block max-h-[480px] w-auto max-w-full rounded-lg cursor-pointer"
          style={{ boxShadow: "var(--shadow-subtle)" }}
          onClick={() => setIsOpen(true)}
          onError={() => setError(true)}
          loading="lazy"
        />
      </div>
      {isOpen && <ImageModal src={src} alt={alt} onClose={() => setIsOpen(false)} />}
    </>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const lines  = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: { text: string; ordered: boolean }[] = [];
  let isOrdered = false;
  let codeLines: string[]  = [];
  let inCode    = false;
  let codeLang  = "";
  let mermaidId = useMemo(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`, []);

  // Table accumulator
  let tableLines: string[] = [];
  let inTable = false;

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

  const flushTable = (key: string) => {
    if (!tableLines.length) return;
    const table = renderTable(tableLines);
    if (table) nodes.push(<React.Fragment key={key}>{table}</React.Fragment>);
    tableLines = [];
  };

  lines.forEach((line, idx) => {
    const key = String(idx);

    // Code fence
    if (line.startsWith("```")) {
      // Flush any pending table
      if (inTable) { flushTable(key + "t"); inTable = false; }
      flushList(key + "l");

      if (!inCode) {
        inCode = true;
        codeLines = [];
        codeLang = line.slice(3).trim().toLowerCase();
      } else {
        inCode = false;
        const codeContent = codeLines.join("\n");

        // Check if this is a mermaid chart
        if (codeLang === "mermaid" || codeLang === "chart") {
          nodes.push(<MermaidChart key={key} code={codeContent} id={mermaidId + "-" + key} />);
        } else {
          nodes.push(
            <pre key={key} className="mb-4 rounded-xl p-4 overflow-x-auto text-sm font-mono"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
              <code>{codeContent}</code>
            </pre>
          );
        }
      }
      return;
    }
    if (inCode) { codeLines.push(line); return; }

    // Horizontal rule (---, ***, ___)
    const hr = line.match(/^\s*[-*_]{3,}\s*$/);
    if (hr) {
      flushList(key + "l");
      flushTable(key + "t");
      nodes.push(<hr key={key} className="my-4 border-t" style={{ borderColor: "var(--border-color)" }} />);
      return;
    }

    // Headings (match all 6 levels: # through ######)
    const h6 = line.match(/^######\s+(.+)/);
    const h5 = line.match(/^#####\s+(.+)/);
    const h4 = line.match(/^####\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    // Also treat **Entire line** as an h4-style header
    const boldHeader = !h1 && !h2 && !h3 && !h4 && !h5 && !h6 && line.match(/^\*\*([^*]+)\*\*\s*$/);

    if (h6) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h6 key={key} className="text-xs font-medium mt-3 mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h6[1])}</h6>); return; }
    if (h5) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h5 key={key} className="text-sm font-medium mt-4 mb-1.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h5[1])}</h5>); return; }
    if (h4) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h4 key={key} className="text-sm font-semibold mt-5 mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h4[1])}</h4>); return; }
    if (h3) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h3 key={key} className="text-base font-semibold mt-6 mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h3[1])}</h3>); return; }
    if (h2) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h2 key={key} className="text-lg font-semibold mt-7 mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h2[1])}</h2>); return; }
    if (h1) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h1 key={key} className="text-xl font-semibold mt-8 mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h1[1])}</h1>); return; }
    if (boldHeader) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h4 key={key} className="text-sm font-semibold mt-5 mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{boldHeader[1]}</h4>); return; }

    // Table detection (markdown tables start with |)
    const isTableRow = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTableRow) {
      flushList(key + "l");
      inTable = true;
      tableLines.push(line.trim());
      return;
    }
    // Flush table if we were in one and this line isn't a table row
    if (inTable) {
      flushTable(key + "t");
      inTable = false;
    }

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

    // Empty line → flush list and table
    if (!line.trim()) { flushList(key + "l"); flushTable(key + "t"); inTable = false; return; }

    // Paragraph
    flushList(key + "l");
    nodes.push(
      <p key={key} className="mb-3 leading-relaxed" style={{ color: "var(--text-secondary)", fontSize: "0.965rem" }}>
        {renderInline(line)}
      </p>
    );
  });

  flushList("final");
  flushTable("final-t");
  return <>{nodes}</>;
}

function ThinkingLeaf({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState(true);
  
  if (!content) return null;

  return (
    <div className="mb-6 animate-fade-in">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition-all duration-200 hover:bg-[var(--bg-tertiary)]"
        style={{
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-tertiary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="w-1 h-1 rounded-full opacity-60"
                style={{ backgroundColor: "var(--accent-color)", animation: "pulse 2s infinite", animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
          <span className="italic uppercase tracking-wider">Thought Process</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
      </button>
      
      {!collapsed && (
        <div 
          className="mt-3 p-4 rounded-xl text-[0.9rem] leading-relaxed italic border-l-2"
          style={{ 
            backgroundColor: "var(--bg-tertiary)", 
            color: "var(--text-secondary)",
            borderColor: "var(--accent-color)",
            fontFamily: "var(--font-body)"
          }}
        >
          <div className="opacity-80 whitespace-pre-wrap">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cost Badge ───────────────────────────────────────────────────────────────

function CostBadge({ cost, promptTokens, completionTokens }: { cost: number; promptTokens?: number; completionTokens?: number }) {
  // Format: show at least 4 significant digits, e.g. $0.000123 or $0.0023
  const formatted = cost === 0
    ? "$0.0000"
    : cost < 0.0001
    ? `$${cost.toExponential(2)}`
    : `$${cost.toFixed(Math.max(4, 2 - Math.floor(Math.log10(cost))))}`;

  const totalTokens = (promptTokens || 0) + (completionTokens || 0);

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-xs border ml-auto"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
        color: "var(--text-tertiary)",
      }}
      title={`Cost: ${formatted}\nInput: ${promptTokens?.toLocaleString() || 0} tokens\nOutput: ${completionTokens?.toLocaleString() || 0} tokens`}
    >
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

// ─── Model Picker ─────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<"router" | "selector" | "writer", string> = {
  router:   "Router",
  selector: "Selector",
  writer:   "Writer",
};

function ModelPicker({ config, onChange }: { config: ModelConfig; onChange: (c: ModelConfig) => void }) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleUniMode = () => onChange({ ...config, uniMode: !config.uniMode });

  const isCustom = (id: string) => !GEMMA_MODELS.some(m => m.id === id);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-95"
        style={{
          backgroundColor: open ? "var(--bg-tertiary)" : "var(--bg-secondary)",
          color: config.uniMode ? "var(--accent-color)" : "var(--text-secondary)",
          boxShadow: "var(--shadow-subtle)",
        }}
        aria-label="Select agent models"
      >
        <Cpu className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
        <span className="hidden sm:inline">{config.uniMode ? "Uni" : "Models"}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl border p-4 z-50"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          {/* ── Uni Mode Toggle ─────────────────────────────────────── */}
          <div
            className="flex items-center justify-between mb-4 pb-4"
            style={{ borderBottom: "1px solid var(--border-color)" }}
          >
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Uni Mode</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                One model · route + write
              </p>
            </div>
            {/* Pill toggle */}
            <button
              onClick={toggleUniMode}
              className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: config.uniMode ? "var(--accent-color)" : "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
              }}
              aria-pressed={config.uniMode}
              aria-label="Toggle Uni Mode"
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: config.uniMode ? "translateX(20px)" : "translateX(0px)" }}
              />
            </button>
          </div>

          <div className="mb-4">
            <button 
              onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider transition-colors hover:text-[var(--accent-color)]"
              style={{ color: showCustom ? "var(--accent-color)" : "var(--text-tertiary)" }}
            >
              {showCustom ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              <span>{showCustom ? "Done Editing Endpoints" : "Custom Endpoints"}</span>
            </button>
          </div>

          {config.uniMode ? (
            /* ── Uni model selector ─────────────────────────────────── */
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                Uni Model
              </p>
              {showCustom ? (
                <input 
                  type="text"
                  value={config.uni}
                  onChange={(e) => onChange({ ...config, uni: e.target.value })}
                  placeholder="provider/model-id"
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs border outline-none font-mono"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    borderColor: "var(--border-color)",
                    color: "var(--accent-color)",
                  }}
                />
              ) : (
                <select
                  value={isCustom(config.uni) ? "custom" : config.uni}
                  onChange={(e) => {
                    if (e.target.value === "custom") setShowCustom(true);
                    else onChange({ ...config, uni: e.target.value });
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs border appearance-none cursor-pointer outline-none"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {GEMMA_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                  <option value="custom">Custom...</option>
                </select>
              )}
            </div>
          ) : (
            /* ── 3-agent selectors ──────────────────────────────────── */
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                Agent Models
              </p>
              <div className="space-y-3">
                {(Object.keys(AGENT_LABELS) as ("router" | "selector" | "writer")[]).map((agent) => (
                  <div key={agent} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium w-16 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                        {AGENT_LABELS[agent]}
                      </span>
                      {showCustom ? (
                        <input 
                          type="text"
                          value={config[agent]}
                          onChange={(e) => onChange({ ...config, [agent]: e.target.value })}
                          placeholder="provider/model-id"
                          className="flex-1 rounded-lg px-2.5 py-1.5 text-xs border outline-none font-mono"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            borderColor: "var(--border-color)",
                            color: "var(--accent-color)",
                          }}
                        />
                      ) : (
                        <select
                          value={isCustom(config[agent]) ? "custom" : config[agent]}
                          onChange={(e) => {
                            if (e.target.value === "custom") setShowCustom(true);
                            else onChange({ ...config, [agent]: e.target.value });
                          }}
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
                          <option value="custom">Custom...</option>
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] mt-4 leading-snug" style={{ color: "var(--text-tertiary)" }}>
            {showCustom ? "Enter any OpenRouter model ID (e.g. anthropic/claude-3-opus)" : "All models via OpenRouter · Changes apply to next query"}
          </p>
        </div>
      )}
    </div>
  );
}
