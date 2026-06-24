import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandButton, IslandCard, IslandTag } from "../../islandUi.js";
import { renderMarkdown } from "../../lib/markdown.js";
import { islandTheme } from "../../theme.js";
import type {
  ForumPoll,
  ForumPost,
  ForumReactionKey,
  ForumRelatedThread,
  ForumThreadDetail,
  ForumUpload,
  MeProfile
} from "../../types.js";
import { AttachmentGallery, ImageDropzone, MarkdownEditor } from "./forumEditor.js";
import { formatAbsolute, formatRelative, listRowStyle, REACTION_META } from "./forumShared.js";
import { BackLink, GameChip, LinkPreviewCard, PinGlyph, LockGlyph, TypeChip } from "./forumUi.js";

const ghostBtn: CSSProperties = {
  background: "transparent",
  border: `1px solid ${islandTheme.color.cardBorder}`,
  color: islandTheme.color.textSubtle,
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
  font: "inherit"
};

export function ForumThreadPanel({
  threadId,
  targetPostId,
  profile,
  isAdmin,
  onBack,
  onCategory,
  onSelectThread
}: {
  threadId: number;
  targetPostId?: number;
  profile: MeProfile | null;
  isAdmin: boolean;
  onBack: () => void;
  onCategory: (slug: string) => void;
  onSelectThread: (id: number) => void;
}) {
  const [thread, setThread] = useState<ForumThreadDetail | null>(null);
  const [posts, setPosts] = useState<ForumPost[] | null>(null);
  const [related, setRelated] = useState<ForumRelatedThread[]>([]);
  // Reply drafts survive accidental navigation within the session.
  const replyDraftKey = `bi:forum-reply:${threadId}`;
  const [reply, setReply] = useState(() => sessionStorage.getItem(replyDraftKey) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [replyUploads, setReplyUploads] = useState<ForumUpload[]>([]);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (reply) sessionStorage.setItem(replyDraftKey, reply);
    else sessionStorage.removeItem(replyDraftKey);
  }, [reply, replyDraftKey]);
  const load = useCallback(async () => {
    const r = await apiFetch(`/forums/threads/${threadId}`).then((r) => r.json()).catch(() => null);
    if (!r || !r.thread) {
      setError("Thread not found");
      return;
    }
    setThread(r.thread);
    setPosts(r.posts ?? []);
  }, [threadId]);

  useEffect(() => { void load(); }, [load]);

  // Related threads: same game tag first, then same category.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/forums/threads/${threadId}/related`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setRelated(Array.isArray(d?.threads) ? d.threads : []); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [threadId]);

  // Once posts are present: scroll to a deep-linked post, else to the unread
  // divider (new replies since the last visit).
  useEffect(() => {
    if (!posts) return;
    if (targetPostId) {
      const el = document.getElementById(`post-${targetPostId}`);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (thread?.firstUnreadPostId) {
      const el = document.getElementById("forum-unread-divider");
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, targetPostId, thread?.firstUnreadPostId]);

  async function toggleSubscribe() {
    if (!thread) return;
    const next = !thread.subscribed;
    setThread({ ...thread, subscribed: next });
    try {
      await apiFetch(`/forums/threads/${threadId}/subscribe`, { method: next ? "POST" : "DELETE" });
    } catch {
      setThread((t) => (t ? { ...t, subscribed: !next } : t));
    }
  }

  async function votePoll(optionIds: number[]) {
    if (!thread?.poll) return;
    try {
      const r = await apiFetch(`/forums/polls/${thread.poll.id}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionIds })
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.poll) setThread((t) => (t ? { ...t, poll: data.poll } : t));
    } catch {
      /* ignore — keep prior state */
    }
  }

  function copyPermalink(postId: number) {
    const url = `${window.location.origin}/forums/thread/${threadId}/post/${postId}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(postId);
      window.setTimeout(() => setCopied((c) => (c === postId ? null : c)), 1500);
    }).catch(() => undefined);
  }

  async function postReply() {
    if ((!reply.trim() && replyUploads.length === 0) || busy || !thread) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(`/forums/threads/${threadId}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: reply.trim() || "(image)",
          ...(replyUploads.length ? { uploadIds: replyUploads.map((u) => u.id) } : {})
        })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "Reply failed");
      setReply("");
      setReplyUploads([]);
      sessionStorage.removeItem(replyDraftKey);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply failed");
    } finally {
      setBusy(false);
    }
  }

  async function reactPost(postId: number, reaction: ForumReactionKey) {
    setPosts((cur) => cur?.map((p) => {
      if (p.id !== postId) return p;
      const has = p.myReactions.includes(reaction);
      const reactions = { ...p.reactions };
      const nextCount = Math.max(0, (reactions[reaction] ?? 0) + (has ? -1 : 1));
      if (nextCount === 0) delete reactions[reaction];
      else reactions[reaction] = nextCount;
      return {
        ...p,
        reactions,
        myReactions: has ? p.myReactions.filter((r) => r !== reaction) : [...p.myReactions, reaction]
      };
    }) ?? cur);
    try {
      await apiFetch(`/forums/posts/${postId}/react`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reaction })
      });
    } catch {
      void load();
    }
  }

  function quotePost(post: ForumPost) {
    const quoted = post.body.split("\n").map((l) => `> ${l}`).join("\n");
    const block = `${quoted}\n\n`;
    setReply((cur) => (cur.trim() ? `${cur.replace(/\s*$/, "")}\n\n${block}` : block));
    requestAnimationFrame(() => {
      replyRef.current?.focus();
      replyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function deletePost(postId: number) {
    if (!window.confirm("Delete this post?")) return;
    await apiFetch(`/forums/posts/${postId}`, { method: "DELETE" });
    await load();
  }

  async function editPost(postId: number, currentBody: string) {
    const next = window.prompt("Edit your post:", currentBody);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0) return;
    await apiFetch(`/forums/posts/${postId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: trimmed })
    });
    await load();
  }

  async function reportPost(postId: number) {
    const reason = window.prompt("Reason for report?");
    if (!reason || reason.trim().length === 0) return;
    await apiFetch(`/forums/posts/${postId}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() })
    });
    window.alert("Reported. A mod will review.");
  }

  async function modAction(field: "isPinned" | "isLocked", value: boolean) {
    await apiFetch(`/forums/threads/${threadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: value })
    });
    await load();
  }

  async function deleteThread() {
    if (!window.confirm("Delete entire thread?")) return;
    await apiFetch(`/forums/threads/${threadId}`, { method: "DELETE" });
    onBack();
  }

  function focusReply() {
    replyRef.current?.focus();
    replyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (error) {
    return (
      <IslandCard>
        <BackLink onClick={onBack} label="← Forum home" />
        <p style={{ marginTop: 12, color: islandTheme.color.dangerText }}>{error}</p>
      </IslandCard>
    );
  }
  if (!thread || !posts) {
    return (
      <IslandCard>
        <BackLink onClick={onBack} label="← Forum home" />
        <p style={{ marginTop: 12, color: islandTheme.color.textSubtle }}>Loading…</p>
      </IslandCard>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        className="bi-forum-sticky-head"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 10,
          background: islandTheme.color.panelBg,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          backdropFilter: islandTheme.glass.blur,
          WebkitBackdropFilter: islandTheme.glass.blur,
          boxShadow: islandTheme.shadow.cardIdle
        }}
      >
        <TypeChip type={thread.threadType} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {thread.title}
        </span>
        {!thread.isLocked ? (
          <IslandButton variant="primary" onClick={focusReply} style={{ padding: "0.34rem 0.7rem", fontSize: 13, flexShrink: 0 }}>
            Reply
          </IslandButton>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <BackLink onClick={onBack} label="← Forum home" />
        <span style={{ color: islandTheme.color.textMuted, fontSize: 13 }}>/</span>
        <button
          type="button"
          className="island-btn"
          onClick={() => onCategory(thread.categorySlug)}
          style={{
            background: "transparent",
            border: "none",
            color: thread.categoryAccent,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
            font: "inherit"
          }}
        >
          {thread.categoryIcon} {thread.categoryName}
        </button>
      </div>

      <IslandCard
        style={{
          background: `linear-gradient(135deg, ${thread.categoryAccent}22 0%, ${islandTheme.color.panelBg} 80%)`,
          padding: 18
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {thread.isPinned ? <PinGlyph /> : null}
              {thread.isLocked ? <LockGlyph /> : null}
              <TypeChip type={thread.threadType} />
              {thread.title}
            </h1>
            <div style={{ marginTop: 6, fontSize: 12, color: islandTheme.color.textMuted }}>
              {posts.length} post{posts.length === 1 ? "" : "s"} · {thread.viewCount.toLocaleString()} views · started {formatRelative(thread.createdAt)}
              {thread.game ? <GameChip game={thread.game} /> : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ModButton onClick={toggleSubscribe}>
              {thread.subscribed ? "🔔 Following" : "🔕 Follow"}
            </ModButton>
            {isAdmin ? (
              <>
                <ModButton onClick={() => modAction("isPinned", !thread.isPinned)}>
                  {thread.isPinned ? "Unpin" : "Pin"}
                </ModButton>
                <ModButton onClick={() => modAction("isLocked", !thread.isLocked)}>
                  {thread.isLocked ? "Unlock" : "Lock"}
                </ModButton>
                <ModButton onClick={deleteThread} danger>
                  Delete
                </ModButton>
              </>
            ) : null}
          </div>
        </div>
        {thread.linkUrl ? <LinkPreviewCard linkUrl={thread.linkUrl} preview={thread.linkPreview ?? null} /> : null}
      </IslandCard>

      {thread.poll ? <PollCard poll={thread.poll} onVote={votePoll} /> : null}

      {posts.map((post, idx) => (
        <Fragment key={post.id}>
          {thread.firstUnreadPostId === post.id && idx > 0 ? <UnreadDivider /> : null}
          <PostCard
            post={post}
            idx={idx + 1}
            canEdit={profile?.discordUserId === post.author.discordUserId || isAdmin}
            isOwner={profile?.discordUserId === post.author.discordUserId}
            copied={copied === post.id}
            onReact={(reaction) => reactPost(post.id, reaction)}
            onQuote={thread.isLocked ? undefined : () => quotePost(post)}
            onCopyLink={() => copyPermalink(post.id)}
            onEdit={() => editPost(post.id, post.body)}
            onDelete={() => deletePost(post.id)}
            onReport={() => reportPost(post.id)}
          />
        </Fragment>
      ))}

      {thread.isLocked ? (
        <IslandCard>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            🔒 This thread is locked. New replies are disabled.
          </p>
        </IslandCard>
      ) : (
        <IslandCard>
          <h3 style={{ margin: 0, marginBottom: 8, fontSize: 13, fontWeight: 700, color: islandTheme.color.textMuted }}>
            Post a reply
          </h3>
          <MarkdownEditor
            value={reply}
            onChange={setReply}
            rows={5}
            textareaRef={replyRef}
            placeholder="Be cool. Stay on topic. **bold**, *italic*, > quote, lists, `code`…"
          />
          <div style={{ marginTop: 10 }}>
            <ImageDropzone uploads={replyUploads} onUploadsChange={setReplyUploads} />
          </div>
          {error ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
              {reply.length} char{reply.length === 1 ? "" : "s"} · earns ₦1
            </span>
            <IslandButton variant="primary" onClick={postReply} disabled={busy || (reply.trim().length < 2 && replyUploads.length === 0)}>
              {busy ? "Posting…" : "Post Reply"}
            </IslandButton>
          </div>
        </IslandCard>
      )}

      <RelatedThreadsCard related={related} onSelect={onSelectThread} />
    </div>
  );
}

function PostCard({
  post,
  idx,
  canEdit,
  isOwner,
  copied,
  onReact,
  onQuote,
  onCopyLink,
  onEdit,
  onDelete,
  onReport
}: {
  post: ForumPost;
  idx: number;
  canEdit: boolean;
  isOwner: boolean;
  copied: boolean;
  onReact: (reaction: ForumReactionKey) => void;
  onQuote?: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  return (
    <IslandCard
      id={`post-${post.id}`}
      style={{
        padding: 0,
        overflow: "hidden",
        scrollMarginTop: 80,
        borderColor: post.isOp ? islandTheme.color.primaryGlow : islandTheme.color.cardBorder
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr",
          gap: 0
        }}
      >
        <div
          style={{
            borderRight: `1px solid ${islandTheme.color.cardBorder}`,
            padding: 14,
            background: islandTheme.color.panelMutedBg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8
          }}
        >
          {post.author.avatarUrl ? (
            <img
              src={post.author.avatarUrl}
              alt={post.author.displayName}
              style={{ width: 64, height: 64, borderRadius: 999, border: `2px solid ${islandTheme.color.border}` }}
            />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 999, background: islandTheme.color.panelBg }} />
          )}
          <div style={{ fontSize: 13, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>
            {post.author.displayName}
          </div>
          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            @{post.author.username}
          </div>
          {post.isOp ? <IslandTag tone="primary">Op</IslandTag> : null}
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, color: islandTheme.color.textMuted, gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <a
                href={`/forums/thread/${post.threadId}/post/${post.id}`}
                onClick={(e) => { e.preventDefault(); onCopyLink(); }}
                title="Copy link to this post"
                style={{ color: islandTheme.color.textMuted, textDecoration: "none", fontWeight: 700 }}
              >
                #{idx}
              </a>
              <span>· {formatAbsolute(post.createdAt)}</span>
              <button
                type="button"
                className="island-btn"
                onClick={onCopyLink}
                title="Copy permalink"
                aria-label="Copy permalink"
                style={{ background: "transparent", border: "none", color: copied ? islandTheme.color.successSoft : islandTheme.color.textMuted, cursor: "pointer", font: "inherit", fontSize: 12, padding: 0 }}
              >
                {copied ? "✓ copied" : "🔗"}
              </button>
            </span>
            {post.editedAt ? <span style={{ fontStyle: "italic" }}>edited {formatRelative(post.editedAt)}</span> : null}
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxWidth: islandTheme.prose.readable.maxWidth,
              color: post.isDeleted ? islandTheme.color.textMuted : islandTheme.color.textPrimary,
              fontStyle: post.isDeleted ? "italic" : "normal"
            }}
          >
            {post.isDeleted ? "[deleted]" : renderMarkdown(post.body)}
          </div>
          {!post.isDeleted && post.attachments.length > 0 ? <AttachmentGallery attachments={post.attachments} /> : null}
          {!post.isDeleted ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              {REACTION_META.map((r) => {
                const count = post.reactions[r.key] ?? 0;
                const mine = post.myReactions.includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    className="island-btn"
                    onClick={() => onReact(r.key)}
                    title={r.label}
                    aria-label={`${r.label}${count ? ` (${count})` : ""}`}
                    aria-pressed={mine}
                    style={{
                      background: mine ? islandTheme.color.primary : islandTheme.color.panelMutedBg,
                      color: mine ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
                      border: `1px solid ${mine ? islandTheme.color.primary : islandTheme.color.cardBorder}`,
                      borderRadius: 999,
                      padding: count > 0 ? "4px 10px 4px 8px" : "4px 8px",
                      fontSize: 13,
                      lineHeight: 1,
                      cursor: "pointer",
                      font: "inherit",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <span aria-hidden="true">{r.emoji}</span>
                    {count > 0 ? <span style={{ fontSize: 12, fontWeight: 700 }}>{count}</span> : null}
                  </button>
                );
              })}
              <span aria-hidden="true" style={{ width: 1, alignSelf: "stretch", background: islandTheme.color.cardBorder, margin: "2px 2px" }} />
              {onQuote ? (
                <button type="button" className="island-btn" onClick={onQuote} style={ghostBtn}>Quote</button>
              ) : null}
              {canEdit ? (
                <button type="button" className="island-btn" onClick={onEdit} style={ghostBtn}>Edit</button>
              ) : null}
              {canEdit ? (
                <button type="button" className="island-btn" onClick={onDelete} style={{ ...ghostBtn, color: islandTheme.color.dangerText }}>Delete</button>
              ) : null}
              {!isOwner ? (
                <button type="button" className="island-btn" onClick={onReport} style={ghostBtn}>Report</button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </IslandCard>
  );
}

function PollCard({ poll, onVote }: { poll: ForumPoll; onVote: (optionIds: number[]) => void }) {
  const closed = poll.closesAt ? new Date(poll.closesAt).getTime() < Date.now() : false;
  const total = poll.options.reduce((s, o) => s + o.votes, 0);

  function toggle(id: number) {
    if (closed) return;
    if (poll.multi) {
      const next = poll.myVotes.includes(id) ? poll.myVotes.filter((x) => x !== id) : [...poll.myVotes, id];
      onVote(next);
    } else {
      onVote(poll.myVotes.includes(id) ? [] : [id]);
    }
  }

  return (
    <IslandCard style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 16 }}>📊</span>
        <span className="island-display" style={{ fontSize: 16, fontWeight: 700 }}>{poll.question}</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {poll.options.map((o) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const mine = poll.myVotes.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              disabled={closed}
              style={{
                position: "relative",
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 8,
                overflow: "hidden",
                border: `1px solid ${mine ? islandTheme.color.primaryGlow : islandTheme.color.cardBorder}`,
                background: islandTheme.color.panelMutedBg,
                cursor: closed ? "default" : "pointer",
                font: "inherit",
                color: islandTheme.color.textPrimary
              }}
            >
              <div
                aria-hidden="true"
                style={{ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${islandTheme.color.primary}33`, transition: "width 240ms ease" }}
              />
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: mine ? 800 : 600 }}>{mine ? "✓ " : ""}{o.label}</span>
                <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, flexShrink: 0 }}>{pct}% · {o.votes}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {poll.totalVoters} voter{poll.totalVoters === 1 ? "" : "s"}
        {poll.multi ? " · multiple choice" : ""}
        {closed ? " · closed" : poll.closesAt ? ` · closes ${formatRelative(poll.closesAt)}` : ""}
        {poll.myVotes.length === 0 && !closed ? " · tap to vote" : ""}
      </div>
    </IslandCard>
  );
}

function UnreadDivider() {
  return (
    <div id="forum-unread-divider" style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 4px", scrollMarginTop: 80 }}>
      <div style={{ flex: 1, height: 1, background: islandTheme.color.primaryGlow, opacity: 0.5 }} />
      <span className="island-mono" style={{ fontSize: 11, fontWeight: 700, color: islandTheme.color.primaryGlow, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
        New since your last visit
      </span>
      <div style={{ flex: 1, height: 1, background: islandTheme.color.primaryGlow, opacity: 0.5 }} />
    </div>
  );
}

function ModButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      style={{
        background: danger ? islandTheme.color.dangerSurface : islandTheme.color.panelMutedBg,
        color: danger ? islandTheme.color.dangerText : islandTheme.color.textSubtle,
        border: `1px solid ${danger ? islandTheme.color.danger : islandTheme.color.cardBorder}`,
        borderRadius: 999,
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        font: "inherit"
      }}
    >
      {children}
    </button>
  );
}

function RelatedThreadsCard({ related, onSelect }: { related: ForumRelatedThread[]; onSelect: (id: number) => void }) {
  if (related.length === 0) return null;
  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <div
        className="island-mono"
        style={{
          padding: "12px 16px",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: islandTheme.color.textMuted,
          borderBottom: `1px solid ${islandTheme.color.cardBorder}`
        }}
      >
        Related threads
      </div>
      {related.map((t, i) => (
        <button
          key={t.id}
          type="button"
          className="island-btn"
          onClick={() => onSelect(t.id)}
          style={listRowStyle(i === 0)}
          onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, minWidth: 0 }}>
            <TypeChip type={t.threadType} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
            <span style={{ color: t.categoryAccent }}>{t.categoryIcon} {t.categoryName}</span>
            {" · "}{t.replyCount} repl{t.replyCount === 1 ? "y" : "ies"}
            {" · "}{formatRelative(t.lastReplyAt ?? t.createdAt)}
          </div>
        </button>
      ))}
    </IslandCard>
  );
}
