import { createAuthHeaders, getAuthToken } from './authUtils';

// Base API URL - replace with your actual API URL
const API_BASE_URL = 'https://api.your-app.com';

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
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    };
    
    // Add auth headers if required
    if (isAuthRequired) {
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
      requestOptions.body = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(url, requestOptions);
      
      // Parse the response body as JSON
      const data = await response.json();
      
      // Check for error responses
      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          // You could trigger a sign out or token refresh here
          throw new Error('Authentication required');
        }
        
        throw new Error(data.message || 'API request failed');
      }
      
      return data;
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
