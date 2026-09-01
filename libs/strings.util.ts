// String utility functions

/**
 * Truncate a blockchain address (or any long string) in the middle.
 * @param value full string
 * @param front number of chars to keep at start
 * @param back number of chars to keep at end
 * @example truncateAddress('0x1234567890abcdef', 6, 4) => 0x1234...cdef
 */
export function truncateAddress(value: string | undefined | null, front = 6, back = 4): string {
  if (!value) return '';
  if (value.length <= front + back + 3) return value;
  return `${value.slice(0, front)}...${value.slice(-back)}`;
  
}

export function isBlank(str?: string | null): boolean {
  return !str || str.trim().length === 0;
}

export function truncate(str: string, length: number, suffix = '…'): string {
  if (str.length <= length) return str;
  return str.slice(0, Math.max(0, length - suffix.length)) + suffix;
}

export function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}


export function miniAddress(address: string|null|undefined): string {
  if (!address) return ""; // Handle undefined or empty input
  return `${address.substring(0, 6)}...${address.slice(-4)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "";
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + " B";
  }
  const units = ["KB", "MB", "GB", "TB"]; 
  let u = -1;
  do {
    bytes /= thresh;
    ++u;
  } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + " " + units[u];
}


const HASHTAG_RE = /#([A-Za-z][A-Za-z0-9_]{0,49})/g;

/**
 * Mirrors the web app's hashtag handling: reads #tags out of the title and
 * description, title-cases them, and merges them into the post's categories.
 *
 * It does not touch the text. Both apps used to strip the tags out and tidy up
 * the whitespace they left behind, which made a tag the author typed
 * indistinguishable from one picked in the category selector — both ended up
 * as invisible metadata, and the tags somebody had deliberately written
 * disappeared from their own post. Where a tag appears is the author's
 * decision: a picked category stays out of sight, a typed one stays where it
 * was put, and FeedCaption renders it as a link.
 */
export function mergeHashtagCategories(
  title: string,
  description: string,
  baseCategories: string[],
): string[] {
  const toTitleCaseTag = (tag: string) =>
    tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();

  const titleTags = Array.from(title.matchAll(HASHTAG_RE)).map((m) => toTitleCaseTag(m[1]));
  const descTags = Array.from(description.matchAll(HASHTAG_RE)).map((m) => toTitleCaseTag(m[1]));

  return [...new Set([...baseCategories, ...titleTags, ...descTags])];
}

export const StringsUtil = { truncateAddress, isBlank, truncate, toTitleCase, miniAddress, formatBytes, mergeHashtagCategories };
export default StringsUtil;
