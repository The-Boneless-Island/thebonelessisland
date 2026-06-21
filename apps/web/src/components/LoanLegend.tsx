import { useState } from "react";
import { LOAN_LEGEND_SECTIONS, LOAN_STATUS_DESCRIPTIONS, LOAN_STATUS_LABELS, type LoanStatus } from "@island/shared";
import { IslandCard } from "../islandUi.js";
import { islandTheme } from "../theme.js";

const STATUS_ORDER: LoanStatus[] = ["pending", "active", "repaid", "defaulted", "cancelled"];

export function LoanLegend() {
  const [open, setOpen] = useState(true);

  return (
    <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: islandTheme.color.textPrimary,
          font: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>How Loans Work</span>
        <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          {open ? "Hide" : "Show"} ?
        </span>
      </button>

      {open ? (
        <div style={{ display: "grid", gap: 14 }}>
          {LOAN_LEGEND_SECTIONS.map((section) => (
            <div key={section.title}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{section.title}</div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: islandTheme.color.textSubtle }}>{section.body}</p>
            </div>
          ))}

          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Status key</div>
            <div style={{ display: "grid", gap: 8 }}>
              {STATUS_ORDER.map((status) => (
                <div
                  key={status}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(88px, auto) 1fr",
                    gap: 10,
                    fontSize: 13,
                    alignItems: "start",
                  }}
                >
                  <span
                    className="island-mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: islandTheme.color.primaryGlow,
                    }}
                  >
                    {LOAN_STATUS_LABELS[status]}
                  </span>
                  <span style={{ color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                    {LOAN_STATUS_DESCRIPTIONS[status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </IslandCard>
  );
}
