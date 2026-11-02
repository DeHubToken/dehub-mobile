/**
 * Which reveal the next paid unlock plays. They take turns so each one feels
 * fresh: coin drop, confetti, foil peel. Same order as the website.
 */
import { storage } from "./storage";

export type UnlockRevealKind = "coin" | "confetti" | "foil";
const ORDER: UnlockRevealKind[] = ["coin", "confetti", "foil"];
const KEY = "dehub.unlockReveal.n";

export function nextUnlockRevealKind(): UnlockRevealKind {
  let n = 0;
  try { n = storage.getNumber(KEY) ?? 0; } catch { /* storage unavailable */ }
  try { storage.set(KEY, n + 1); } catch { /* storage unavailable */ }
  return ORDER[((n % ORDER.length) + ORDER.length) % ORDER.length];
}
