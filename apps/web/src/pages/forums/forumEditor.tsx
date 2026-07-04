import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../../api/client.js";
import { islandInputStyle } from "../../islandUi.js";
import { renderMarkdown, surroundSelection, prefixLines } from "../../lib/markdown.js";
import { islandTheme } from "../../theme.js";
import type { ForumAttachment, ForumMember, ForumUpload } from "../../types.js";

// Toolbar actions that live in the full formatting row (shown on focus, or
// always on touch/no-hover devices). "image" is intentionally excluded here —
// it moves to a persistent "+" attach trigger rendered alongside this row.
type MdAction = "bold" | "italic" | "strike" | "code" | "quote" | "ul" | "ol" | "link";

const MD_TOOLBAR: { action: MdAction; glyph: string; title: string }[] = [
  { action: "bold", glyph: "B", title: "Bold (Ctrl+B)" },
  { action: "italic", glyph: "i", title: "Italic (Ctrl+I)" },
  { action: "strike", glyph: "S", title: "Strikethrough (Ctrl+Shift+X)" },
  { action: "code", glyph: "</>", title: "Code (Ctrl+E)" },
  { action: "quote", glyph: "❝", title: "Quote" },
  { action: "ul", glyph: "•", title: "Bulleted list" },
  { action: "ol", glyph: "1.", title: "Numbered list" },
  { action: "link", glyph: "🔗", title: "Link (Ctrl+K)" }
];

// The small selection-toolbar shown near a text selection on hover-capable
// devices (see FloatingSelectionToolbar below) — a tight subset of the above.
const MINI_TOOLBAR: MdAction[] = ["bold", "italic", "strike", "link"];

const mdToolBtn: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  height: 44,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${islandTheme.color.cardBorder}`,
  background: islandTheme.color.panelMutedBg,
  color: islandTheme.color.textSubtle,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  font: "inherit"
};

const mdToolBtnSm: React.CSSProperties = {
  ...mdToolBtn,
  minWidth: 32,
  minHeight: 32,
  height: 32,
  padding: "0 6px",
  fontSize: 12
};

// Enter-to-continue-list: matches the CURRENT LINE (not the whole value) to
// decide whether Enter should insert a fresh list-item prefix. Captures the
// leading whitespace + the marker + one trailing space, and separately the
// rest of the line's content so we can tell an empty item ("- " with nothing
// typed after it) from a real one.
const BULLET_LINE_RE = /^(\s*)([-*+])(\s)(.*)$/;
const ORDERED_LINE_RE = /^(\s*)(\d+)([.)])(\s)(.*)$/;

/** A bare URL and nothing else — used to gate the paste-onto-selection link-wrap. */
const BARE_URL_RE = /^https?:\/\/\S+$/i;

const MAX_ATTACHMENTS = 10;

/** Result of a batch image upload: what got attached + a user-facing error summary, if any. */
type UploadBatchResult = { added: ForumUpload[]; error: string | null };

/**
 * Shared upload path for every "turn image file(s) into ForumUpload records"
 * flow — the ImageDropzone click/drag target, and MarkdownEditor's inline
 * paste/drop onto the textarea. One function so upload endpoint, size/rate
 * limit handling, and partial-failure messaging never drift between them.
 */
async function uploadForumImages(files: File[], currentCount: number): Promise<UploadBatchResult> {
  const slots = MAX_ATTACHMENTS - currentCount;
  if (slots <= 0) return { added: [], error: `Up to ${MAX_ATTACHMENTS} images per post.` };
  const list = files.filter((f) => f.type.startsWith("image/")).slice(0, slots);
  if (list.length === 0) return { added: [], error: null };
  const added: ForumUpload[] = [];
  let failed = 0;
  let lastMsg = "Upload failed";
  for (const f of list) {
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await apiFetch("/forums/uploads", { method: "POST", body: fd });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "Upload failed");
      added.push(data as ForumUpload);
    } catch (e) {
      failed++;
      if (e instanceof Error && e.message) lastMsg = e.message;
    }
  }
  // Summarize partial failures (don't let one file's error mask the rest),
  // while still surfacing the server's reason for the last failure.
  const error =
    failed > 0
      ? failed === list.length
        ? failed === 1
          ? lastMsg
          : `All ${failed} uploads failed — ${lastMsg}`
        : `${failed} of ${list.length} images failed — ${lastMsg}`
      : null;
  return { added, error };
}

/**
 * Replace `[selStart, selEnd)` in a focused textarea with `text`, undo-stack
 * friendly. Tries `document.execCommand("insertText", …)` first — despite
 * being a legacy API, every browser this project supports still implements
 * it, and it's the only reliable way to keep native Ctrl+Z sane for a
 * programmatic insert (the browser records its own undo entry instead of us
 * clobbering `.value` directly). execCommand mutates the DOM value and fires
 * a real "input" event, which is exactly what a controlled React <textarea>
 * listens for — so the existing `onChange={(e) => …}` on the element fires
 * on its own and we must NOT call `onChange` ourselves on that path (it
 * would double-apply). Falls back to direct value assignment + manual caret
 * restore (same approach as surroundSelection/prefixLines) only when
 * execCommand is unavailable/unsupported (e.g. execCommand missing entirely,
 * or a future browser drops it) and calls `onChange` itself in that case.
 *
 * By default the caret ends up right after the inserted text (native
 * execCommand behavior, mirrored in the fallback). Pass `finalSelection` to
 * land somewhere else instead (e.g. Ctrl+K needs the caret/selection to sit
 * INSIDE the inserted `[]()`/`(https://)` template, not after it) — it's
 * applied identically after either path, so callers never have to reason
 * about execCommand-succeeded vs. fallback timing.
 */
function insertTextAtSelection(
  ta: HTMLTextAreaElement,
  onChange: (v: string) => void,
  selStart: number,
  selEnd: number,
  text: string,
  finalSelection?: { start: number; end: number }
): void {
  ta.focus();
  ta.setSelectionRange(selStart, selEnd);
  let handled = false;
  try {
    handled = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
  } catch {
    handled = false;
  }
  if (!handled) {
    // Fallback: direct value manipulation with manual caret restore.
    const value = ta.value;
    onChange(value.slice(0, selStart) + text + value.slice(selEnd));
  }
  if (finalSelection) {
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(finalSelection.start, finalSelection.end);
    });
  } else if (!handled) {
    const caret = selStart + text.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }
}

// Crew member list for @mention autocomplete — fetched once, module-cached.
let forumMembersCache: ForumMember[] | null = null;
let forumMembersPromise: Promise<ForumMember[]> | null = null;

export function useForumMembers(): ForumMember[] {
  const [members, setMembers] = useState<ForumMember[]>(forumMembersCache ?? []);
  useEffect(() => {
    if (forumMembersCache) { setMembers(forumMembersCache); return; }
    let promise: Promise<ForumMember[]>;
    if (forumMembersPromise) {
      promise = forumMembersPromise;
    } else {
      promise = apiFetch("/forums/members")
        .then((r) => r.json())
        .then((d): ForumMember[] => {
          const list: ForumMember[] = Array.isArray(d?.members) ? d.members : [];
          forumMembersCache = list;
          return list;
        })
        .catch((): ForumMember[] => {
          forumMembersCache = [];
          return [];
        });
      forumMembersPromise = promise;
    }
    let active = true;
    void promise.then((m) => { if (active) setMembers(m); });
    return () => { active = false; };
  }, []);
  return members;
}

export function MarkdownEditor({
  value,
  onChange,
  rows = 8,
  placeholder,
  textareaRef,
  uploads,
  onUploadsChange
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /**
   * The same pending-attachment list/setter the parent panel already passes
   * to its sibling <ImageDropzone>. Optional — when omitted, inline
   * paste/drop of an image file onto the textarea is disabled (falls back to
   * default browser paste behavior) since there'd be nowhere to register the
   * upload for submission. Both current call sites (ForumComposePanel,
   * ForumThreadPanel's reply box) already own this state, so they pass it
   * straight through to both MarkdownEditor and ImageDropzone.
   */
  uploads?: ForumUpload[];
  onUploadsChange?: (next: ForumUpload[]) => void;
}) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = textareaRef ?? internalRef;
  const [preview, setPreview] = useState(false);
  const members = useForumMembers();
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members
      .filter((m) => m.username.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, members]);

  function onTextChange(v: string, cursor: number) {
    onChange(v);
    // Detect an in-progress @mention token immediately left of the cursor.
    const m = /(^|\s)@([a-z0-9._]*)$/i.exec(v.slice(0, cursor));
    setMention(m ? { query: m[2], start: cursor - m[2].length - 1 } : null);
  }

  function insertMention(username: string) {
    const ta = ref.current;
    if (!ta || !mention) return;
    const pos = ta.selectionStart ?? value.length;
    const before = value.slice(0, mention.start);
    const after = value.slice(pos);
    const insert = `@${username} `;
    const next = before + insert + after;
    onChange(next);
    setMention(null);
    const caret = before.length + insert.length;
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
  }

  function apply(action: MdAction) {
    const ta = ref.current;
    if (!ta) return;
    const s = ta.selectionStart ?? value.length;
    const e = ta.selectionEnd ?? value.length;
    // Each branch's replaced span in the ORIGINAL value: surroundSelection
    // always replaces exactly [s, e); prefixLines replaces from the start of
    // the current line (which may be < s) through e. Tracking the exact span
    // here (rather than diffing old/new value afterwards) lets us hand
    // execCommand just the replacement text so native undo stays sane.
    let next;
    let replaceStart = s;
    switch (action) {
      case "bold": next = surroundSelection(value, s, e, "**", "**", "bold text"); break;
      case "italic": next = surroundSelection(value, s, e, "*", "*", "italic text"); break;
      case "strike": next = surroundSelection(value, s, e, "~~", "~~", "struck"); break;
      case "code": next = surroundSelection(value, s, e, "`", "`", "code"); break;
      case "link": next = surroundSelection(value, s, e, "[", "](https://)", "link text"); break;
      case "quote": next = prefixLines(value, s, e, "> ", "quote"); replaceStart = value.lastIndexOf("\n", s - 1) + 1; break;
      case "ul": next = prefixLines(value, s, e, "- ", "item"); replaceStart = value.lastIndexOf("\n", s - 1) + 1; break;
      case "ol": next = prefixLines(value, s, e, "1. ", "item"); replaceStart = value.lastIndexOf("\n", s - 1) + 1; break;
    }
    const insertText = next.value.slice(replaceStart, next.value.length - (value.length - e));
    let handled = false;
    ta.focus();
    ta.setSelectionRange(replaceStart, e);
    try {
      handled = typeof document.execCommand === "function" && document.execCommand("insertText", false, insertText);
    } catch {
      handled = false;
    }
    if (handled) {
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(next.selStart, next.selEnd);
      });
      return;
    }
    onChange(next.value);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(next.selStart, next.selEnd);
    });
  }

  /**
   * Upload image file(s) via the same path ImageDropzone uses, then insert
   * markdown image syntax for each at the current caret and register the
   * upload(s) in the parent's attachment list — shared by textarea paste and
   * textarea drop (item 3a/4 in the spec). No-ops quietly if the parent
   * didn't wire uploads/onUploadsChange (nowhere to register the attachment).
   */
  async function uploadAndInsertImages(files: File[]) {
    if (!onUploadsChange || files.length === 0) return;
    const ta = ref.current;
    setUploadBusy(true);
    setUploadError(null);
    const currentUploads = uploads ?? [];
    const { added, error } = await uploadForumImages(files, currentUploads.length);
    if (added.length) {
      onUploadsChange([...currentUploads, ...added]);
      if (ta) {
        const markdownText = added.map((u) => `![image](${u.url})\n`).join("");
        const pos = ta.selectionStart ?? value.length;
        insertTextAtSelection(ta, onChange, pos, ta.selectionEnd ?? pos, markdownText);
      }
    }
    if (error) setUploadError(error);
    setUploadBusy(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); apply("bold"); return; }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); apply("italic"); return; }
    if (mod && !e.altKey && e.shiftKey && e.key.toLowerCase() === "x") { e.preventDefault(); apply("strike"); return; }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); apply("code"); return; }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const s = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      if (s === end) {
        // No selection: insert an empty template, caret inside the link-text brackets.
        insertTextAtSelection(ta, onChange, s, end, "[]()", { start: s + 1, end: s + 1 });
      } else {
        // Wrap the selection as link text, caret lands inside the URL portion.
        const selected = value.slice(s, end);
        const urlStart = s + 1 + selected.length + 2;
        insertTextAtSelection(ta, onChange, s, end, `[${selected}](https://)`, {
          start: urlStart,
          end: urlStart + "https://".length
        });
      }
      return;
    }

    // Enter-to-continue-list (item 2). Only for a genuine, unmodified Enter
    // keydown while typing — never during IME composition or with a
    // modifier held (Shift+Enter etc. stay as plain newlines). We split at
    // the actual caret (like every other line-splitting Enter press): text
    // left of the caret is tested against the list patterns, text right of
    // the caret carries over onto the new line after the fresh prefix.
    if (e.key === "Enter" && !mod && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing) {
      const pos = ta.selectionStart ?? value.length;
      const selEnd = ta.selectionEnd ?? pos;
      if (pos !== selEnd) return; // let a real (non-collapsed) selection just get replaced normally
      const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
      const beforeCaret = value.slice(lineStart, pos);

      const bulletMatch = BULLET_LINE_RE.exec(beforeCaret);
      const orderedMatch = ORDERED_LINE_RE.exec(beforeCaret);
      if (bulletMatch) {
        const [, indent, marker, , content] = bulletMatch;
        e.preventDefault();
        if (content.trim() === "") {
          // Empty bullet + Enter: exit list mode by clearing the line instead
          // of adding another empty item.
          insertTextAtSelection(ta, onChange, lineStart, pos, "");
        } else {
          insertTextAtSelection(ta, onChange, pos, pos, `\n${indent}${marker} `);
        }
        return;
      }
      if (orderedMatch) {
        const [, indent, num, punct, , content] = orderedMatch;
        e.preventDefault();
        if (content.trim() === "") {
          insertTextAtSelection(ta, onChange, lineStart, pos, "");
        } else {
          const nextNum = Number(num) + 1;
          insertTextAtSelection(ta, onChange, pos, pos, `\n${indent}${nextNum}${punct} `);
        }
        return;
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    // Safari sometimes reports clipboardData.files as undefined rather than
    // an empty FileList on a plain-text paste — guard before iterating.
    const files = e.clipboardData?.files;
    const imageFiles = files && files.length > 0 ? Array.from(files).filter((f) => f.type.startsWith("image/")) : [];
    if (imageFiles.length > 0 && onUploadsChange) {
      e.preventDefault();
      void uploadAndInsertImages(imageFiles);
      return;
    }

    // Bare-URL-onto-selection → turn the selection into a markdown link
    // (only when something is actually selected; otherwise let the paste
    // happen normally so the auto-linkify in renderMarkdown handles it).
    const text = e.clipboardData?.getData("text/plain") ?? "";
    const s = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (s !== end && BARE_URL_RE.test(text.trim())) {
      e.preventDefault();
      const selected = value.slice(s, end);
      insertTextAtSelection(ta, onChange, s, end, `[${selected}](${text.trim()})`);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = e.dataTransfer?.files;
    const imageFiles = files && files.length > 0 ? Array.from(files).filter((f) => f.type.startsWith("image/")) : [];
    if (imageFiles.length === 0 || !onUploadsChange) return;
    e.preventDefault();
    void uploadAndInsertImages(imageFiles);
  }

  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const attachDisabled = !onUploadsChange || uploadBusy || (uploads?.length ?? 0) >= MAX_ATTACHMENTS;

  function updateSelectionState() {
    const ta = ref.current;
    setHasSelection(Boolean(ta && ta.selectionStart !== ta.selectionEnd));
  }

  return (
    <div className="bi-md-editor" style={{ display: "grid", gap: 6, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {onUploadsChange ? (
          <>
            <button
              type="button"
              className="island-btn"
              title="Attach image"
              aria-label="Attach image"
              disabled={attachDisabled}
              onClick={() => attachInputRef.current?.click()}
              style={{ ...mdToolBtn, opacity: preview ? 0.4 : 1, pointerEvents: preview ? "none" : "auto" }}
            >
              {uploadBusy ? "…" : "+"}
            </button>
            <input
              ref={attachInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) void uploadAndInsertImages(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </>
        ) : null}
        <div
          className="bi-md-toolbar-row"
          style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, opacity: preview ? 0.4 : 1, pointerEvents: preview ? "none" : "auto" }}
        >
          {MD_TOOLBAR.map((t) => (
            <button
              key={t.action}
              type="button"
              className="island-btn"
              title={t.title}
              aria-label={t.title}
              onClick={() => apply(t.action)}
              style={{
                ...mdToolBtn,
                fontStyle: t.action === "italic" ? "italic" : "normal",
                textDecoration: t.action === "strike" ? "line-through" : "none",
                fontFamily: t.action === "code" || t.action === "ol" ? islandTheme.font.mono : "inherit"
              }}
            >
              {t.glyph}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="island-btn"
          onClick={() => setPreview((v) => !v)}
          disabled={!preview && value.trim().length === 0}
          style={{
            background: "transparent",
            border: "none",
            color: islandTheme.color.primaryGlow,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            padding: "0 4px",
            font: "inherit",
            opacity: !preview && value.trim().length === 0 ? 0.5 : 1
          }}
        >
          {preview ? "✎ Write" : "👁 Preview"}
        </button>
      </div>
      {preview ? (
        <div
          style={{
            minHeight: rows * 22,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px dashed ${islandTheme.color.cardBorder}`,
            background: islandTheme.color.panelMutedBg,
            fontSize: 14,
            lineHeight: 1.6
          }}
        >
          {value.trim() ? renderMarkdown(value) : <span style={{ color: islandTheme.color.textMuted }}>Nothing to preview yet.</span>}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onBlur={() => { window.setTimeout(() => setMention(null), 150); setHasSelection(false); }}
            onKeyDown={handleKeyDown}
            onKeyUp={updateSelectionState}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }}
            onSelect={updateSelectionState}
            onMouseUp={updateSelectionState}
            rows={rows}
            placeholder={placeholder}
            style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
          />
          <FloatingSelectionToolbar visible={hasSelection} onApply={apply} />
        </div>
      )}
      {uploadError ? (
        <span style={{ fontSize: 12, color: islandTheme.color.dangerSoft }}>{uploadError}</span>
      ) : null}
      {!preview && mention && mentionMatches.length > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 6,
            zIndex: 50,
            minWidth: 220,
            maxWidth: 320,
            background: islandTheme.color.menuBg,
            border: `1px solid ${islandTheme.color.border}`,
            borderRadius: 10,
            boxShadow: islandTheme.shadow.menu,
            overflow: "hidden"
          }}
        >
          {mentionMatches.map((m) => (
            <button
              key={m.username}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 10px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                color: islandTheme.color.textPrimary,
                textAlign: "left"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: 999 }} />
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: 999, background: islandTheme.color.panelMutedBg }} />
              )}
              <span style={{ fontSize: 13, fontWeight: 700 }}>{m.displayName}</span>
              <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>@{m.username}</span>
            </button>
          ))}
        </div>
      ) : null}
      <style>{`
        /*
         * Contextual toolbar (spec item 5): the full formatting row is
         * hidden by default and revealed once the user focuses anywhere
         * within the editor (textarea, its buttons, the mention popup),
         * via :focus-within on the wrapping .bi-md-editor. Plain CSS rather
         * than a focus/blur-driven React state so nothing re-renders (and
         * potentially disturbs textarea selection/caret) just to toggle
         * this row's visibility.
         *
         * Touch/no-hover devices keep it always visible (there's no
         * reliable floating selection toolbar there — see
         * FloatingSelectionToolbar, which is hover-only) so formatting
         * stays reachable.
         */
        .bi-md-toolbar-row { display: none; }
        .bi-md-editor:focus-within .bi-md-toolbar-row { display: flex; }
        @media (hover: none) {
          .bi-md-toolbar-row { display: flex !important; }
          /* No reliable floating toolbar without hover — the always-visible
             row above is the only formatting affordance on these devices. */
          .bi-md-mini-toolbar { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/**
 * Small selection-linked mini-toolbar (spec item 6, desktop-only). Getting a
 * textarea selection's on-screen bounding rect is notoriously fiddly
 * (textareas don't expose per-character geometry like contentEditable does),
 * so this ships the documented, explicitly-acceptable fallback: instead of
 * floating exactly over the selected text, it anchors to a fixed spot in the
 * textarea's own corner whenever a selection exists, and disappears when the
 * selection clears. Hidden entirely on (hover: none) devices via CSS, since
 * touch selection + a corner-anchored popup fights native text-selection
 * handles more than it helps (those devices keep the full row visible
 * instead — see the :focus-within/(hover:none) CSS above).
 */
function FloatingSelectionToolbar({ visible, onApply }: { visible: boolean; onApply: (action: MdAction) => void }) {
  if (!visible) return null;
  return (
    <div
      className="bi-md-mini-toolbar"
      // Mouse-down (not click) + preventDefault so the textarea never loses
      // focus/selection before `onApply` reads it.
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        zIndex: 5,
        display: "flex",
        gap: 3,
        padding: 3,
        borderRadius: 8,
        background: islandTheme.color.menuBg,
        backdropFilter: islandTheme.glass.blurMenu,
        WebkitBackdropFilter: islandTheme.glass.blurMenu,
        border: `1px solid ${islandTheme.color.border}`,
        boxShadow: islandTheme.shadow.menu
      }}
    >
      {MINI_TOOLBAR.map((action) => {
        const t = MD_TOOLBAR.find((m) => m.action === action);
        if (!t) return null;
        return (
          <button
            key={action}
            type="button"
            title={t.title}
            aria-label={t.title}
            onClick={() => onApply(action)}
            style={{
              ...mdToolBtnSm,
              fontStyle: action === "italic" ? "italic" : "normal",
              textDecoration: action === "strike" ? "line-through" : "none"
            }}
          >
            {t.glyph}
          </button>
        );
      })}
    </div>
  );
}

export function ImageDropzone({
  uploads,
  onUploadsChange
}: {
  uploads: ForumUpload[];
  onUploadsChange: (next: ForumUpload[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | File[]) {
    setBusy(true);
    setError(null);
    const { added, error: err } = await uploadForumImages(Array.from(files), uploads.length);
    if (added.length) onUploadsChange([...uploads, ...added]);
    if (err) setError(err);
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "16px 12px",
          borderRadius: 10,
          border: `1.5px dashed ${dragOver ? islandTheme.color.primaryGlow : islandTheme.color.cardBorder}`,
          background: dragOver ? `${islandTheme.color.primary}14` : islandTheme.color.panelMutedBg,
          color: islandTheme.color.textSubtle,
          cursor: "pointer",
          fontSize: 13,
          textAlign: "center"
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 18 }}>🖼️</span>
        {busy ? "Uploading…" : `Drop images here or click to upload (${uploads.length}/${MAX_ATTACHMENTS})`}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ""; }}
        style={{ display: "none" }}
      />
      {error ? <span style={{ fontSize: 12, color: islandTheme.color.dangerSoft }}>{error}</span> : null}
      {uploads.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {uploads.map((u) => (
            <div key={u.id} style={{ position: "relative" }}>
              <img
                src={u.thumbUrl}
                alt=""
                style={{ width: 84, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${islandTheme.color.cardBorder}`, display: "block" }}
              />
              <button
                type="button"
                onClick={() => onUploadsChange(uploads.filter((x) => x.id !== u.id))}
                aria-label="Remove image"
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  border: "none",
                  background: islandTheme.color.dangerSurface,
                  color: islandTheme.color.dangerText,
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AttachmentGallery({ attachments }: { attachments: ForumAttachment[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const count = attachments.length;
  const isOpen = openIdx !== null;

  const close = useCallback(() => setOpenIdx(null), []);
  const step = useCallback(
    (delta: number) => setOpenIdx((i) => (i === null ? i : (i + delta + count) % count)),
    [count]
  );

  // While the lightbox is open: keyboard nav (Esc/←/→), lock background scroll,
  // move focus into the dialog, and restore it to the thumbnail on close.
  // (Hooks must run before the early return below.)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus();
    };
  }, [isOpen, close, step]);

  if (!attachments.length) return null;

  const navBtnStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "none",
    background: "rgba(2,6,23,0.6)",
    color: "#fff",
    fontSize: 28,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
        {attachments.map((a, i) => (
          <button
            key={a.url}
            type="button"
            onClick={(e) => {
              triggerRef.current = e.currentTarget;
              setOpenIdx(i);
            }}
            style={{ padding: 0, border: `1px solid ${islandTheme.color.cardBorder}`, borderRadius: 8, overflow: "hidden", cursor: "zoom-in", background: "none", lineHeight: 0 }}
          >
            <img src={a.thumbUrl} alt="" loading="lazy" style={{ display: "block", maxHeight: 180, maxWidth: 260, objectFit: "cover" }} />
          </button>
        ))}
      </div>
      {openIdx !== null
        ? // Portal to <body>: the post sits inside an IslandCard whose
          // backdrop-filter makes it a containing block for position:fixed (and
          // its overflow:hidden clips), which would otherwise trap the lightbox
          // inside the post box. The portal lets it cover the real viewport.
          createPortal(
            <div
              ref={overlayRef}
              tabIndex={-1}
              onClick={close}
              role="dialog"
              aria-modal="true"
              aria-label="Image viewer"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(2,6,23,0.88)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                cursor: "zoom-out",
                padding: 24,
                outline: "none"
              }}
            >
              {count > 1 ? (
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  style={{ ...navBtnStyle, left: 16 }}
                >
                  ‹
                </button>
              ) : null}
              <img
                src={attachments[openIdx].url}
                alt=""
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: count > 1 ? "86%" : "96%", maxHeight: "96%", objectFit: "contain", borderRadius: 8, boxShadow: islandTheme.shadow.menu, cursor: "default" }}
              />
              {count > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Next image"
                    onClick={(e) => { e.stopPropagation(); step(1); }}
                    style={{ ...navBtnStyle, right: 16 }}
                  >
                    ›
                  </button>
                  <div
                    aria-hidden="true"
                    style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: 13, background: "rgba(2,6,23,0.6)", padding: "4px 10px", borderRadius: 999 }}
                  >
                    {openIdx + 1} / {count}
                  </div>
                </>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
