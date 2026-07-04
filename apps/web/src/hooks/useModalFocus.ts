import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

type UseModalFocusOptions = {
  /** Whether the dialog is currently open. */
  isOpen: boolean;
  /** Called when Escape is pressed (window-level) or the hook otherwise
   * decides the dialog should close. Typically the same handler passed as
   * the dialog's onClose prop. */
  onClose: () => void;
  /** Skip the initial-focus step — pass this when the consumer already
   * focuses something specific on open (e.g. QuickSwitcher's search input),
   * so the hook doesn't fight it by also focusing the dialog root. */
  skipInitialFocus?: boolean;
  /** Skip the window-level Escape listener — pass this when the consumer
   * already closes on Escape through its own handler (to avoid double-firing
   * onClose, which is harmless but redundant). */
  skipEscape?: boolean;
  /** Skip the body-scroll lock — pass this when the consumer already locks
   * scroll itself. */
  skipScrollLock?: boolean;
};

/**
 * Shared focus-management behavior for modal/dialog/drawer components:
 * remembers what had focus before opening, moves focus into the dialog on
 * open, traps Tab within the dialog while open, closes on window-level
 * Escape, locks body scroll while open, and restores the pre-open focus on
 * close. Returns a ref to attach to the dialog's root element (the element
 * Tab-trapping and initial-focus are scoped to).
 *
 * Each behavior can be individually skipped for consumers that already
 * implement a piece of this themselves (see the skip* options) — the goal is
 * to fill gaps, not force every dialog through an identical focus flow.
 */
export function useModalFocus<T extends HTMLElement>({
  isOpen,
  onClose,
  skipInitialFocus = false,
  skipEscape = false,
  skipScrollLock = false
}: UseModalFocusOptions) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Save the pre-open focus target, move focus in, and restore on close.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    if (!skipInitialFocus) {
      // Wait a tick so the dialog's own content (often conditionally
      // rendered) has painted before we look for something to focus.
      const raf = requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;
        const first = focusableElements(container)[0];
        // preventScroll: a dialog whose fixed positioning was previously
        // mis-anchored (containing-block bug, now fixed via portaling) could
        // otherwise cause the browser to scroll the page to bring the
        // newly-focused element into view — jarring even once portaled
        // correctly, since the dialog already covers the viewport.
        (first ?? container).focus({ preventScroll: true });
      });
      return () => {
        cancelAnimationFrame(raf);
        previouslyFocusedRef.current?.focus?.({ preventScroll: true });
      };
    }

    return () => {
      previouslyFocusedRef.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen, skipInitialFocus]);

  // Trap Tab within the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Escape closes.
  useEffect(() => {
    if (!isOpen || skipEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, skipEscape, onClose]);

  // Body scroll lock.
  useEffect(() => {
    if (!isOpen || skipScrollLock) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, skipScrollLock]);

  return containerRef;
}
