import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandButton, IslandCard, islandInputStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import { GameCover } from "../../steamArt.js";
import type { CrewOwnedGame, ForumCategory, ForumThreadType, ForumUpload } from "../../types.js";
import { ImageDropzone, MarkdownEditor } from "./forumEditor.js";
import { POST_TYPES, POST_TYPE_BY_KEY } from "./forumShared.js";
import { BackLink } from "./forumUi.js";

export function ForumComposePanel({
  categorySlug,
  initialType,
  crewGames,
  isAdmin,
  onCancel,
  onCreated
}: {
  categorySlug: string;
  initialType?: ForumThreadType;
  crewGames: CrewOwnedGame[];
  isAdmin: boolean;
  onCancel: () => void;
  onCreated: (threadId: number) => void;
}) {
  // Compose drafts survive accidental navigation within the session.
  const draftKey = `bi:forum-compose:${categorySlug}`;
  const draft = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as
        | { title?: string; body?: string; type?: ForumThreadType; linkUrl?: string }
        | null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [type, setType] = useState<ForumThreadType>(initialType ?? draft?.type ?? "discussion");
  const [linkUrl, setLinkUrl] = useState(draft?.linkUrl ?? "");
  // Uploads aren't persisted in the draft (server-side ids), so they reset on
  // reload — acceptable; the images themselves remain on the server until swept.
  const [uploads, setUploads] = useState<ForumUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taggedGame, setTaggedGame] = useState<CrewOwnedGame | null>(null);
  const [gameQuery, setGameQuery] = useState("");
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [category, setCategory] = useState<string>(categorySlug);
  const [announce, setAnnounce] = useState(false);
  const [announceAvailable, setAnnounceAvailable] = useState(false);
  const [pollOn, setPollOn] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMulti, setPollMulti] = useState(false);

  // Load categories for the picker; default to the requested slug, else the
  // last-used one, else the first unlocked category.
  useEffect(() => {
    let active = true;
    apiFetch("/forums/categories")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const cats: ForumCategory[] = Array.isArray(d?.categories) ? d.categories : [];
        setCategories(cats);
        setAnnounceAvailable(Boolean(d?.announceAvailable));
        const last = localStorage.getItem("bi:forum-last-category");
        const valid = (slug: string) => cats.some((c) => c.slug === slug && (!c.isLocked || isAdmin));
        if (valid(categorySlug)) setCategory(categorySlug);
        else if (last && valid(last)) setCategory(last);
        else { const first = cats.find((c) => !c.isLocked || isAdmin); if (first) setCategory(first.slug); }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [categorySlug, isAdmin]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.slug === category),
    [categories, category]
  );
  const autoDiscord = category === "announcements" || Boolean(selectedCategory?.autoDiscordBridge);

  useEffect(() => {
    if (autoDiscord && type !== "discussion") setType("discussion");
  }, [autoDiscord, type]);

  const gameMatches = useMemo(() => {
    const q = gameQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return crewGames.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 6);
  }, [gameQuery, crewGames]);

  useEffect(() => {
    if (title || body || linkUrl || type !== "discussion") {
      sessionStorage.setItem(draftKey, JSON.stringify({ title, body, type, linkUrl }));
    } else {
      sessionStorage.removeItem(draftKey);
    }
  }, [title, body, type, linkUrl, draftKey]);

  const linkTrimmed = linkUrl.trim();
  const linkOk = /^https?:\/\/\S+$/i.test(linkTrimmed);
  const showLinkField = type === "resource" || type === "recommendation";
  const linkRequired = type === "resource";
  const linkInvalid = (linkRequired && !linkOk) || (showLinkField && linkTrimmed.length > 0 && !linkOk);
  const meta = POST_TYPE_BY_KEY[type];

  const pollCleanOptions = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
  const pollValid = !pollOn || (pollQuestion.trim().length > 0 && pollCleanOptions.length >= 2);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const sendLink = showLinkField && linkOk ? linkTrimmed : undefined;
      localStorage.setItem("bi:forum-last-category", category);
      const pollPayload = pollOn && pollValid
        ? { question: pollQuestion.trim(), options: pollCleanOptions, multi: pollMulti }
        : undefined;
      const r = await apiFetch(`/forums/categories/${category}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          threadType: autoDiscord ? "discussion" : type,
          ...(sendLink ? { linkUrl: sendLink } : {}),
          ...(uploads.length ? { uploadIds: uploads.map((u) => u.id) } : {}),
          ...(taggedGame ? { appId: taggedGame.appId } : {}),
          ...(announce ? { announce: true } : {}),
          ...(pollPayload ? { poll: pollPayload } : {})
        })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "Post failed");
      sessionStorage.removeItem(draftKey);
      onCreated(data.threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <BackLink onClick={onCancel} label={`← Back to ${categorySlug}`} />
      <IslandCard>
        <h2 className="island-display" style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 700 }}>
          {meta.emoji} New {meta.label.toLowerCase()}
        </h2>
        {autoDiscord ? (
          <IslandCard
            style={{
              padding: "12px 16px",
              marginBottom: 14,
              background: "rgba(14, 165, 233, 0.1)",
              border: "1px solid rgba(14, 165, 233, 0.35)"
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span>🌉</span>
              <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.infoText, lineHeight: 1.5 }}>
                Posts here auto-push to Discord
              </p>
            </div>
          </IslandCard>
        ) : null}
        {!autoDiscord ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            What are you sharing?
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {POST_TYPES.map((t) => {
              const active = type === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  className="island-btn"
                  onClick={() => setType(t.key)}
                  aria-pressed={active}
                  style={{
                    textAlign: "left",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: active ? `${t.accent}22` : islandTheme.color.panelMutedBg,
                    border: `1px solid ${active ? t.accent : islandTheme.color.cardBorder}`,
                    color: islandTheme.color.textPrimary,
                    cursor: "pointer",
                    font: "inherit"
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1.1 }} aria-hidden="true">{t.emoji}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{t.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2, lineHeight: 1.35 }}>{t.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        ) : null}
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            Category
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14, cursor: "pointer" }}
          >
            {categories.filter((c) => !c.isLocked || isAdmin).map((c) => (
              <option key={c.id} value={c.slug}>{c.icon} {c.name}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder={
              type === "memory" ? "Name the moment — e.g. “LAN night 2024, 3am Helldivers”"
              : type === "recommendation" ? "What are you recommending?"
              : type === "resource" ? "What is this tool/guide?"
              : "Be specific — this is the headline"
            }
            style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14 }}
          />
        </label>
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            Body
          </span>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            rows={10}
            placeholder={
              type === "memory" ? "Tell the story. Add photos below, tag who was there…"
              : "Lay out your thoughts. **bold**, *italic*, > quote, - lists, `code`, [links](https://)…"
            }
          />
        </div>
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            {type === "memory" ? "📸 Photos" : "🖼️ Images (optional)"}
          </span>
          <ImageDropzone uploads={uploads} onUploadsChange={setUploads} />
        </div>
        {showLinkField ? (
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
              {meta.emoji} Link {linkRequired ? "(required)" : "(optional)"}
            </span>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              inputMode="url"
              placeholder="https://…"
              style={{
                ...islandInputStyle,
                width: "100%",
                padding: "10px 14px",
                fontSize: 14,
                borderColor: linkInvalid ? islandTheme.color.dangerAccent : islandTheme.color.border
              }}
            />
            <span style={{ fontSize: 12, color: linkInvalid ? islandTheme.color.dangerSoft : islandTheme.color.textMuted }}>
              {linkInvalid
                ? "Enter a full http(s):// link."
                : type === "resource"
                  ? "We'll unfurl a preview card from this link."
                  : "Add a store/link if you have one — optional."}
            </span>
          </div>
        ) : null}
        {category !== "announcements" ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            🎮 Tag a game (optional)
          </span>
          {taggedGame ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 10,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                background: islandTheme.color.panelMutedBg,
                justifySelf: "start"
              }}
            >
              <GameCover
                appId={taggedGame.appId}
                storedUrl={taggedGame.headerImageUrl}
                alt={taggedGame.name}
                style={{ width: 46, height: 21, borderRadius: 4 }}
              />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{taggedGame.name}</span>
              <button
                type="button"
                className="island-btn"
                onClick={() => { setTaggedGame(null); setGameQuery(""); }}
                aria-label="Remove game tag"
                style={{ background: "transparent", border: "none", color: islandTheme.color.textMuted, cursor: "pointer", font: "inherit", fontSize: 13 }}
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                value={gameQuery}
                onChange={(e) => setGameQuery(e.target.value)}
                placeholder="Search the crew library…"
                style={{ ...islandInputStyle, width: "100%", padding: "8px 12px", fontSize: 13 }}
              />
              {gameMatches.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {gameMatches.map((g) => (
                    <button
                      key={g.appId}
                      type="button"
                      className="island-btn"
                      onClick={() => { setTaggedGame(g); setGameQuery(""); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px 4px 4px",
                        borderRadius: 8,
                        border: `1px solid ${islandTheme.color.cardBorder}`,
                        background: islandTheme.color.panelMutedBg,
                        color: islandTheme.color.textPrimary,
                        cursor: "pointer",
                        font: "inherit",
                        fontSize: 12
                      }}
                    >
                      <GameCover appId={g.appId} storedUrl={g.headerImageUrl} alt={g.name} style={{ width: 40, height: 19, borderRadius: 4 }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
        ) : null}

        {!autoDiscord ? (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, justifySelf: "start" }}>
            <input type="checkbox" checked={pollOn} onChange={(e) => setPollOn(e.target.checked)} />
            📊 Add a poll
          </label>
          {pollOn ? (
            <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, border: `1px solid ${islandTheme.color.cardBorder}`, background: islandTheme.color.panelMutedBg }}>
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                maxLength={300}
                placeholder="Ask a question…"
                style={{ ...islandInputStyle, width: "100%", padding: "8px 12px", fontSize: 14 }}
              />
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={opt}
                    onChange={(e) => setPollOptions((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
                    maxLength={120}
                    placeholder={`Option ${i + 1}`}
                    style={{ ...islandInputStyle, flex: 1, padding: "7px 12px", fontSize: 13 }}
                  />
                  {pollOptions.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => setPollOptions((o) => o.filter((_, j) => j !== i))}
                      aria-label="Remove option"
                      style={{ background: "transparent", border: "none", color: islandTheme.color.textMuted, cursor: "pointer", font: "inherit", fontSize: 16 }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {pollOptions.length < 10 ? (
                <button
                  type="button"
                  onClick={() => setPollOptions((o) => [...o, ""])}
                  style={{ background: "transparent", border: "none", color: islandTheme.color.primaryGlow, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700, justifySelf: "start", padding: 0 }}
                >
                  + Add option
                </button>
              ) : null}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: islandTheme.color.textSubtle }}>
                <input type="checkbox" checked={pollMulti} onChange={(e) => setPollMulti(e.target.checked)} />
                Allow multiple choices
              </label>
            </div>
          ) : null}
        </div>
        ) : null}

        {!autoDiscord && announceAvailable ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
            📣 Also announce this to the Discord
          </label>
        ) : null}

        {error ? (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            Posting earns ₦5 · {body.length} chars
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <IslandButton onClick={onCancel}>Cancel</IslandButton>
            <IslandButton variant="primary" onClick={submit} disabled={busy || !category || title.trim().length < 3 || body.trim().length < 2 || linkInvalid || (linkRequired && !linkOk) || (pollOn && !pollValid)}>
              {busy ? "Posting…" : `Post ${meta.label}`}
            </IslandButton>
          </div>
        </div>
      </IslandCard>
    </div>
  );
}