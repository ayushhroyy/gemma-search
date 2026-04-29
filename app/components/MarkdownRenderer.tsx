"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import mermaid from "mermaid";

// Simple ID generator fallback for browsers without crypto.randomUUID
const generateId = () => {
  try {
    if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

// ─── Mermaid ──────────────────────────────────────────────────────────────────

let mermaidInitialized = false;

function initializeMermaid() {
  if (mermaidInitialized) return;
  mermaidInitialized = true;

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      primaryColor: isDark ? "#1a1a1a" : "#ffffff",
      primaryTextColor: isDark ? "#fafafa" : "#0a0a0a",
      primaryBorderColor: isDark ? "#525252" : "#000000",
      lineColor: isDark ? "#a3a3a3" : "#525252",
      secondaryColor: isDark ? "#141414" : "#f5f5f5",
      tertiaryColor: isDark ? "#1a1a1a" : "#f5f5f5",
      background: isDark ? "#141414" : "#ffffff",
      mainBkg: isDark ? "#1a1a1a" : "#ffffff",
      nodeBorder: isDark ? "#525252" : "#000000",
      clusterBkg: isDark ? "#1a1a1a" : "#f5f5f5",
      clusterBorder: isDark ? "#525252" : "#a3a3a3",
      titleColor: isDark ? "#fafafa" : "#0a0a0a",
      edgeLabelBackground: isDark ? "#141414" : "#ffffff",
      fontSize: "16px",
      fontFamily: "Outfit, system-ui, sans-serif",
      labelBackground: isDark ? "#141414" : "#ffffff",
      tertiaryTextColor: isDark ? "#a3a3a3" : "#0a0a0a",
    },
    securityLevel: "loose",
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
      curve: "basis",
    },
  });
}

function MermaidChart({ code, id }: { code: string; id: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (typeof window !== "undefined") {
      mermaidInitialized = false; // re-init to pick up theme
      initializeMermaid();
      mermaid.render(id, code)
        .then(({ svg }) => {
          if (!cancelled) {
            const isDark = document.documentElement.classList.contains("dark");
            const textColor = isDark ? "#fafafa" : "#0a0a0a";
            const bgColor = isDark ? "#141414" : "#ffffff";
            const borderColor = isDark ? "#525252" : "#000000";
            const edgeColor = isDark ? "#a3a3a3" : "#525252";
            const clusterBg = isDark ? "#1a1a1a" : "#f5f5f5";
            const clusterBorder = isDark ? "#525252" : "#a3a3a3";

            const styledSvg = svg
              .replace(
                /<svg([^>]*)>/,
                '<svg$1 style="max-width: 100%; height: auto; display: block; margin: 0 auto;">'
              )
              .replace(
                /<style>([\s\S]*?)<\/style>/,
                `<style>$1 .node rect, .node circle, .node ellipse, .node polygon, .node path { fill: ${bgColor}; stroke: ${borderColor}; stroke-width: 2px; } .node text { font-family: "Outfit", system-ui, sans-serif; font-size: 14px; font-weight: 600; fill: ${textColor}; } .edgeLabel text { font-family: "Outfit", system-ui, sans-serif; font-size: 13px; font-weight: 500; fill: ${textColor}; background-color: ${bgColor}; } .edgePath { stroke: ${edgeColor}; stroke-width: 2px; fill: none; } .cluster rect { fill: ${clusterBg}; stroke: ${clusterBorder}; stroke-width: 1px; } </style>`
              );
            setSvg(styledSvg);
          }
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
          const errorSvg = document.getElementById(id);
          if (errorSvg) errorSvg.remove();
          const dErrorSvg = document.getElementById(`d${id}`);
          if (dErrorSvg) dErrorSvg.remove();
        });
    }
    return () => { cancelled = true; };
  }, [code, id]);

  if (failed || !svg) return null;

  return (
    <div
      className="mb-6 flex justify-center items-center py-4"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{
        maxWidth: "100%",
        overflowX: "auto",
        backgroundColor: "var(--bg-secondary)",
        borderRadius: "12px",
        padding: "20px",
        border: "1px solid var(--border-color)",
      }}
    />
  );
}

// ─── Inline Rendering ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const img = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) return <RenderableImage key={i} alt={img[1]} src={img[2]} />;
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

// ─── Table Rendering ──────────────────────────────────────────────────────────

function renderTable(lines: string[]): React.ReactNode {
  const rows: string[][] = [];
  const alignments: ("left" | "center" | "right")[] = [];

  for (const line of lines) {
    const cells = line.split("|").filter(c => c.trim() !== "");
    if (cells.length === 0) continue;

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
              <th key={i} className="px-4 py-2 font-semibold" style={{
                color: "var(--text-primary)",
                textAlign: alignments[i] || "left",
                borderBottom: "1px solid var(--border-color)",
              }}>
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, ri) => (
            <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? "transparent" : "var(--bg-tertiary)" }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2" style={{
                  color: "var(--text-secondary)",
                  textAlign: alignments[ci] || "left",
                  borderBottom: ci === row.length - 1 ? "none" : "1px solid var(--border-color)",
                }}>
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

// ─── Image Modal ──────────────────────────────────────────────────────────────

function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }} onClick={onClose}>
      <button onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl font-light hover:opacity-80 transition-opacity"
        aria-label="Close">×</button>
      <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()} />
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
        <span>{alt || "Image"}</span>
      </span>
    );
  }

  return (
    <>
      <div className="flex justify-center my-4">
        <img src={src} alt={alt}
          className="block max-h-[480px] w-auto max-w-full rounded-lg cursor-pointer"
          style={{ boxShadow: "var(--shadow-subtle)" }}
          onClick={() => setIsOpen(true)}
          onError={() => setError(true)}
          loading="lazy" />
      </div>
      {isOpen && <ImageModal src={src} alt={alt} onClose={() => setIsOpen(false)} />}
    </>
  );
}

// ─── Markdown Content ─────────────────────────────────────────────────────────

export function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: { text: string; ordered: boolean }[] = [];
  let isOrdered = false;
  let codeLines: string[] = [];
  let inCode = false;
  let codeLang = "";
  let mermaidId = useMemo(() => `mermaid-${generateId().slice(0, 8)}`, []);

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

    if (line.startsWith("```")) {
      if (inTable) { flushTable(key + "t"); inTable = false; }
      flushList(key + "l");
      if (!inCode) {
        inCode = true;
        codeLines = [];
        codeLang = line.slice(3).trim().toLowerCase();
      } else {
        inCode = false;
        const codeContent = codeLines.join("\n");
        if (codeLang === "mermaid" || codeLang === "chart") {
          nodes.push(<MermaidChart key={key} code={codeContent} id={`${mermaidId}-${key}`} />);
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

    const hr = line.match(/^\s*[-*_]{3,}\s*$/);
    if (hr) {
      flushList(key + "l"); flushTable(key + "t");
      nodes.push(<hr key={key} className="my-4 border-t" style={{ borderColor: "var(--border-color)" }} />);
      return;
    }

    const h6 = line.match(/^######\s+(.+)/);
    const h5 = line.match(/^#####\s+(.+)/);
    const h4 = line.match(/^####\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    const boldHeader = !h1 && !h2 && !h3 && !h4 && !h5 && !h6 && line.match(/^\*\*([^*]+)\*\*\s*$/);

    if (h6) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h6 key={key} className="text-xs font-medium mt-3 mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h6[1])}</h6>); return; }
    if (h5) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h5 key={key} className="text-sm font-medium mt-4 mb-1.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h5[1])}</h5>); return; }
    if (h4) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h4 key={key} className="text-sm font-semibold mt-5 mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h4[1])}</h4>); return; }
    if (h3) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h3 key={key} className="text-base font-semibold mt-6 mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h3[1])}</h3>); return; }
    if (h2) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h2 key={key} className="text-lg font-semibold mt-7 mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h2[1])}</h2>); return; }
    if (h1) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h1 key={key} className="text-xl font-semibold mt-8 mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{renderInline(h1[1])}</h1>); return; }
    if (boldHeader) { flushList(key + "l"); flushTable(key + "t"); nodes.push(<h4 key={key} className="text-sm font-semibold mt-5 mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{boldHeader[1]}</h4>); return; }

    const isTableRow = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTableRow) {
      flushList(key + "l");
      inTable = true;
      tableLines.push(line.trim());
      return;
    }
    if (inTable) { flushTable(key + "t"); inTable = false; }

    const ol = line.match(/^(\d+)\.\s+(.+)/);
    if (ol) {
      if (listItems.length && !isOrdered) flushList(key + "l");
      isOrdered = true;
      listItems.push({ text: ol[2], ordered: true });
      return;
    }

    const ul = line.match(/^[-*+]\s+(.+)/);
    if (ul) {
      if (listItems.length && isOrdered) flushList(key + "l");
      isOrdered = false;
      listItems.push({ text: ul[1], ordered: false });
      return;
    }

    if (!line.trim()) { flushList(key + "l"); flushTable(key + "t"); inTable = false; return; }

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

// ─── Thinking Leaf ────────────────────────────────────────────────────────────

export function ThinkingLeaf({ content }: { content: string }) {
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
              <span key={delay} className="w-1 h-1 rounded-full opacity-60"
                style={{ backgroundColor: "var(--accent-color)", animation: "pulse 2s infinite", animationDelay: `${delay}ms` }} />
            ))}
          </div>
          <span className="italic uppercase tracking-wider">Thought Process</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
      </button>

      {!collapsed && (
        <div className="mt-3 p-4 rounded-xl text-[0.9rem] leading-relaxed italic border-l-2"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            borderColor: "var(--accent-color)",
            fontFamily: "var(--font-body)",
          }}>
          <div className="opacity-80 whitespace-pre-wrap">{content}</div>
        </div>
      )}
    </div>
  );
}
