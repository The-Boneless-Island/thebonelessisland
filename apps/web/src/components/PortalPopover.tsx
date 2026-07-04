// Shared anchored-menu primitive for every lightweight popover in the app
// (share menu, emoji picker, and any future one). Portals to document.body:
// apps/web/src/App.tsx renders every page inside a "main" with a
// backdrop-filter (islandTheme.glass.blurStrong), which makes that element a
// CSS containing block for position:fixed descendants. Anything fixed inside
// a page ends up anchored to that in-page column instead of the real
// viewport, and can additionally get visually clipped by ancestor cards that
// set overflow:hidden / isolation:isolate. Rendering through this portal
// escapes both problems — see the same pattern (and the fuller writeup) in
// apps/web/src/pages/forums/forumEditor.tsx's AttachmentGallery lightbox and
// apps/web/src/components/QuickSwitcher.tsx.
//
// This is intentionally NOT a modal: no focus trap, no scroll lock. It only
// returns focus to the anchor on Escape-close. Full dialogs should keep using
// useModalFocus instead.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { islandTheme } from "../theme.js";

const SMALL_SCREEN_QUERY = "(max-width: 560px)";
const Z_INDEX = 300;

type Side = "top" | "bottom";
type Align = "left" | "right";

type Position = {
  top: number;
  left: number;
  width: number;
};

export type PortalPopoverProps = {
  open: boolean;
  onClose: () => void;
  /** Ref to the trigger element this popover anchors to. */
  anchorRef: RefObject<HTMLElement | null>;
  side?: Side;
  align?: Align;
  /** Gap (px) between the trigger and the popover. */
  offset?: number;
  /** Extra inline style merged onto the popover surface (e.g. custom width). */
  style?: React.CSSProperties;
  /** aria-label for the popover's role="menu"/"dialog" container. */
  ariaLabel?: string;
  children: ReactNode;
};

function computePosition(anchor: HTMLElement, side: Side, offset: number): { top: number; bottom: number; left: number; width: number } {
  const rect = anchor.getBoundingClientRect();
  return {
    top: side === "top" ? rect.top - offset : rect.bottom + offset,
    bottom: side === "top" ? window.innerHeight - rect.top + offset : window.innerHeight - rect.bottom - offset,
    left: rect.left,
    width: rect.width
  };
}

export function PortalPopover({
  open,
  onClose,
  anchorRef,
  side = "bottom",
  align = "right",
  offset = 6,
  style,
  ariaLabel,
  children
}: PortalPopoverProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 560
  );

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const surface = surfaceRef.current;
    if (!anchor) return;

    if (typeof window !== "undefined" && window.matchMedia(SMALL_SCREEN_QUERY).matches) {
      setIsSmallScreen(true);
      return;
    }
    setIsSmallScreen(false);

    const measuredHeight = surface?.offsetHeight ?? 0;
    let effectiveSide = side;
    let coords = computePosition(anchor, effectiveSide, offset);

    // Flip vertically if it would overflow the viewport on the chosen side.
    if (effectiveSide === "bottom" && measuredHeight > 0 && coords.top + measuredHeight > window.innerHeight) {
      const flipped = computePosition(anchor, "top", offset);
      if (flipped.top - measuredHeight >= 0) {
        effectiveSide = "top";
        coords = flipped;
      }
    } else if (effectiveSide === "top" && measuredHeight > 0 && coords.top - measuredHeight < 0) {
      const flipped = computePosition(anchor, "bottom", offset);
      if (flipped.top + measuredHeight <= window.innerHeight) {
        effectiveSide = "bottom";
        coords = flipped;
      }
    }

    setPosition({
      top: effectiveSide === "top" ? coords.top - measuredHeight : coords.top,
      left: coords.left,
      width: coords.width
    });
  }, [anchorRef, offset, side]);

  // Measure on open and whenever the content's size may have changed.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  // Reposition on window resize (debounced); close on scroll rather than
  // trying to track it — simplest option that never lets the popover drift
  // away from its trigger. Scroll listener uses the capture phase so it also
  // catches scrolling inside any nested scroll container, not just window.
  useEffect(() => {
    if (!open) return;

    const onScroll = () => onClose();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(reposition, 100);
    };

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [open, onClose, reposition]);

  // Escape closes + returns focus to the anchor; outside pointerdown closes.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        anchorRef.current?.focus({ preventScroll: true });
      }
    };
    const onPointerDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      if (surfaceRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const surfaceBase: React.CSSProperties = {
    background: islandTheme.color.menuBg,
    backdropFilter: islandTheme.glass.blurMenu,
    WebkitBackdropFilter: islandTheme.glass.blurMenu,
    border: `1px solid ${islandTheme.color.cardBorder}`,
    borderRadius: 12,
    boxShadow: islandTheme.shadow.menu,
    zIndex: Z_INDEX
  };

  if (isSmallScreen) {
    return createPortal(
      <>
        <div
          role="presentation"
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: Z_INDEX, background: "rgba(2,6,23,0.5)" }}
        />
        <div
          ref={surfaceRef}
          role="menu"
          aria-label={ariaLabel}
          style={{
            ...surfaceBase,
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            maxHeight: "70vh",
            overflowY: "auto",
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            animation: "biPortalPopoverSheetIn 180ms ease",
            ...style
          }}
        >
          {children}
        </div>
        <style>{`
          @keyframes biPortalPopoverSheetIn {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            [role="menu"] { animation: none !important; }
          }
        `}</style>
      </>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={surfaceRef}
      role="menu"
      aria-label={ariaLabel}
      style={{
        ...surfaceBase,
        position: "fixed",
        top: position ? position.top : -9999,
        left: position ? clampHorizontal(position.left, position.width, align) : -9999,
        visibility: position ? "visible" : "hidden",
        ...style
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/** Clamps the popover's left edge so it never renders off-screen. */
function clampHorizontal(anchorLeft: number, anchorWidth: number, align: Align): number {
  const margin = 8;
  const maxLeft = window.innerWidth - margin;
  // Left-align: start at the anchor's left edge. Right-align: nudge so the
  // popover's right edge would land at the anchor's right edge — since we
  // don't know the popover's own width up front, clamp against a reasonable
  // max width guess and let content wrap/scroll if still tight.
  const preferred = align === "left" ? anchorLeft : Math.max(margin, anchorLeft + anchorWidth - 280);
  return Math.min(Math.max(preferred, margin), maxLeft - 40);
}
