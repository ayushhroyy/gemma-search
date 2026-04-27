"use client";

import React, { useState, useEffect } from "react";
import { Menu, X, Plus, Sun, Moon, ArrowRight, Paperclip } from "lucide-react";

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

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSearchQuery(e.target.value);
    setShowPlaceholder(e.target.value === "");
  };

  return (
    <div className={`relative h-screen w-screen overflow-hidden ${mounted ? "" : "no-transition"}`}>
      <div className="grid-background" style={{ width: "100vw", height: "100vh", position: "fixed" }} />

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <Header
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onToggleSidebar={toggleSidebar}
        isSidebarOpen={isSidebarOpen}
        mounted={mounted}
      />

      <main className="relative z-10 flex h-full items-center justify-center px-6">
        <div className="w-full max-w-3xl">
          <Logo />

          <SearchBox
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={showPlaceholder ? placeholders[placeholderIndex] : ""}
          />

          <SuggestedQueries />
        </div>
      </main>
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

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
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
          className="absolute right-3 bottom-3 rounded-lg p-2"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
          }}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SuggestedQueries() {
  const suggestions = [
    { icon: "💡", text: "Explain quantum computing in simple terms" },
    { icon: "🎨", text: "Generate creative writing ideas" },
    { icon: "🔬", text: "Help me analyze research data" },
    { icon: "📝", text: "Draft an email to my team" },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-3 animate-fade-in" style={{ animationDelay: "0.2s" }}>
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          className="flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm transition-all duration-200"
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

function Header({
  isDark,
  onToggleTheme,
  onToggleSidebar,
  isSidebarOpen,
  mounted,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  mounted: boolean;
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-20 px-6 py-4">
      <div className="flex items-center justify-between">
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

        <div className="flex items-center gap-3">
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
            className="rounded-xl px-5 py-2.5 font-medium text-sm transition-all duration-200"
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
