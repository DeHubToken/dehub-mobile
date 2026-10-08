import env from "../../config/env";
import type { HighlightRange } from "./highlights";
import { validVisualBatch, type VisualBatch } from "./visualHighlightContract";

export async function analyseVisualHighlights(batch: VisualBatch, signal: AbortSignal): Promise<HighlightRange[]> {
  if (signal.aborted) throw new Error("cancelled");
  if (!validVisualBatch(batch)) throw new Error("visual_frames_invalid");
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/editor-visual-highlights`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(batch), signal,
  });
  const data = await response.json().catch(() => null);
  if (signal.aborted) throw new Error("cancelled");
  if (!response.ok || data?.contract !== 1 || !Array.isArray(data?.moments)) throw new Error(response.status === 429 ? "rate_limited" : "unavailable");
  return data.moments;
}
