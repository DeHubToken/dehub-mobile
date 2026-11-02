jest.mock('../../libs/api.client', () => ({ apiClient: { fetch: jest.fn() } }));
import { apiClient } from '../../libs/api.client';
import { githubLink, githubResultFrom, verifiedGithubLogin } from '../../services/github-link.service';
import { RESERVED_LINK_SEGMENTS } from '../../libs/reserved-usernames';

describe('github link service', () => {
  it('starts the app flow so GitHub returns to the app', async () => {
    (apiClient.fetch as jest.Mock).mockResolvedValue({ url: 'https://github.com/login/oauth/authorize?x' });
    await expect(githubLink.connect()).resolves.toContain('github.com');
    expect(apiClient.fetch).toHaveBeenCalledWith('/github-link/connect', { method: 'POST', body: { mobile: true } });
  });

  it('reads the result from the return link', () => {
    expect(githubResultFrom('dehub://github-connected?status=taken')).toBe('taken');
    expect(githubResultFrom('dehub://github-connected?status=nonsense')).toBeNull();
    expect(githubResultFrom(undefined)).toBeNull();
  });

  it('only trusts real GitHub logins', () => {
    expect(verifiedGithubLogin('octo-cat')).toBe('octo-cat');
    expect(verifiedGithubLogin('octo/../x')).toBeUndefined();
    expect(verifiedGithubLogin(undefined)).toBeUndefined();
  });

  it('never reads the return link as a profile', () => {
    expect(RESERVED_LINK_SEGMENTS.has('github-connected')).toBe(true);
  });
});
