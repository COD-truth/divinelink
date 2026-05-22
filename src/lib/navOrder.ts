// Per-user custom navigation order persisted in localStorage.
const KEY = (userId: number | string | undefined) => `divinelink.navOrder.${userId ?? "anon"}`;

export function getNavOrder(userId?: number | string): string[] {
  try {
    const raw = localStorage.getItem(KEY(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function setNavOrder(userId: number | string | undefined, order: string[]): void {
  try { localStorage.setItem(KEY(userId), JSON.stringify(order)); } catch { /* */ }
}

export function applyOrder<T extends { page: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items;
  const map = new Map(items.map(i => [i.page, i]));
  const ordered: T[] = [];
  for (const p of order) {
    const it = map.get(p);
    if (it) { ordered.push(it); map.delete(p); }
  }
  // Append any new items that aren't in the saved order
  for (const remaining of map.values()) ordered.push(remaining);
  return ordered;
}
