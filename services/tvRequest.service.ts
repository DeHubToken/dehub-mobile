import { apiClient } from "../libs";
import { createLogger } from "../libs/logger";

const log = createLogger("tvRequest");

/**
 * Approving what a television asked for.
 *
 * A DeHub TV signs in through the Supabase exchange, which issues a session
 * that deliberately cannot move funds — no wallet key ever reaches an appliance
 * sitting in a shared room. So when someone presses Tip on the television, the
 * TV does not send anything: it raises a request, and this phone — which
 * already holds the unlocked wallet — is what actually signs and submits.
 *
 * The server in between is a postbox. It never signs, never holds a key, and
 * never learns one.
 *
 * The request carries INTENT only: an amount, a symbol, a recipient. This
 * client resolves the token address, the decimals, the controller and the
 * chain, because a television that could name a contract address would be a
 * television that could be talked into naming the wrong one.
 */

export type TvRequestKind = "tip" | "buy" | "mint" | "subscribe";
export type TvRequestStatus = "pending" | "approved" | "rejected" | "failed";

export interface TvRequestPayload {
  tokenId?: number;
  amount?: number;
  tokenSymbol?: string;
  recipient?: string;
  recipientName?: string;
  postTitle?: string;
  [key: string]: unknown;
}

export interface TvRequest {
  requestId: string;
  kind: TvRequestKind;
  payload: TvRequestPayload;
  status: TvRequestStatus;
  /** Which television asked — shown in the prompt so the user knows. */
  deviceName: string | null;
  txHash: string | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
}

/** Everything waiting for this account to answer. Never returns expired rows. */
export async function getPendingTvRequests(): Promise<TvRequest[]> {
  try {
    const res = await apiClient.get<{ requests?: TvRequest[] }>("/tv/requests/pending", {
      isAuthRequired: true,
    });
    return Array.isArray(res?.requests) ? res.requests : [];
  } catch (e) {
    log.warn("getPendingTvRequests failed", e);
    return [];
  }
}

/**
 * Report the outcome.
 *
 * An `approved` resolution MUST carry the hash of the transaction that was
 * actually submitted. Without it the television tells its owner the tip went
 * through with nothing behind the claim — and the server rejects it for
 * exactly that reason, so this is not a rule worth working around here.
 *
 * The call is terminal server-side: a second resolve for the same request
 * changes nothing and answers 409. That is deliberate, and it is what stops a
 * double tap turning into a second transaction.
 */
export async function resolveTvRequest(
  requestId: string,
  outcome:
    | { status: "approved"; txHash: string }
    | { status: "rejected" }
    | { status: "failed"; error?: string },
): Promise<boolean> {
  try {
    await apiClient.post(
      `/tv/requests/${encodeURIComponent(requestId)}/resolve`,
      outcome,
      { isAuthRequired: true },
    );
    return true;
  } catch (e) {
    log.warn("resolveTvRequest failed", e);
    return false;
  }
}

/** Seconds left, floored at zero. Used to age a prompt out of the UI. */
export function secondsRemaining(request: TvRequest): number {
  const ms = Date.parse(request.expiresAt) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
}
