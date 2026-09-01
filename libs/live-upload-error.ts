/**
 * What to tell a creator whose livestream launch just failed.
 *
 * A launch crosses a boundary halfway through. Before the wallet handoff the
 * things that can go wrong are an upload and a server response, and whatever
 * was thrown already says so in words — "Mint payload missing a token id", the
 * API's own error_msg. After it, the thing that can go wrong is a transaction,
 * and an ethers rejection is a dump with an action, a code and a version in it
 * that no creator should be shown. `parseTxError` turns those into a sentence,
 * and it is the only thing that knows a locked wallet is a dismissed biometric
 * prompt rather than a payment that broke (see libs/web3.util).
 *
 * Kept out of the hook so the decision can be tested without mounting a
 * navigator, an auth context and a web3 provider to reach it.
 */
import { parseTxError } from "./web3.util";

export type LiveUploadStage =
  | "idle"
  | "uploading"
  | "processing"
  | "awaiting-wallet"
  | "minting"
  | "finalizing"
  | "done";

/** The stages where the thing that can fail is a wallet, not an upload. */
export const MINT_STAGES: LiveUploadStage[] = [
  "awaiting-wallet",
  "minting",
  "finalizing",
];

export function liveUploadErrorMessage(
  stage: LiveUploadStage,
  error: any,
): string {
  return MINT_STAGES.includes(stage)
    ? parseTxError(error, "send")
    : error?.message || "Livestream creation failed";
}
