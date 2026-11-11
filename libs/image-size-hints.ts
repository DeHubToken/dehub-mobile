/**
 * Picture shapes sent by the API (`imageSizes: [{ f, w, h }]`, `f` being the
 * file name). A photo card reads its shape from here on first paint, so it
 * never draws square and then resizes once the file arrives.
 */
const MAX_HINTS = 4000;
const ratios = new Map<string, number>();

interface SizedPost { imageSizes?: unknown }

function note(post: unknown): void {
  const sizes = (post as SizedPost | null)?.imageSizes;
  if (!Array.isArray(sizes)) return;
  for (const size of sizes) {
    const { f, w, h } = (size || {}) as { f?: unknown; w?: unknown; h?: unknown };
    if (typeof f !== 'string' || typeof w !== 'number' || typeof h !== 'number' || !(w > 0) || !(h > 0)) continue;
    if (ratios.size >= MAX_HINTS && !ratios.has(f)) ratios.delete(ratios.keys().next().value!);
    ratios.set(f, w / h);
  }
}

function noteEach(value: unknown, depth: number): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) noteEach(entry, depth);
    return;
  }
  note(value);
  if (depth <= 0) return;
  // Lists of posts and the post a post quotes sit one or two levels down.
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === 'object') noteEach(child, depth - 1);
  }
}

/** Remember every picture shape found in an API response. */
export function noteImageSizes(response: unknown): void {
  try { noteEach(response, 3); } catch { /* Hints are optional. */ }
}

/** Width / height of a feed picture, when the API has told us. */
export function hintedImageRatio(url?: string | null): number | undefined {
  if (!url || !ratios.size) return undefined;
  const path = url.split(/[?#]/, 1)[0];
  return ratios.get(path.slice(path.lastIndexOf('/') + 1));
}
