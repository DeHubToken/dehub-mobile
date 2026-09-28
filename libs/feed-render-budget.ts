// Every mounted row keeps its bitmaps resident on the GPU, on screen or not.
// At 11 windows (five screens either side) a long home session outgrew
// Android's ~121MB texture budget on a Galaxy S24+: the third pass down the
// feed evicted and re-uploaded on nearly every frame (22% janky, 150 slow
// bitmap uploads, against 1.3% on the first pass). Seven keeps three screens
// of runway each way.
const DEFAULT_BUDGET = { windowSize: 7, initialRows: 3 };
const GALLERY_BUDGET = { windowSize: 5, initialRows: 2 };

/** Gallery-heavy channels need a smaller bitmap working set on scrollback. */
export function feedRenderBudget(items: readonly unknown[]) {
  const galleries = items.filter(item => typeof item === 'object' && item !== null && 'imageUrls' in item && Array.isArray(item.imageUrls) && item.imageUrls.length > 1).length;
  return galleries >= 4 && galleries * 2 >= items.length ? GALLERY_BUDGET : DEFAULT_BUDGET;
}
