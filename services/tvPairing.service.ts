import { apiClient } from "../libs";
import { createLogger } from "../libs/logger";

const log = createLogger("tvPairing");

/**
 * Signing a television in from this phone.
 *
 * The TV shows a code and polls; this device — already signed in — approves it,
 * and the TV collects a session on its next poll. The address that ends up on
 * the television is taken from THIS phone's token, server-side. It is never
 * sent, because a code readable off a screen is not enough to prove whose
 * account should land on the other end.
 *
 * A word on what is actually being authorised, because it is easy to
 * under-state: approving hands a full session to whatever device is holding
 * that code. If someone else is displaying it — a screenshot, a stream, a
 * screen in a shop — they get into the account, not the person approving. That
 * is why `lookup` exists and why the screen must name the device before asking.
 */

export interface TvPairingTarget {
  deviceName: string;
  expiresAt: string;
}

/** Normalise what someone typed: case, spaces, and the optional dash. */
export function normalisePairingCode(raw: string): string {
  const bare = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return bare.length > 4 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

export function isCompletePairingCode(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
}

/**
 * Name the device behind a code, before committing to it.
 *
 * Returns null when the code is unknown or dead, which covers both "typed it
 * wrong" and "waited too long" — the server does not distinguish, and neither
 * should the screen, because saying which would tell an enumerator whether a
 * code exists.
 */
export async function lookupPairing(code: string): Promise<TvPairingTarget | null> {
  try {
    const res = await apiClient.get<any>("/tv/pair/lookup", {
      isAuthRequired: true,
      params: { code },
    });
    if (!res?.deviceName) return null;
    return { deviceName: res.deviceName, expiresAt: res.expiresAt };
  } catch (e) {
    log.warn("lookupPairing failed", e);
    return null;
  }
}

/** Approve, or refuse. Returns false when the code has expired or been used. */
export async function resolvePairing(code: string, approve: boolean): Promise<boolean> {
  try {
    await apiClient.post(
      "/tv/pair/approve",
      { code, ...(approve ? {} : { reject: true }) },
      { isAuthRequired: true },
    );
    return true;
  } catch (e) {
    log.warn("resolvePairing failed", e);
    return false;
  }
}
