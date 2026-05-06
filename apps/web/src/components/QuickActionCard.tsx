import type { CSSProperties, ReactNode } from "react";
import { islandTagStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";

type QuickActionCardProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  count?: number;
  tone?: "primary" | "warning" | "success" | "default";
  onClick: () => void;
};

const TONE_COLORS: Record<NonNullable<QuickActionCardProps["tone"]>, string> = {
  primary: "#38bdf8",
  warning: "#f59e0b",
  success: "#22c55e",
  default: "#94a3b8"
};

export function QuickActionCard({
  icon,
  title,
  subtitle,
  count,
  tone = "default",
  onClick
}: QuickActionCardProps) {
  const color = TONE_COLORS[tone];
  const hasCount = typeof count === "number" && count > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={cardStyle(color)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = islandTheme.color.cardBorder;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {icon && (
        <div style={iconBoxStyle(color)}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={titleStyle}>{title}</span>
          {hasCount && (
            <span className="island-mono" style={islandTagStyle({ color })}>
              {count}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={subtitleStyle}>{subtitle}</div>
        )}
      </div>
      <span style={chevronStyle}>→</span>
    </button>
  );
}

function cardStyle(accent: string): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    background: `linear-gradient(135deg, ${accent}10 0%, ${islandTheme.color.panelBg} 65%)`,
    border: `1px solid ${islandTheme.color.cardBorder}`,
    color: islandTheme.color.textPrimary,
    cursor: "pointer",
    font: "inherit",
    transition: "transform 140ms ease, border-color 140ms ease"
  };
}

function iconBoxStyle(accent: string): CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: `${accent}22`,
    border: `1px solid ${accent}44`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    flexShrink: 0
  };
}

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: islandTheme.color.textPrimary
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: islandTheme.color.textMuted,
  marginTop: 2,
  lineHeight: 1.4
};

const chevronStyle: CSSProperties = {
  fontSize: 16,
  color: islandTheme.color.textMuted,
  flexShrink: 0
};
