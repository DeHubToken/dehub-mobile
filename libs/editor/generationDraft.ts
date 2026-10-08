/** A draft opens existing generation controls; preparing it never runs a model. */
export interface GenerationDraft {
  kind: "image" | "video" | "voice";
  prompt: string;
  aspect?: string;
}

export function generationDraft(value: unknown, aspect?: string): GenerationDraft | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const kind = input.kind === "voiceover" || input.kind === "speech" || input.kind === "tts" ? "voice" : input.kind;
  if (kind !== "image" && kind !== "video" && kind !== "voice") return null;
  if (typeof input.prompt !== "string" || !input.prompt.trim()) return null;
  const ratio = typeof input.aspect === "string" ? input.aspect : aspect;
  return { kind, prompt: input.prompt.trim(), ...(kind !== "voice" && ratio && /^(16:9|9:16|1:1|4:5)$/.test(ratio) ? { aspect: ratio } : {}) };
}

/** Explicit requests can prepare a draft without asking the remote edit planner. */
export function generationChatRequest(text: string): ({ op: "generate"; [field: string]: unknown } & GenerationDraft) | null {
  const prefix = /^(?:(?:can|could|would) you\s+|please\s+|(?:peux|pouvez)[ -](?:tu|vous)\s+|s['’]il (?:te|vous) pla[iî]t\s+)*(?:generate|create|g[eé]n[eé]r(?:e|er|ez)|cr[eé](?:e|er|ez))\s+(?:(?:an?|some|une?|des|de la|du)\s+)?(image|picture|photo|illustration|video|vid[eé]o|voice[ -]?over|speech|narration|voix off)\b\s*([\s\S]*)$/i.exec(text.trim());
  if (!prefix) return null;
  const medium = prefix[1].toLowerCase();
  const kind = /^(video|vidéo)$/.test(medium) ? "video" : /^(voice[ -]?over|speech|narration|voix off)$/.test(medium) ? "voice" : "image";
  let prompt = prefix[2].trim();
  // Requests to assemble existing clips belong to the timeline planner.
  if (kind !== "voice" && /^(?:from|using|with|out of|à partir de|avec)\s+(?:(?:my|the|these|selected|our|a|an|uploaded|existing|mes|les|ces|une?|sélectionnées?)\s+)*(?:clips?|videos?|vidéos?|photos?|images?|footage|recordings?|media|médias?)\b/i.test(prompt)) return null;
  prompt = prompt.replace(kind === "voice"
    ? /^(?:(?:saying|that says|reading|of|for|with (?:the )?text|qui dit|disant|lisant|pour|de)\b\s*[:\-]?\s*|[:\-]\s*)/i
    : /^(?:(?:of|about|showing|for|de|sur|pour)\b\s*[:\-]?\s*|[:\-]\s*)/i, "").trim();
  const pairs: Record<string, string> = { '"': '"', "'": "'", "“": "”", "‘": "’", "«": "»" };
  if (prompt.length > 1 && pairs[prompt[0]] === prompt[prompt.length - 1]) prompt = prompt.slice(1, -1).trim();
  const draft = generationDraft({ kind, prompt });
  return draft ? { op: "generate", ...draft } : null;
}
