const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };

/** Exact numeric cut requests are local operations, including when offline. */
export function preciseCommand(prompt: string, value: unknown): { op: string; id: string; count?: number; duration?: number; at?: number } | null {
  if (!value || typeof value !== "object") return null;
  const scene = value as { selected?: unknown; layers?: unknown };
  const text = prompt.trim().toLowerCase().replace(/[‐‑–]/g, "-").replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b/g, (word) => String(NUMBER_WORDS[word]));
  const layer = "(?:(?:this|the|my|selected)\\s+)?(?:video|clip)";
  const prefix = "^(?:please\\s+)?(?:split|divide|cut|break\\s+up)\\s+" + layer;
  const match = new RegExp(prefix + "\\s+into\\s+(\\d+)\\s+(?:(\\d+(?:\\.\\d+)?)\\s*(?:-|\\s)\\s*(?:seconds?|secs?|s)\\s+)?(?:equal\\s+)?clips?[.!]?$", "i").exec(text);
  const interval = new RegExp(prefix + "\\s+(?:every|into)\\s+(\\d+(?:\\.\\d+)?)\\s*(?:-|\\s)\\s*(?:seconds?|secs?|s)(?:\\s+clips?)?[.!]?$", "i").exec(text);
  const split = new RegExp(prefix + "\\s+at\\s+(\\d+(?:\\.\\d+)?)\\s*(?:seconds?|secs?|s)?[.!]?$", "i").exec(text);
  if (!match && !interval && !split) return null;
  const videos: { id: string; kind: string; locked?: boolean }[] = Array.isArray(scene.layers) ? scene.layers.filter(c => c && typeof c.id === "string" && c.kind === "video") : [];
  const selection = Array.isArray(scene.selected) ? scene.selected : [];
  const selected = videos.filter(c => selection.includes(c.id));
  const target = selected.length === 1 ? selected[0] : !selected.length && videos.length === 1 ? videos[0] : undefined;
  if (!target || target.locked) return null;
  if (split) return { op: "split", id: target.id, at: Number(split[1]) };
  if (interval) return { op: "segment", id: target.id, duration: Number(interval[1]) };
  return { op: "segment", id: target.id, count: Number(match![1]), ...(match![2] ? { duration: Number(match![2]) } : {}) };
}
