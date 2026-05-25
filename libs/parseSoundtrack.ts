/**
 * Parse [soundtrack:tokenId:title:creator:audioPath?] tag from a post description.
 * Used by feed cards to extract soundtrack info and clean the display text.
 */
export interface ParsedSoundtrack {
  tokenId: string;
  title: string;
  creator: string;
  /** CDN URL to the audio file */
  url: string;
}

const CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/";

// Supports old format (4 fields) and new format (5 fields with audioPath)
const SOUNDTRACK_RE = /\[soundtrack:(\d+):([^:]*):([^:\]]*):?([^\]]*)\]/;

export function parseSoundtrack(description?: string | null): ParsedSoundtrack | null {
  if (!description) return null;
  const match = description.match(SOUNDTRACK_RE);
  if (!match) return null;

  const tokenId = match[1];
  const title = match[2] || "Sound";
  const creator = match[3] || "";
  const audioPath = match[4]?.trim();

  return {
    tokenId,
    title,
    creator,
    url: audioPath
      ? `${CDN_BASE}${audioPath}`
      : `${CDN_BASE}feed-audio/${tokenId}-audio.mp3`,
  };
}

export function stripSoundtrackTag(description?: string | null): string {
  if (!description) return "";
  return description.replace(/\[soundtrack:[^\]]*\]/, "").trim();
}

export function buildSoundtrackTag(sound: {
  tokenId: string;
  title: string;
  creator: string;
  url?: string;
}): string {
  const relPath = sound.url?.startsWith(CDN_BASE)
    ? sound.url.slice(CDN_BASE.length)
    : sound.url;
  return relPath
    ? `[soundtrack:${sound.tokenId}:${sound.title}:${sound.creator}:${relPath}]`
    : `[soundtrack:${sound.tokenId}:${sound.title}:${sound.creator}]`;
}
