import { normalizeCinemaDirection, type CinemaDirection } from '../cinemaDirection';
/** A draft opens existing generation controls; preparing it never runs a model. */
export interface GenerationDraft {
  kind: "image" | "video" | "voice";
  prompt: string;
  aspect?: string;
  references?: { url: string; label: string }[];
  workspaceId?: string;
  draftId?: string;
  cinemaDirection?: CinemaDirection;
  durationSeconds?: number;
  owner?: string | null;
}

export function generationDraft(value: unknown, aspect?: string): GenerationDraft | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const kind = input.kind === "voiceover" || input.kind === "speech" || input.kind === "tts" ? "voice" : input.kind;
  if (kind !== "image" && kind !== "video" && kind !== "voice") return null;
  if (typeof input.prompt !== "string" || !input.prompt.trim()) return null;
  if (input.owner !== undefined && input.owner !== null && (typeof input.owner !== 'string' || !input.owner || input.owner.length > 200 || /\s/.test(input.owner))) return null;
  let references: GenerationDraft['references'];
  if (input.references !== undefined) {
    if (!Array.isArray(input.references) || input.references.length > 4 || (kind !== 'image' && kind !== 'video')) return null;
    references = [];
    for (const reference of input.references) {
      if (!reference || typeof reference !== 'object' || typeof reference.url !== 'string' || reference.url.length > 10000
        || !/^(https:|blob:|file:|content:|data:image\/)/i.test(reference.url) || typeof reference.label !== 'string' || reference.label.length > 200) return null;
      references.push({ url: reference.url, label: reference.label });
    }
  }
  const ratio = typeof input.aspect === "string" ? input.aspect : aspect;
  return { kind, prompt: input.prompt.trim(), ...(kind !== "voice" && ratio && /^(16:9|9:16|1:1|4:5)$/.test(ratio) ? { aspect: ratio } : {}), ...(references ? { references } : {}),
    ...(typeof input.workspaceId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(input.workspaceId) ? { workspaceId: input.workspaceId } : {}),
    ...(typeof input.draftId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(input.draftId) ? { draftId: input.draftId } : {}),
    ...((kind === 'image' || kind === 'video') && input.cinemaDirection !== undefined ? { cinemaDirection: normalizeCinemaDirection(input.cinemaDirection) } : {}),
    ...(kind === 'video' && typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds) && input.durationSeconds >= 1 && input.durationSeconds <= 30 ? { durationSeconds: input.durationSeconds } : {}),
    ...(input.owner === null || typeof input.owner === 'string' ? { owner: typeof input.owner === 'string' ? input.owner.toLowerCase() : null } : {}) };
}

export function generationDraftForOwner(value: unknown, owner: string | null): GenerationDraft | null {
  const draft = generationDraft(value);
  return draft && (draft.owner === undefined || draft.owner === (owner?.toLowerCase() ?? null)) ? draft : null;
}

/** Explicit requests can prepare a draft without asking the remote edit planner. */
export function generationChatRequest(text: string): ({ op: "generate"; [field: string]: unknown } & GenerationDraft) | null {
  const prefix = /^(?:(?:can|could|would) you\s+|please\s+|(?:peux|pouvez)[ -](?:tu|vous)\s+|s['’]il (?:te|vous) pla[iî]t\s+)*(?:generate|create|g[eé]n[eéè]r(?:e|er|ez)|cr[eé](?:e|er|ez))\s+(?:(?:an?|some|une?|des|de la|du)\s+)?(image|picture|photo|illustration|video|vid[eé]o|voice[ -]?over|speech|narration|voix off)\b\s*([\s\S]*)$/i.exec(text.trim());
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
