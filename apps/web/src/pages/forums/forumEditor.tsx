import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../../api/client.js";
import { islandInputStyle } from "../../islandUi.js";
import { renderMarkdown, surroundSelection, prefixLines } from "../../lib/markdown.js";
import { islandTheme } from "../../theme.js";
import type { ForumAttachment, ForumMember, ForumUpload } from "../../types.js";

type MdAction = "bold" | "italic" | "strike" | "code" | "quote" | "ul" | "ol" | "link" | "image";

const MD_TOOLBAR: { action: MdAction; glyph: string; title: string }[] = [
  { action: "bold", glyph: "B", title: "Bold" },
  { action: "italic", glyph: "i", title: "Italic" },
  { action: "strike", glyph: "S", title: "Strikethrough" },
  { action: "code", glyph: "</>", title: "Code" },
  { action: "quote", glyph: "❝", title: "Quote" },
  { action: "ul", glyph: "•", title: "Bulleted list" },
  { action: "ol", glyph: "1.", title: "Numbered list" },
  { action: "link", glyph: "🔗", title: "Link" },
  { action: "image", glyph: "🖼", title: "Image" }
];

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
  textareaRef
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = textareaRef ?? internalRef;
  const [preview, setPreview] = useState(false);
  const members = useForumMembers();
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);

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
    let next;
    switch (action) {
      case "bold": next = surroundSelection(value, s, e, "**", "**", "bold text"); break;
      case "italic": next = surroundSelection(value, s, e, "*", "*", "italic text"); break;
      case "strike": next = surroundSelection(value, s, e, "~~", "~~", "struck"); break;
      case "code": next = surroundSelection(value, s, e, "`", "`", "code"); break;
      case "link": next = surroundSelection(value, s, e, "[", "](https://)", "link text"); break;
      case "image": next = surroundSelection(value, s, e, "![", "](https://)", "alt text"); break;
      case "quote": next = prefixLines(value, s, e, "> ", "quote"); break;
      case "ul": next = prefixLines(value, s, e, "- ", "item"); break;
      case "ol": next = prefixLines(value, s, e, "1. ", "item"); break;
    }
    onChange(next.value);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(next.selStart, next.selEnd);
    });
  }

  return (
    <div style={{ display: "grid", gap: 6, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, opacity: preview ? 0.4 : 1, pointerEvents: preview ? "none" : "auto" }}>
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
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onBlur={() => window.setTimeout(() => setMention(null), 150)}
          rows={rows}
          placeholder={placeholder}
          style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
        />
      )}
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
    </div>
  );
}

const MAX_ATTACHMENTS = 10;

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
    const slots = MAX_ATTACHMENTS - uploads.length;
    if (slots <= 0) { setError(`Up to ${MAX_ATTACHMENTS} images per post.`); return; }
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, slots);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
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
    if (added.length) onUploadsChange([...uploads, ...added]);
    // Summarize partial failures (don't let one file's error mask the rest),
    // while still surfacing the server's reason for the last failure.
    if (failed > 0) {
      setError(
        failed === list.length
          ? failed === 1
            ? lastMsg
            : `All ${failed} uploads failed — ${lastMsg}`
          : `${failed} of ${list.length} images failed — ${lastMsg}`
      );
    }
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
