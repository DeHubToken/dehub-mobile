import { apiClient } from '../../libs/api.client';
import * as SecureStore from 'expo-secure-store';

const mockStore = SecureStore as jest.Mocked<typeof SecureStore> & {
  __store: Record<string, string>;
  __clear: () => void;
};

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('../../libs/token-refresh', () => ({
  tokenRefreshManager: {
    ensureFreshToken: jest.fn().mockResolvedValue(undefined),
    attemptRefresh: jest.fn().mockResolvedValue(null),
  },
}));

describe('libs/api.client', () => {
  beforeEach(() => {
    mockStore.__clear();
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  describe('GET requests', () => {
    it('makes GET request with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: 'test' }),
      });

      const result = await apiClient.get('/test', { isAuthRequired: false });
      expect(result).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/test');
      expect(opts.method).toBe('GET');
      expect(opts.headers['Accept']).toBe('application/json');
      expect(opts.headers['X-Client-Type']).toBe('mobile');
    });
  });

  describe('POST requests', () => {
    it('sends JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ success: true }),
      });

      const result = await apiClient.post('/create', { name: 'test' }, { isAuthRequired: false });
      expect(result).toEqual({ success: true });

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(opts.body)).toEqual({ name: 'test' });
    });
  });

  describe('error handling', () => {
    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ message: 'Bad request' }),
      });

      await expect(
        apiClient.get('/fail', { isAuthRequired: false })
      ).rejects.toThrow('Bad request');
    });

    it('adds HTML hint when response is HTML', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html>502 Bad Gateway</html>'),
      });

      await expect(
        apiClient.get('/fail', { isAuthRequired: false })
      ).rejects.toThrow(/HTML/);
    });

    it('handles 204 No Content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: { get: () => '' },
      });

      const result = await apiClient.delete('/item/1', { isAuthRequired: false });
      expect(result).toBeUndefined();
    });

    it('handles non-JSON response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('plain text response'),
      });

      const result = await apiClient.get('/plain', { isAuthRequired: false });
      expect(result).toEqual({ raw: 'plain text response' });
    });
  });

  describe('auth headers', () => {
    it('attaches Bearer token for auth-required requests', async () => {
      mockStore.__store['auth_token'] = 'my-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ ok: true }),
      });

      await apiClient.get('/protected');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer my-token');
    });
  });

  describe('401 retry', () => {
    it('retries with new token on 401', async () => {
      const { tokenRefreshManager } = require('../../libs/token-refresh');
      tokenRefreshManager.attemptRefresh.mockResolvedValueOnce('new-token');

      mockStore.__store['auth_token'] = 'expired-token';

      // First call: 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      // Retry call: success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: 'retried' }),
      });

      const result = await apiClient.get('/protected');
      expect(result).toEqual({ data: 'retried' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws "Authentication required" when refresh fails', async () => {
      const { tokenRefreshManager } = require('../../libs/token-refresh');
      tokenRefreshManager.attemptRefresh.mockResolvedValueOnce(null);

      mockStore.__store['auth_token'] = 'expired';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      await expect(apiClient.get('/protected')).rejects.toThrow('Authentication required');
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token', async () => {
      expect(await apiClient.isAuthenticated()).toBe(false);
    });

    it('returns true when token exists', async () => {
      mockStore.__store['auth_token'] = 'a-token';
      expect(await apiClient.isAuthenticated()).toBe(true);
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ ok: true }),
      });
    });

    it('put sends PUT method', async () => {
      await apiClient.put('/update', { a: 1 }, { isAuthRequired: false });
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('patch sends PATCH method', async () => {
      await apiClient.patch('/patch', { a: 1 }, { isAuthRequired: false });
      expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });

    it('delete sends DELETE method', async () => {
      await apiClient.delete('/remove', { isAuthRequired: false });
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('timeouts', () => {
    it('passes an abort signal on every request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ ok: true }),
      });

      await apiClient.get('/test', { isAuthRequired: false });
      expect(mockFetch.mock.calls[0][1].signal).toBeDefined();
    });

    it('rejects with RequestTimeoutError when the socket never answers', async () => {
      // A fetch that settles only when aborted is what a dead mobile radio
      // looks like: no response, no rejection, forever. Before the signal
      // existed this promise simply never resolved, so React Query's retry
      // never fired and the caller sat on a skeleton indefinitely.
      mockFetch.mockImplementationOnce(
        (_url: string, init: any) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const err: any = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      );

      await expect(
        apiClient.get('/hangs', { isAuthRequired: false, timeoutMs: 10 }),
      ).rejects.toMatchObject({ name: 'RequestTimeoutError', isTimeout: true });
    });

    it('does not abort a request that answers in time', async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  headers: { get: () => 'application/json' },
                  json: () => Promise.resolve({ ok: true }),
                }),
              5,
            ),
          ),
      );

      await expect(
        apiClient.get('/slow', { isAuthRequired: false, timeoutMs: 500 }),
      ).resolves.toEqual({ ok: true });
    });
  });
});
