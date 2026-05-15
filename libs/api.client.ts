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

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  isAuthRequired?: boolean;
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
    } = options;

    // Construct full URL
    const url = `${API_BASE_URL}${endpoint}`;
    
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
    
    try {
      const response = await fetch(url, requestOptions);

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
            const retryResponse = await fetch(url, retryOptions);
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
        throw new Error(message + htmlHint);
      }

      if (response.ok) {
        console.log(`[apiClient] Success (${url}):`, JSON.stringify(data).slice(0, 200));
      }
      return data as T;
    } catch (error) {
      console.error(`API Error (${url}):`, error);
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
