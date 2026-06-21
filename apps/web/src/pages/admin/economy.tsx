// Economy pages: Operations (grant/attendance), Shop Items, Economy Rules.

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandButton, IslandCard, islandInputStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { GameNight, GuildMember, NuggiesShopItem, ServerSetting } from "../../types.js";
import { ItemGlyph } from "../../components/ItemGlyph.js";
import { AdminStatusBanner, AdminTabs, InlineSettings, SubsectionTitle } from "./adminUi.js";
import { ADMIN_PAGES, inlineSettingKeysFor } from "./adminNav.js";

// Accent comes from the nav registry — one source for sidebar, search, and page chrome.
const ACCENT = ADMIN_PAGES["economy"].accent;

type EconomyOverview = {
  totalSupply: number;
  optedOutCount: number;
  topHolders: { discordUserId: string; username: string; balance: number }[];
};

// ── Economy Operations ───────────────────────────────────────────────────────

export function EconomyOpsPage() {
  const [overview, setOverview] = useState<EconomyOverview | null>(null);
  const [gameNights, setGameNights] = useState<GameNight[]>([]);
  const [members, setMembers] = useState<GuildMember[]>([]);

  const [grantTargets, setGrantTargets] = useState<string[]>([]);
  const [grantSearch, setGrantSearch] = useState("");
  const [grantPickerOpen, setGrantPickerOpen] = useState(false);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [grantMsg, setGrantMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [granting, setGranting] = useState(false);

  const [selectedNight, setSelectedNight] = useState<number | "">("");
  const [awarding, setAwarding] = useState(false);
  const [awardMsg, setAwardMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const [ovRes, nightsRes, membersRes] = await Promise.all([
      apiFetch("/nuggies/admin/overview"),
      apiFetch("/game-nights"),
      apiFetch("/members"),
    ]);
    if (ovRes.ok) setOverview(await ovRes.json() as EconomyOverview);
    if (nightsRes.ok) {
      const d = await nightsRes.json() as { gameNights: GameNight[] };
      setGameNights((d.gameNights ?? []).filter((n) => n.selectedGameName != null));
    }
    if (membersRes.ok) {
      const d = await membersRes.json() as { members: GuildMember[] };
      setMembers(d.members ?? []);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleGrant = async () => {
    const amount = parseInt(grantAmount, 10);
    if (grantTargets.length === 0 || !amount || !grantReason.trim()) return;
    setGranting(true);
    setGrantMsg(null);

    const results = await Promise.all(
      grantTargets.map(async (id) => {
        const res = await apiFetch("/nuggies/admin/grant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toDiscordUserId: id, amount, reason: grantReason.trim() }),
        });
        const body = await res.json().catch(() => ({})) as { newBalance?: number; error?: string };
        return { id, ok: res.ok, error: body.error };
      })
    );

    const successCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);

    if (failed.length === 0) {
      setGrantMsg({
        ok: true,
        text: `Applied to ${successCount} ${successCount === 1 ? "user" : "users"}.`
      });
      setGrantTargets([]);
      setGrantAmount("");
      setGrantReason("");
      void load();
    } else {
      setGrantMsg({
        ok: false,
        text: `${successCount} ok, ${failed.length} failed${failed[0]?.error ? `: ${failed[0].error}` : ""}`
      });
    }
    setGranting(false);
  };

  function toggleGrantTarget(discordUserId: string) {
    setGrantTargets((prev) =>
      prev.includes(discordUserId)
        ? prev.filter((id) => id !== discordUserId)
        : [...prev, discordUserId]
    );
  }

  const handleAwardAttendance = async () => {
    if (!selectedNight) return;
    setAwarding(true);
    setAwardMsg(null);
    const res = await apiFetch(`/nuggies/admin/award-attendance/${selectedNight}`, { method: "POST" });
    const body = await res.json() as { awarded?: number; error?: string; message?: string };
    if (res.ok) {
      const n = body.awarded ?? 0;
      setAwardMsg({ ok: true, text: `Awarded to ${n} islander${n === 1 ? "" : "s"}.${body.message ? " " + body.message : ""}` });
    } else {
      setAwardMsg({ ok: false, text: body.error ?? "Failed" });
    }
    setAwarding(false);
  };

  return (
    <AdminTabs
      page="economy"
      tabs={[
        {
          anchor: "economy-grant",
          label: "Grant",
          content: (
            <>
              <AdminStatusBanner
                accent={ACCENT}
                icon="🍗"
                kicker="Economy Overview"
                title={`${overview ? overview.totalSupply.toLocaleString() : "…"} Nuggies in circulation`}
                subtitle={overview ? `${overview.optedOutCount} opted out` : "Loading…"}
              />
              <IslandCard style={{ padding: "16px 18px" }}>
                <SubsectionTitle>Grant / Deduct</SubsectionTitle>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                  Positive = grant, negative = deduct. Bypasses daily cap and opt-out checks. Applied to every selected user.
                </p>
                <div style={{ display: "grid", gap: 8 }}>
                  <MemberMultiSelect
                    members={members}
                    selectedIds={grantTargets}
                    onToggle={toggleGrantTarget}
                    onClear={() => setGrantTargets([])}
                    search={grantSearch}
                    onSearchChange={setGrantSearch}
                    open={grantPickerOpen}
                    onOpenChange={setGrantPickerOpen}
                  />
                  <input placeholder="Amount (e.g. 200 or -50)" type="number" value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} style={{ ...islandInputStyle }} />
                  <input placeholder="Reason" value={grantReason} onChange={(e) => setGrantReason(e.target.value)} style={{ ...islandInputStyle }} />
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <IslandButton variant="primary" onClick={() => void handleGrant()} disabled={granting || grantTargets.length === 0 || !grantAmount || !grantReason}>
                      {granting ? "Applying…" : `Apply${grantTargets.length > 1 ? ` to ${grantTargets.length}` : ""}`}
                    </IslandButton>
                    {grantMsg && <span style={{ fontSize: 13, color: grantMsg.ok ? islandTheme.color.successAccent : islandTheme.color.dangerAccent }}>{grantMsg.text}</span>}
                  </div>
                </div>
              </IslandCard>
            </>
          ),
        },
        {
          anchor: "economy-attendance",
          label: "Attendance",
          content: (
            <IslandCard style={{ padding: "16px 18px" }}>
              <SubsectionTitle>Attendance Awards</SubsectionTitle>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                Award Nuggies to all attendees of a finalized game night. Already-awarded attendees are skipped.
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select value={selectedNight} onChange={(e) => setSelectedNight(e.target.value ? parseInt(e.target.value, 10) : "")} style={{ ...islandInputStyle, flex: 1, minWidth: 200 }}>
                  <option value="">Select a game night…</option>
                  {gameNights.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title} — {n.selectedGameName ?? "?"} ({new Date(n.scheduledFor).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                <IslandButton variant="primary" onClick={() => void handleAwardAttendance()} disabled={awarding || !selectedNight}>
                  {awarding ? "Awarding…" : "Award 🍗 to Attendees"}
                </IslandButton>
                {awardMsg && <span style={{ fontSize: 13, color: awardMsg.ok ? islandTheme.color.successAccent : islandTheme.color.dangerAccent }}>{awardMsg.text}</span>}
              </div>
            </IslandCard>
          ),
        },
        {
          anchor: "economy-holders",
          label: "Holders",
          content: (
            overview && overview.topHolders.length > 0 ? (
              <IslandCard style={{ padding: "16px 18px" }}>
                <SubsectionTitle>Top Holders</SubsectionTitle>
                <div style={{ display: "grid", gap: 4 }}>
                  {overview.topHolders.map((h, i) => (
                    <div key={h.discordUserId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: islandTheme.color.panelMutedBg, fontSize: 13 }}>
                      <span style={{ fontFamily: islandTheme.font.mono, width: 24, color: islandTheme.color.textMuted, flexShrink: 0 }}>#{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{h.username}</span>
                      <span style={{ fontWeight: 700, color: ACCENT }}>₦{h.balance.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </IslandCard>
            ) : null
          ),
        },
      ]}
    />
  );
}

// ── Shop Items ───────────────────────────────────────────────────────────────

export function ShopAdminPage() {
  const [shopItems, setShopItems] = useState<NuggiesShopItem[]>([]);
  const [newItem, setNewItem] = useState({
    name: "", description: "", price: "",
    itemType: "title" as "title" | "flair" | "badge",
    emoji: "", label: "", color: "#f59e0b",
  });
  const [addingItem, setAddingItem] = useState(false);
  const [itemMsg, setItemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const res = await apiFetch("/nuggies/shop");
    if (res.ok) {
      const d = await res.json() as { items: NuggiesShopItem[] };
      setShopItems(d.items);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.description || !newItem.price || !newItem.emoji) return;
    setAddingItem(true);
    setItemMsg(null);
    const itemData: Record<string, string> = { emoji: newItem.emoji, color: newItem.color };
    if (newItem.itemType === "title" && newItem.label) itemData.label = newItem.label;
    const res = await apiFetch("/nuggies/admin/shop-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newItem.name, description: newItem.description,
        price: parseInt(newItem.price, 10), itemType: newItem.itemType,
        itemData, isActive: true,
      }),
    });
    const body = await res.json() as { ok?: boolean; error?: string };
    if (res.ok && body.ok) {
      setItemMsg({ ok: true, text: "Item created!" });
      setNewItem({ name: "", description: "", price: "", itemType: "title", emoji: "", label: "", color: "#f59e0b" });
      void load();
    } else {
      setItemMsg({ ok: false, text: body.error ?? "Failed" });
    }
    setAddingItem(false);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>Shop Items ({shopItems.length})</SubsectionTitle>
        <div style={{ display: "grid", gap: 4, marginBottom: 16 }}>
          {shopItems.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>No items in the shop yet.</p>
          ) : (
            shopItems.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: islandTheme.color.panelMutedBg, fontSize: 13 }}>
                <ItemGlyph itemData={item.itemData} size={18} />
                <span style={{ flex: 1, fontWeight: 600 }}>{item.name}</span>
                <span style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "capitalize" }}>{item.itemType}</span>
                <span style={{ fontWeight: 700, color: ACCENT }}>₦{item.price.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>

        <SubsectionTitle style={{ marginTop: 8 }}>Add Item</SubsectionTitle>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} style={{ ...islandInputStyle, flex: 2 }} />
            <select value={newItem.itemType} onChange={(e) => setNewItem({ ...newItem, itemType: e.target.value as "title" | "flair" | "badge" })} style={{ ...islandInputStyle, flex: 1 }}>
              <option value="title">Title</option>
              <option value="flair">Flair</option>
              <option value="badge">Badge</option>
            </select>
          </div>
          <input placeholder="Description" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} style={{ ...islandInputStyle }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Price" type="number" min={1} value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} style={{ ...islandInputStyle, width: 100 }} />
            <input placeholder="Emoji" value={newItem.emoji} onChange={(e) => setNewItem({ ...newItem, emoji: e.target.value })} style={{ ...islandInputStyle, width: 72 }} />
            {newItem.itemType === "title" && (
              <input placeholder="Label (display text)" value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} style={{ ...islandInputStyle, flex: 1, minWidth: 120 }} />
            )}
            <input type="color" value={newItem.color} onChange={(e) => setNewItem({ ...newItem, color: e.target.value })} style={{ width: 48, height: 38, borderRadius: 8, border: `1px solid ${islandTheme.color.border}`, padding: 2, background: islandTheme.color.panelMutedBg, cursor: "pointer" }} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <IslandButton variant="primary" onClick={() => void handleAddItem()} disabled={addingItem || !newItem.name || !newItem.description || !newItem.price || !newItem.emoji}>
              {addingItem ? "Creating…" : "Create Item"}
            </IslandButton>
            {itemMsg && <span style={{ fontSize: 13, color: itemMsg.ok ? islandTheme.color.successAccent : islandTheme.color.dangerAccent }}>{itemMsg.text}</span>}
          </div>
        </div>
      </IslandCard>
    </div>
  );
}

// ── Economy Rules ────────────────────────────────────────────────────────────

export function EconomyRulesPage({
  settings,
  onSave
}: {
  settings: ServerSetting[] | null;
  onSave: (key: string, value: string) => Promise<void> | void;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5, maxWidth: "68ch" }}>
        Policy knobs for the Nuggies economy — earn rates, caps, fees, and limits. Day-to-day actions
        (grants, attendance awards) live on the Economy Operations page.
      </p>
      <InlineSettings
        keys={inlineSettingKeysFor("economy-rules")}
        settings={settings}
        onSave={onSave}
        title=""
      />
    </div>
  );
}

// ── Member multi-select (shared by grant form) ───────────────────────────────

function MemberMultiSelect({
  members,
  selectedIds,
  onToggle,
  onClear,
  search,
  onSearchChange,
  open,
  onOpenChange
}: {
  members: GuildMember[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? members.filter(
        (m) =>
          m.displayName.toLowerCase().includes(query) ||
          m.username.toLowerCase().includes(query) ||
          m.discordUserId.includes(query)
      )
    : members;

  const selectedMembers = members.filter((m) => selectedIds.includes(m.discordUserId));

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        style={{
          ...islandInputStyle,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          minHeight: 36,
          padding: selectedMembers.length > 0 ? "6px 10px" : "8px 12px"
        }}
      >
        {selectedMembers.length === 0 ? (
          <span style={{ color: islandTheme.color.textMuted }}>Select members…</span>
        ) : (
          selectedMembers.map((m) => (
            <span
              key={m.discordUserId}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px 2px 8px",
                borderRadius: 999,
                background: islandTheme.color.panelMutedBg,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                fontSize: 12
              }}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(m.discordUserId);
              }}
              role="button"
              tabIndex={0}
            >
              {m.displayName}
              <span style={{ color: islandTheme.color.textMuted, fontSize: 12 }}>×</span>
            </span>
          ))
        )}
        <span style={{ marginLeft: "auto", color: islandTheme.color.textMuted, fontSize: 12 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 40,
            background: islandTheme.color.menuBg,
            backdropFilter: islandTheme.glass.blurMenu,
            WebkitBackdropFilter: islandTheme.glass.blurMenu,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            maxHeight: 320,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          <div style={{ padding: 8, borderBottom: `1px solid ${islandTheme.color.cardBorder}`, display: "flex", gap: 6 }}>
            <input
              autoFocus
              placeholder="Search by name or ID…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ ...islandInputStyle, flex: 1 }}
            />
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                style={{
                  background: "transparent",
                  border: `1px solid ${islandTheme.color.cardBorder}`,
                  borderRadius: 6,
                  color: islandTheme.color.textMuted,
                  fontSize: 12,
                  padding: "0 10px",
                  cursor: "pointer",
                  font: "inherit",
                  whiteSpace: "nowrap"
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 12, fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
                No members match.
              </div>
            ) : (
              filtered.map((m) => {
                const checked = selectedIds.includes(m.discordUserId);
                return (
                  <button
                    key={m.discordUserId}
                    type="button"
                    onClick={() => onToggle(m.discordUserId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "none",
                      background: checked ? "rgba(56,189,248,0.10)" : "transparent",
                      color: islandTheme.color.textPrimary,
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 13,
                      textAlign: "left"
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        border: `1px solid ${checked ? islandTheme.color.primaryGlow : islandTheme.color.cardBorder}`,
                        background: checked ? islandTheme.color.primaryGlow : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: islandTheme.color.textInverted,
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0
                      }}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" width={20} height={20} style={{ borderRadius: 999, flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 20, height: 20, borderRadius: 999, background: islandTheme.color.panelMutedBg, flexShrink: 0 }} />
                    )}
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.displayName}
                      <span style={{ color: islandTheme.color.textMuted, fontSize: 12, marginLeft: 6 }}>@{m.username}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div
            style={{
              padding: "6px 10px",
              borderTop: `1px solid ${islandTheme.color.cardBorder}`,
              fontSize: 12,
              color: islandTheme.color.textMuted,
              display: "flex",
              justifyContent: "space-between"
            }}
          >
            <span>{selectedIds.length} selected</span>
            <span>{filtered.length} of {members.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}
