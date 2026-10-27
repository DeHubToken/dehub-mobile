import { askSceneAgent } from "./agent";

const REWRITE_LIMIT = 600;

/** The instruction that asks the planner to tidy a rough request without editing anything. */
export function rewriteInstruction(rough: string) {
  return `Rewrite this rough video edit request as one clear, specific instruction for an editor. Keep every detail the person gave, add nothing new, and reply with only the rewritten request. Do not return any operations.\n\nRequest: ${rough.trim().slice(0, REWRITE_LIMIT)}`;
}

/** Strip quotes and labels a planner may wrap around the rewritten text. */
export function cleanRewrite(reply: string, rough: string) {
  const text = reply.trim().replace(/^(rewritten( request)?|request)\s*:\s*/i, "").replace(/^["'“]+|["'”]+$/g, "").trim();
  return text && text.length <= REWRITE_LIMIT * 2 ? text : rough;
}

/** Turn a rough idea into a clearer edit request. Never applies edits. */
export async function rewritePrompt(rough: string, signal?: AbortSignal) {
  const { reply } = await askSceneAgent([{ role: "user", content: rewriteInstruction(rough) }], { layers: [] }, signal);
  return cleanRewrite(reply, rough);
}
