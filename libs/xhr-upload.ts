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
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Invalid JSON response from server"));
          }
        } else {
          let msg = `Upload failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body?.msg || body?.error_msg || body?.message) {
              msg = body.msg || body.error_msg || body.message;
            }
          } catch {}
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
