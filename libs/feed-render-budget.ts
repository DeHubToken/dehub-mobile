const DEFAULT_BUDGET = { windowSize: 11, initialRows: 3 };
const GALLERY_BUDGET = { windowSize: 5, initialRows: 2 };

/** Gallery-heavy channels need a smaller bitmap working set on scrollback. */
export function feedRenderBudget(items: readonly unknown[]) {
  const galleries = items.filter(item => typeof item === 'object' && item !== null && 'imageUrls' in item && Array.isArray(item.imageUrls) && item.imageUrls.length > 1).length;
  return galleries >= 4 && galleries * 2 >= items.length ? GALLERY_BUDGET : DEFAULT_BUDGET;
}
