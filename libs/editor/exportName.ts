/** Readable portable names; reserve space for page/clip numbers before truncating. */
export function exportBaseName(title: string | null | undefined, fallback = "video", suffix = ""): string {
  let stem = (title || "").normalize("NFC").trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\s]+/g, "_")
    .replace(/^[.-]+|[._-]+$/g, "") || fallback;
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem)) stem = "_" + stem;
  let result = "", bytes = 0, count = 0;
  for (const character of stem) {
    const point = character.codePointAt(0)!;
    const safe = point >= 0xd800 && point <= 0xdfff ? "_" : character;
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (count + 1 > 80 - suffix.length || bytes + size > 160 - suffix.length) break;
    result += safe; bytes += size; count++;
  }
  return (result.replace(/[._-]+$/g, "") || fallback) + suffix;
}

export function exportFilename(title: string | null | undefined, extension: string, suffix = "", fallback = "video"): string {
  return `${exportBaseName(title, fallback, suffix)}.${extension}`;
}
