/**
 * DePin service
 * =============
 * Public network stats and the signed-in wallet's node ledger, mirroring the
 * web app's `src/lib/api/dehub/depin.ts`.
 *
 * The backend for this feature may not be deployed everywhere yet, so a failed
 * request is folded into the same `{ ok: false }` shape the API uses for "not
 * tracked". The screen then shows an honest "not tracked yet" state instead of
 * a generic error.
 */
import { apiClient } from "../libs/api.client";

export interface DepinStats {
  onlineNodes: number;
  totalStoredBytes: number;
  totalVerifiedBytes: number;
}

export interface DepinUnavailable {
  ok: false;
  reason: string;
  message?: string;
}

export type DepinStatsResponse = DepinStats | DepinUnavailable;

export type DepinNodeStatus = "unregistered" | "online" | "offline";

export interface DepinMe {
  /** Null until this wallet has connected as a node at least once. */
  nodeId: string | null;
  status: DepinNodeStatus;
  storedBytes: number;
  verifiedBytes: number;
  dhbEarnedThisPeriod: number;
}

export type DepinMeResponse = DepinMe | DepinUnavailable;

export function isDepinUnavailable(payload: unknown): payload is DepinUnavailable {
  return !!payload && typeof payload === "object" && (payload as { ok?: unknown }).ok === false;
}

/** The API answers `{ status, result }`; callers here want the payload. */
function unwrap<T>(payload: unknown): T {
  const envelope = payload as { result?: T } | null;
  if (envelope && typeof envelope === "object" && envelope.result != null) {
    return envelope.result;
  }
  return payload as T;
}

function unconfigured(err: unknown): DepinUnavailable {
  return { ok: false, reason: "unconfigured", message: err instanceof Error ? err.message : undefined };
}

/** Public — no wallet or auth required. */
export async function getDepinStats(): Promise<DepinStatsResponse> {
  try {
    const payload = await apiClient.get<unknown>("/depin/stats", { isAuthRequired: false, quiet: true });
    if (isDepinUnavailable(payload)) return payload;
    return unwrap<DepinStats>(payload);
  } catch (err) {
    return unconfigured(err);
  }
}

/** Authenticated — the signed-in wallet's own node ledger. */
export async function getDepinMe(): Promise<DepinMeResponse> {
  try {
    const payload = await apiClient.get<unknown>("/depin/me", { quiet: true });
    if (isDepinUnavailable(payload)) return payload;
    return unwrap<DepinMe>(payload);
  } catch (err) {
    return unconfigured(err);
  }
}
