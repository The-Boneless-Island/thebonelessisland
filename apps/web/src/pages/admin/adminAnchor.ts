// Anchor bus for tabbed admin pages. Search and quick-action jumps target a
// section anchor (e.g. "news-triggers"); when that section lives inside an
// <AdminTabs>, the tab that owns it must activate before AdminLayout scrolls to
// it. AdminLayout emits the requested anchor here; AdminTabs subscribes and
// switches. `pending` covers cross-page jumps where the target AdminTabs has not
// mounted yet at emit time — the fresh mount reads (and clears) it.

type AnchorListener = (anchor: string) => void;

const listeners = new Set<AnchorListener>();
let pending: string | null = null;

export function emitAdminAnchor(anchor: string): void {
  pending = anchor;
  for (const fn of listeners) fn(anchor);
}

/** Read + clear the last-requested anchor. AdminTabs calls this on mount. */
export function consumePendingAnchor(): string | null {
  const a = pending;
  pending = null;
  return a;
}

export function subscribeAdminAnchor(fn: AnchorListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
