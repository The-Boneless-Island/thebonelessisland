// Safe-subset Markdown renderer for forum bodies.
//
// SECURITY CONTRACT (do not weaken):
//   * Output is ALWAYS React elements. We never use dangerouslySetInnerHTML,
//     so any text content is auto-escaped by React. Raw HTML in the source
//     (`<script>`, `<img onerror>`, …) is matched by nothing here and therefore
//     renders as literal, inert text.
//   * Links become <a> only for http(s): URLs. Any other scheme
//     (javascript:, data:, vbscript:, mailto:, …) renders as plain text.
//   * Images render only for https: URLs or same-origin paths (starting "/").
//     This is what the forum upload pipeline serves; everything else stays text.
//
// Supported: **bold**, *italic* / _italic_, ~~strike~~, `code`, fenced ```code```,
// [text](url), bare http(s) URLs, ![alt](url) images, > blockquotes,
// - / * / + bullet lists, 1. ordered lists, and --- horizontal rules.

import type { CSSProperties, ReactNode } from "react";
import { islandTheme } from "../theme.js";

const codeStyle: CSSProperties = {
  background: islandTheme.color.panelMutedBg,
  padding: "1px 5px",
  borderRadius: 4,
  fontSize: "0.92em"
};

const preStyle: CSSProperties = {
  margin: "8px 0",
  padding: "10px 12px",
  borderRadius: 8,
  background: islandTheme.color.panelMutedBg,
  border: `1px solid ${islandTheme.color.cardBorder}`,
  overflowX: "auto",
  fontSize: 12.5,
  whiteSpace: "pre"
};

const linkStyle: CSSProperties = { color: islandTheme.color.primaryGlow, wordBreak: "break-word" };

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/** Image src is allowed only from https or a same-origin absolute path. */
function isSafeImageSrc(url: string): boolean {
  const u = url.trim();
  return /^https:\/\//i.test(u) || u.startsWith("/");
}

// ── Inline parsing ───────────────────────────────────────────────────────────
// One regex, alternation ordered so multi-char markers win over single-char.
// Italics use ONLY asterisks (not underscores) so snake_case identifiers and
// underscores inside URLs are never mangled.
const INLINE_RE = new RegExp(
  [
    "!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)", // 1=alt 2=src   image
    "\\[([^\\]]+)\\]\\(([^)\\s]+)\\)", // 3=text 4=href  link
    "\\*\\*([^*]+)\\*\\*", // 5  bold
    "~~([^~]+)~~", // 6  strikethrough
    "\\*([^*\\n]+)\\*", // 7  italic
    "`([^`\\n]+)`", // 8  inline code
    "(https?:\\/\\/[^\\s<>\"')]+)", // 9  bare URL
    "(?<![a-z0-9._])@([a-z0-9._]{2,32})" // 10 @mention (lookbehind: not part of an email)
  ].join("|"),
  "gi"
);

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[1] !== undefined && m[2] !== undefined) {
      // image
      if (isSafeImageSrc(m[2])) {
        nodes.push(
          <img
            key={key}
            src={m[2]}
            alt={m[1]}
            loading="lazy"
            style={{ maxWidth: "100%", borderRadius: 8, border: `1px solid ${islandTheme.color.cardBorder}`, display: "block", margin: "6px 0" }}
          />
        );
      } else {
        nodes.push(m[0]);
      }
    } else if (m[3] !== undefined && m[4] !== undefined) {
      // link
      if (isHttpUrl(m[4])) {
        nodes.push(
          <a key={key} href={m[4]} target="_blank" rel="noopener noreferrer nofollow" style={linkStyle}>
            {m[3]}
          </a>
        );
      } else {
        nodes.push(m[0]);
      }
    } else if (m[5] !== undefined) {
      nodes.push(<strong key={key}>{m[5]}</strong>);
    } else if (m[6] !== undefined) {
      nodes.push(<s key={key}>{m[6]}</s>);
    } else if (m[7] !== undefined) {
      nodes.push(<em key={key}>{m[7]}</em>);
    } else if (m[8] !== undefined) {
      nodes.push(<code key={key} className="island-mono" style={codeStyle}>{m[8]}</code>);
    } else if (m[9] !== undefined) {
      nodes.push(
        <a key={key} href={m[9]} target="_blank" rel="noopener noreferrer nofollow" style={linkStyle}>
          {m[9]}
        </a>
      );
    } else if (m[10] !== undefined) {
      nodes.push(
        <span key={key} style={{ color: islandTheme.color.primaryGlow, fontWeight: 600 }}>@{m[10]}</span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ── Block parsing ────────────────────────────────────────────────────────────

const HR_RE = /^\s*([-*_])\1{2,}\s*$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

/** Render a non-fenced text segment into block nodes. */
function renderTextBlocks(segment: string, keyBase: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const lines = segment.split("\n");
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join("\n");
    if (text.trim().length > 0) {
      blocks.push(
        <p key={`${keyBase}-p${blocks.length}`} style={{ margin: "6px 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {renderInline(text, `${keyBase}-p${blocks.length}`)}
        </p>
      );
    }
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }
    if (HR_RE.test(line)) {
      flushPara();
      blocks.push(<hr key={`${keyBase}-hr${blocks.length}`} style={{ border: "none", borderTop: `1px solid ${islandTheme.color.cardBorder}`, margin: "12px 0" }} />);
      i++;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      flushPara();
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(lines[i].replace(QUOTE_RE, "$1"));
        i++;
      }
      blocks.push(
        <blockquote
          key={`${keyBase}-q${blocks.length}`}
          style={{
            margin: "6px 0",
            padding: "4px 12px",
            borderLeft: `3px solid ${islandTheme.color.primaryGlow}`,
            color: islandTheme.color.textSubtle,
            background: islandTheme.color.panelMutedBg,
            borderRadius: "0 8px 8px 0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {renderInline(quoted.join("\n"), `${keyBase}-q${blocks.length}`)}
        </blockquote>
      );
      continue;
    }
    if (BULLET_RE.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].replace(BULLET_RE, "$1"));
        i++;
      }
      blocks.push(
        <ul key={`${keyBase}-ul${blocks.length}`} style={{ margin: "6px 0", paddingLeft: 22 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ margin: "2px 0", wordBreak: "break-word" }}>{renderInline(it, `${keyBase}-ul${blocks.length}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (ORDERED_RE.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(lines[i].replace(ORDERED_RE, "$1"));
        i++;
      }
      blocks.push(
        <ol key={`${keyBase}-ol${blocks.length}`} style={{ margin: "6px 0", paddingLeft: 22 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ margin: "2px 0", wordBreak: "break-word" }}>{renderInline(it, `${keyBase}-ol${blocks.length}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }
    // plain paragraph line
    para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

/**
 * Render markdown source to React nodes. Pure, safe, no HTML injection.
 * Plain text passes through unchanged (graceful on legacy plaintext posts).
 */
export function renderMarkdown(source: string): ReactNode {
  if (!source) return null;
  const blocks: ReactNode[] = [];
  // Fenced code blocks split the document; odd segments are verbatim code.
  const parts = source.split(/```/);
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {
      // Drop an optional language hint on the opening fence's first line.
      const firstNl = part.indexOf("\n");
      const code = firstNl >= 0 && !/\s/.test(part.slice(0, firstNl)) ? part.slice(firstNl + 1) : part;
      blocks.push(
        <pre key={`pre${pi}`} className="island-mono" style={preStyle}>
          {code.replace(/\n$/, "")}
        </pre>
      );
      return;
    }
    blocks.push(...renderTextBlocks(part, `s${pi}`));
  });
  return <>{blocks}</>;
}

// ── Composer text helpers (used by the markdown toolbar) ─────────────────────

export type MdSelection = { value: string; selStart: number; selEnd: number };

/** Wrap the current selection with `before`/`after`, or insert a placeholder. */
export function surroundSelection(
  value: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
  placeholder: string
): MdSelection {
  const selected = value.slice(selStart, selEnd) || placeholder;
  const next = value.slice(0, selStart) + before + selected + after + value.slice(selEnd);
  return {
    value: next,
    selStart: selStart + before.length,
    selEnd: selStart + before.length + selected.length
  };
}

/** Prefix each line of the selection (or current line) with `prefix`. */
export function prefixLines(
  value: string,
  selStart: number,
  selEnd: number,
  prefix: string,
  placeholder: string
): MdSelection {
  const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  const block = value.slice(lineStart, selEnd) || placeholder;
  const prefixed = block
    .split("\n")
    .map((l, idx) => (typeof prefix === "string" && prefix.includes("1.") ? `${idx + 1}. ${l}` : `${prefix}${l}`))
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(selEnd);
  return { value: next, selStart: lineStart, selEnd: lineStart + prefixed.length };
}
