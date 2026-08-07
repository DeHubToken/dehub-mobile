import { Platform } from "react-native";
import Constants from "expo-constants";
import env from "../config/env";
import { createAuthHeaders } from "../libs/auth.utils";
import { tokenRefreshManager } from "../libs/token-refresh";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const PLATFORM = Platform.OS;
const API_BASE_URL = env.API_URL;

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface XhrUploadOptions {
  endpoint: string;
  formData: FormData;
  onProgress?: (fraction: number) => void;
  abortRef?: { current: boolean };
  /** Unwrap `{ result: … }` envelopes — mirrors dehubweb authedUpload. Default true. */
  unwrapResult?: boolean;
}

/** Normalize mint/upload API payloads (`{ result }`, `{ data }`, or flat). */
export function unwrapUploadResponse<T = any>(res: unknown, unwrapResult = true): T {
  const raw = (res as any)?.data ?? res;
  if (!unwrapResult) return raw as T;
  return ((raw as any)?.result ?? raw) as T;
}

/** True when a thrown/rejected upload error looks like an upstream Solana RPC 429. */
export function isRateLimitUploadError(message?: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("busy right now")
  );
}

/** Turn backend mint/upload error bodies into a user-facing message. */
export function formatUploadErrorMessage(body: any, fallback: string): string {
  const parts = [body?.message, body?.msg, body?.error_msg, body?.error]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ");

  const lower = parts.toLowerCase();
  if (isRateLimitUploadError(lower)) {
    return (
      "Solana posting is temporarily unavailable — DeHub's server hit an RPC rate limit. " +
      "Wait a few minutes and retry, or switch to Base/BNB to post now."
    );
  }
  if (lower.includes("insufficient") && lower.includes("sol")) {
    return "Insufficient SOL for transaction fees. Add a small amount of SOL to your wallet and try again.";
  }

  return body?.msg || body?.error_msg || body?.message || fallback;
}

export async function xhrUploadFormData<T = any>(
  opts: XhrUploadOptions,
): Promise<T> {
  await tokenRefreshManager.ensureFreshToken();
  const authHeaders = await createAuthHeaders();

  const url = `${API_BASE_URL}${opts.endpoint}`;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Client-Type", "mobile");
    xhr.setRequestHeader("X-Platform", PLATFORM);
    xhr.setRequestHeader("X-App-Version", APP_VERSION);

    for (const [key, value] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.responseType = "text";

    if (xhr.upload && opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && opts.onProgress) {
          const frac = Math.min(e.loaded / e.total, 1);
          opts.onProgress(frac);
        }
      };
    }

    xhr.onload = () => {
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            resolve(unwrapUploadResponse<T>(parsed, opts.unwrapResult !== false));
          } catch {
            reject(new Error("Invalid JSON response from server"));
          }
        } else {
          let msg = `Upload failed (${xhr.status})`;
          let body: any;
          try {
            body = JSON.parse(xhr.responseText);
            msg = formatUploadErrorMessage(body, msg);
          } catch {}
          // msg is a one-line summary; the rest of the body is usually where
          // the actual cause (a validation error, a chain-specific reason) is.
          console.error(`[xhr-upload] ${opts.endpoint} failed (${xhr.status})`, body ?? xhr.responseText);
          reject(new Error(msg));
        }
      });
    };

    xhr.onerror = () => {
      settle(() => reject(new Error("Network error during upload")));
    };

    xhr.ontimeout = () => {
      settle(() => reject(new Error("Upload timed out")));
    };

    // Periodically check if abort was requested
    if (opts.abortRef) {
      const check = setInterval(() => {
        if (opts.abortRef?.current) {
          clearInterval(check);
          xhr.abort();
          settle(() => reject(new Error("Upload cancelled")));
        }
      }, 500);

      const origOnload = xhr.onload;
      xhr.onload = (...args) => {
        clearInterval(check);
        origOnload?.call(xhr, ...args);
      };

      const origOnerror = xhr.onerror;
      xhr.onerror = (...args) => {
        clearInterval(check);
        origOnerror?.call(xhr, ...args);
      };
    }

    xhr.send(opts.formData);
  });
}
