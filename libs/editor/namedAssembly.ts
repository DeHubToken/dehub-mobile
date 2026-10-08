import type { AssemblyAsset } from "./assemblyLibrary";
import type { MediaClip } from "./types";

interface FileReference { start: number; end: number; name: string; quoted: boolean }
const extensions = "mp4|mov|webm|mkv|avi|m4v|mpg|mpeg|ogv|png|jpg|jpeg|webp|gif|heic|avif|bmp|tif|tiff|svg|wav|mp3|m4a|aac|ogg|flac|opus|aif|aiff";
const fileEnding = new RegExp(`\\.(?:${extensions})$`, "i");
const normalize = (text: string) => text.normalize("NFC").toLowerCase();

function fileReferences(text: string): FileReference[] {
  const result: FileReference[] = [];
  const quoted = /"([^"\r\n]+)"|'([^'\r\n]+)'|“([^”\r\n]+)”/g;
  for (const match of text.matchAll(quoted)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (fileEnding.test(name)) result.push({ start: match.index!, end: match.index! + match[0].length, name, quoted: true });
  }
  const plain = new RegExp(`[\\p{L}\\p{N}_./\\\\:-]+\\.(?:${extensions})\\b(?:\\.[\\p{L}\\p{N}_-]+)*`, "giu");
  for (const match of text.matchAll(plain)) {
    const start = match.index!, end = start + match[0].length;
    if (!result.some(ref => start >= ref.start && end <= ref.end)) result.push({ start, end, name: match[0], quoted: false });
  }
  return result.sort((a, b) => a.start - b.start);
}

/** File names are data, so their words cannot change intent or duration. */
export function assemblyFilePrompt(prompt: string): { text: string; named: boolean } {
  const references = fileReferences(prompt);
  let text = prompt;
  for (const reference of [...references].reverse()) text = text.slice(0, reference.start) + " media " + text.slice(reference.end);
  return { text, named: references.length > 0 };
}

const fileCharacter = (value: string | undefined) => !!value && /[\p{L}\p{N}_./\\-]/u.test(value);
const boundary = (text: string, start: number, end: number) => !fileCharacter(text[start - 1])
  && (!fileCharacter(text[end]) || (text[end] === "." && !fileCharacter(text[end + 1])));

/** Resolve only actual available files; an unresolved reference never falls back to other footage. */
export function namedAssemblySelection(prompt: string, media: readonly MediaClip[], sounds: readonly MediaClip[],
  library: readonly AssemblyAsset[], selected?: readonly string[]): { ids: string[]; soundId: string | null } | null {
  const text = normalize(prompt), references = fileReferences(text);
  if (!references.length) return null;
  const names = new Map<string, Set<string>>();
  for (const asset of library) {
    if (typeof asset.name !== "string" || !asset.name || typeof asset.id !== "string") continue;
    const name = normalize(asset.name), ids = names.get(name) ?? new Set<string>();
    ids.add(asset.id); names.set(name, ids);
  }
  const matches: { start: number; end: number; name: string; assetIds: Set<string> }[] = [];
  for (const [name, assetIds] of [...names].sort((a, b) => b[0].length - a[0].length)) {
    for (let start = text.indexOf(name); start >= 0; start = text.indexOf(name, start + 1)) {
      const end = start + name.length;
      if (boundary(text, start, end) && !matches.some(match => start < match.end && end > match.start)) matches.push({ start, end, name, assetIds });
    }
  }
  if (references.some(ref => !matches.some(match => ref.quoted ? normalize(ref.name) === match.name
    && match.start > ref.start && match.end < ref.end : ref.start >= match.start && ref.end <= match.end))) return null;
  const ids: string[] = [], audio: string[] = [];
  for (const match of matches.sort((a, b) => a.start - b.start)) {
    if (/(?:without|except|excluding|exclude|not|sans|sauf)\s+(?:using\s+)?["“']?\s*$/.test(text.slice(0, match.start))) return null;
    const visuals = media.filter(clip => match.assetIds.has(clip.mediaId) && (!selected || selected.includes(clip.id)));
    const music = sounds.filter(clip => match.assetIds.has(clip.mediaId));
    const choices = [...visuals, ...music];
    if (choices.length !== 1 || (match.assetIds.size > 1 && (!selected || !visuals.length))) return null;
    const choice = choices[0], list = choice.kind === "audio" ? audio : ids;
    if (!list.includes(choice.id)) list.push(choice.id);
  }
  return ids.length && audio.length <= 1 ? { ids, soundId: audio[0] ?? null } : null;
}
