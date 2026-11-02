import { apiClient } from '../libs/api.client';

/**
 * Verified GitHub on profiles (dehub-stream-backend src/github-link). The
 * owner signs in to GitHub in the in-app browser; the backend stores the
 * account GitHub vouched for and sends the browser back to GITHUB_REDIRECT.
 */
export interface GithubLinkStatus {
  available: boolean;
  connected: boolean;
  login: string | null;
  verifiedAt: string | null;
}

export type GithubLinkResult = 'connected' | 'taken' | 'cancelled' | 'failed';

export const GITHUB_REDIRECT = 'dehub://github-connected';

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** A GitHub login from the account record's top-level `githubLogin`, or undefined. Never read it from `customs`. */
export function verifiedGithubLogin(raw: unknown): string | undefined {
  return typeof raw === 'string' && LOGIN.test(raw) ? raw : undefined;
}

export const githubProfileUrl = (login: string) => `https://github.com/${login}`;

/** The `status` the backend appended to the redirect, if it is one we know. */
export function githubResultFrom(url: string | null | undefined): GithubLinkResult | null {
  const match = /[?&]status=([a-z]+)/.exec(url || '');
  const value = match?.[1];
  return value === 'connected' || value === 'taken' || value === 'cancelled' || value === 'failed' ? value : null;
}

function unwrap<T>(body: T | { result: T }): T {
  return body && typeof body === 'object' && 'result' in (body as object) ? (body as { result: T }).result : (body as T);
}

export const githubLink = {
  async status(): Promise<GithubLinkStatus> {
    return unwrap(await apiClient.fetch<GithubLinkStatus | { result: GithubLinkStatus }>('/github-link'));
  },
  async connect(): Promise<string> {
    return unwrap(await apiClient.fetch<{ url: string } | { result: { url: string } }>('/github-link/connect', {
      method: 'POST', body: { mobile: true },
    })).url;
  },
  async disconnect(): Promise<GithubLinkStatus> {
    return unwrap(await apiClient.fetch<GithubLinkStatus | { result: GithubLinkStatus }>('/github-link', { method: 'DELETE' }));
  },
};
