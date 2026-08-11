import { Platform } from 'react-native';
import Constants from 'expo-constants';
import env from '../config/env';
import { createAuthHeaders, getAuthToken } from './auth.utils';
import { tokenRefreshManager } from './token-refresh';
import { getDeviceHeaders } from './device';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const PLATFORM = Platform.OS; // 'ios' | 'android'

// Base API URL - replace with your actual API URL
const API_BASE_URL = env.API_URL;

/**
 * Wall-clock ceiling on a single request.
 *
 * There was none. `fetch` with no signal hangs for the platform default, which
 * on a degraded mobile radio means a promise that never settles — and one that
 * never settles never rejects, so React Query's `retry` never fires and the
 * caller sits on a skeleton indefinitely with no error and no way back. That is
 * the "the feed just spins forever" report.
 *
 * 20s is generous for an API that normally answers in well under one. It is a
 * backstop against a dead socket, not a latency budget.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

/** Uploads push real bytes over a slow uplink, so they get their own ceiling. */
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Rejects with something callers can branch on: a timeout is a retryable
 * network condition, not a 4xx, and the two should not look the same to error
 * handling or to the copy shown to the user.
 */
export class RequestTimeoutError extends Error {
  readonly isTimeout = true;
  readonly url: string;
  constructor(url: string, ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'RequestTimeoutError';
    this.url = url;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  isAuthRequired?: boolean;
  params?: Record<string, any>;
  /** Override the request ceiling. Defaults to 20s, or 120s for FormData bodies. */
  timeoutMs?: number;
  /**
   * Skip the console.error on failure. For calls where a non-2xx response is
   * expected control flow the caller fully handles (e.g. the Supabase
   * session-exchange shortcut, which 409s for every first login), so the log
   * doesn't read as a crash.
   */
  quiet?: boolean;
}

/**
 * API client that handles auth tokens and standard API interactions
 */
export const apiClient = {
  /**
   * Send a request to the API
   * @param endpoint - API endpoint path
   * @param options - Request options
   * @returns Promise with the response data
   */
  async fetch<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      headers = {},
      isAuthRequired = true,
      params,
      timeoutMs,
      quiet = false,
    } = options;

    // Construct full URL, appending query params if provided
    let url = `${API_BASE_URL}${endpoint}`;
    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    
    // Prepare headers
    // Robust RN FormData detection: works across polyfills/realms
    const isFormData = (
      typeof FormData !== 'undefined' && (
        (body as any) instanceof FormData ||
        (body && (body as any)[Symbol.toStringTag] === 'FormData') ||
        (body && typeof (body as any).append === 'function' && typeof (body as any).getParts === 'function')
      )
    );
    const requestHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'X-Client-Type': 'mobile',
      'X-Platform': PLATFORM,
      'X-App-Version': APP_VERSION,
      ...(await getDeviceHeaders()),
      ...headers,
    };
    if (!isFormData) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    
    // Add auth headers if required
    if (isAuthRequired) {
      // Proactively refresh token if it's about to expire
      await tokenRefreshManager.ensureFreshToken();
      const authHeaders = await createAuthHeaders();
      Object.assign(requestHeaders, authHeaders);
    }
    
    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders,
    };

    // Add body if provided
    if (body) {
      requestOptions.body = isFormData ? body : JSON.stringify(body);
    }

    const limitMs = timeoutMs ?? (isFormData ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

    /**
     * One controller per attempt. The 401 path below retries with a fresh
     * token, and that retry needs its own clock rather than whatever was left
     * of the first one's.
     */
    const withTimeout = async (init: RequestInit): Promise<Response> => {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, limitMs);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } catch (err: any) {
        // An abort we caused reads as a plain AbortError, which is
        // indistinguishable from a caller cancelling. Re-throw as our own type
        // so the difference survives.
        if (timedOut) throw new RequestTimeoutError(url, limitMs);
        throw err;
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const response = await withTimeout(requestOptions);

      const status = response.status;
      const contentType = response.headers.get('content-type') || '';
      let rawBody: string | undefined;
      let data: any = undefined;

      // Handle 204 / 205 no content early
      if (status === 204 || status === 205) {
        // @ts-expect-error allow void when caller expects something
        return undefined;
      }

      // Decide how to parse body
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonErr: any) {
          // Fallback to text to inspect unexpected HTML or error pages
            rawBody = await response.text();
            console.warn('[apiClient] JSON parse failed, raw body snippet:', rawBody.slice(0, 200));
            throw new Error(`Invalid JSON response (status ${status}): ${jsonErr?.message}`);
        }
      } else {
        rawBody = await response.text();
        // Try a best-effort JSON parse if body starts with '{' or '['
        const trimmed = rawBody.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            data = JSON.parse(trimmed);
          } catch {
            data = { raw: trimmed };
          }
        } else {
          // Likely HTML / plain text error page
          data = { raw: trimmed };
        }
      }

      if (!response.ok) {
        if (status === 401 && isAuthRequired && !endpoint.includes('/auth/refresh')) {
          // Attempt to refresh the token and retry the request
          const newToken = await tokenRefreshManager.attemptRefresh();
          if (newToken) {
            requestHeaders['Authorization'] = `Bearer ${newToken}`;
            const retryOptions: RequestInit = {
              method,
              headers: requestHeaders,
            };
            if (body) {
              retryOptions.body = isFormData ? body : JSON.stringify(body);
            }
            const retryResponse = await withTimeout(retryOptions);
            if (retryResponse.ok) {
              const retryContentType = retryResponse.headers.get('content-type') || '';
              if (retryResponse.status === 204 || retryResponse.status === 205) {
                // @ts-expect-error allow void when caller expects something
                return undefined;
              }
              if (retryContentType.includes('application/json')) {
                return await retryResponse.json() as T;
              }
              const retryText = await retryResponse.text();
              const trimmedRetry = retryText.trim();
              if (trimmedRetry.startsWith('{') || trimmedRetry.startsWith('[')) {
                try { return JSON.parse(trimmedRetry) as T; } catch { return { raw: trimmedRetry } as any; }
              }
              return { raw: trimmedRetry } as any;
            }
            // Retry also failed — fall through to throw
          }
          // Refresh failed or retry failed — throw original 401
          throw new Error('Authentication required');
        }

        // Prefer API provided message
        const message = data?.message || data?.error || (typeof data === 'string' ? data : undefined) || 'API request failed';
        // Add hint if we got HTML
        const htmlHint = rawBody && rawBody.trim().startsWith('<') ? ' (Received HTML instead of JSON - check endpoint URL / server / proxy / CORS)' : '';
        // Attach status/code so callers that need to branch on the specific
        // failure (e.g. 409 WALLET_NOT_LINKED) don't have to re-parse the message.
        const err: any = new Error(message + htmlHint);
        err.status = status;
        if (data?.code) err.code = data.code;
        throw err;
      }

      // No success log here on purpose. It used to be:
      //
      //   console.log(`[apiClient] Success (${url}):`,
      //               JSON.stringify(data).slice(0, 200));
      //
      // which serialised the ENTIRE response on the JS thread — a full feed
      // page, every page — in order to print 200 characters of it. Metro's
      // `pure_funcs: ['console.log']` drops the call in release but not its
      // argument: terser cannot prove `JSON.stringify(data)` is side-effect
      // free, because a `toJSON` getter could do anything. So the serialisation
      // survived minification and ran on every successful request in
      // production. Anything that needs this belongs behind `createLogger`,
      // which is gated on DEBUG.
      return data as T;
    } catch (error) {
      if (!quiet) console.error(`API Error (${url}):`, error);
      throw error;
    }
  },
  
  // Convenience methods for different HTTP methods
  get<T = any>(endpoint: string, options?: Omit<ApiOptions, 'method' | 'body'>): Promise<T> {
    return this.fetch<T>(endpoint, { ...options, method: 'GET' });
  },
  
  post<T = any>(endpoint: string, body: any, options?: Omit<ApiOptions, 'method' | 'body'>): Promise<T> {
    return this.fetch<T>(endpoint, { ...options, method: 'POST', body });
  },
  
  put<T = any>(endpoint: string, body: any, options?: Omit<ApiOptions, 'method' | 'body'>): Promise<T> {
    return this.fetch<T>(endpoint, { ...options, method: 'PUT', body });
  },
  
  delete<T = any>(endpoint: string, options?: Omit<ApiOptions, 'method'>): Promise<T> {
    return this.fetch<T>(endpoint, { ...options, method: 'DELETE' });
  },
  
  patch<T = any>(endpoint: string, body: any, options?: Omit<ApiOptions, 'method' | 'body'>): Promise<T> {
    return this.fetch<T>(endpoint, { ...options, method: 'PATCH', body });
  },
  
  /**
   * Check if user is authenticated by validating the token
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await getAuthToken();
      if (!token) return false;
      
      // You could make a lightweight API call to validate the token
      // Or check token expiration locally
      
      return true;
    } catch (error) {
      return false;
    }
  }
};
