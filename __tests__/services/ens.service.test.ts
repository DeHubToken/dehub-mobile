/**
 * The `/ens/*` endpoints, and the three things easy to get wrong about them.
 *
 * **The prefix.** `env.API_URL` already ends in `/api`, so paths here are
 * written without it. Web's twin of this file writes the same endpoints *with*
 * `/api`, because its client resolves against the bare origin — a path copied
 * across verbatim becomes `/api/api/ens/preview` and 404s on every call.
 *
 * **What is public and what is not.** `preview` has to answer signed out: it is
 * the box someone types into before they have any reason to log in, and it
 * reads Ethereum, not the caller's account. Everything else acts as the caller
 * and must carry auth. Getting `isAuthRequired` backwards on either is
 * invisible until somebody hits it.
 *
 * **The message is never rebuilt here.** `challenge` returns the exact text and
 * `issuedAt`; `link` sends that same `issuedAt` back so the server can
 * reconstruct what was signed. A client that composed its own message would
 * produce signatures that verify against nothing.
 */
import { ensService, EnsApiError } from '../../services/ens.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: { fetch: jest.fn() },
}));

const mockFetch = apiClient.fetch as jest.Mock;

describe('services/ens.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never writes the /api prefix the base URL already carries', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await ensService.preview('mal.eth');
    await ensService.suggest();
    await ensService.challenge('mal.eth');
    await ensService.link({ name: 'mal.eth', issuedAt: 1, signature: '0x1' });
    await ensService.myLink();
    await ensService.unlink();

    for (const call of mockFetch.mock.calls) {
      expect(call[0].startsWith('/ens/')).toBe(true);
      expect(call[0]).not.toContain('/api/');
    }
  });

  it('lets a signed-out visitor resolve a name', async () => {
    mockFetch.mockResolvedValue({ result: { name: 'mal.eth' } });

    await ensService.preview('MAL.eth');

    expect(mockFetch).toHaveBeenCalledWith(
      '/ens/preview',
      expect.objectContaining({ isAuthRequired: false, params: { name: 'MAL.eth' } }),
    );
  });

  it('never lets an anonymous caller suggest, challenge, link or unlink', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await ensService.suggest();
    await ensService.challenge('mal.eth');
    await ensService.link({ name: 'mal.eth', issuedAt: 1, signature: '0x1' });
    await ensService.myLink();
    await ensService.unlink();

    for (const call of mockFetch.mock.calls) {
      // Auth is the client's default, so the assertion is that nothing here
      // opted out of it.
      expect(call[1]?.isAuthRequired).not.toBe(false);
    }
  });

  it('sends the typed name unchanged — normalisation is the server\'s job', async () => {
    // ENSIP-15 rejects a Cyrillic а in `vitalik.eth`. That decision is made
    // against mainnet, so anything the client "cleaned up" first would either
    // be a second, disagreeing implementation or would hide the rejection.
    mockFetch.mockResolvedValue({ result: { name: 'vitalik.eth' } });

    await ensService.preview('  VITALIK.ETH  ');

    expect(mockFetch.mock.calls[0][1].params).toEqual({ name: '  VITALIK.ETH  ' });
  });

  it('carries issuedAt back to link, so the server can rebuild the message', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await ensService.link({ name: 'mal.eth', issuedAt: 1756100000, signature: '0xdead' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/ens/link',
      expect.objectContaining({
        method: 'POST',
        body: { name: 'mal.eth', issuedAt: 1756100000, signature: '0xdead' },
      }),
    );
  });

  it('reads and drops the link through the same path, by method', async () => {
    mockFetch.mockResolvedValue({ result: null });

    await ensService.myLink();
    await ensService.unlink();

    expect(mockFetch.mock.calls[0][0]).toBe('/ens/link');
    expect(mockFetch.mock.calls[0][1]?.method).toBeUndefined();
    expect(mockFetch.mock.calls[1][0]).toBe('/ens/link');
    expect(mockFetch.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('unwraps the { status, result } envelope every endpoint answers with', async () => {
    const preview = {
      name: 'mal.eth',
      ensAddress: '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c',
      held: false,
      heldByUsername: null,
    };
    mockFetch.mockResolvedValueOnce({ status: true, result: preview });

    await expect(ensService.preview('mal.eth')).resolves.toEqual(preview);
  });

  it('answers null for an account wearing no name', async () => {
    mockFetch.mockResolvedValueOnce({ status: true, result: null });

    await expect(ensService.myLink()).resolves.toBeNull();
  });

  it('answers null when the reverse record is unset, which is the usual case', async () => {
    mockFetch.mockResolvedValueOnce({ status: true, result: { name: null } });

    await expect(ensService.suggest()).resolves.toBeNull();
  });

  it('raises the API\'s own message and code on a handled failure', async () => {
    mockFetch.mockResolvedValueOnce({
      status: false,
      error: 'That name does not resolve to an address',
      code: 'ENS_NO_ADDRESS',
      result: null,
    });

    // The code is what lets the panel word "nobody owns this" differently from
    // "we could not reach Ethereum" — an unreachable RPC must never read as a
    // name being free.
    await expect(ensService.preview('nothing.eth')).rejects.toMatchObject({
      name: 'EnsApiError',
      message: 'That name does not resolve to an address',
      code: 'ENS_NO_ADDRESS',
    });
  });

  it('does not mistake a status-less success payload for a failure', async () => {
    mockFetch.mockResolvedValueOnce({ result: { name: 'mal.eth' } });

    await expect(ensService.preview('mal.eth')).resolves.toEqual({ name: 'mal.eth' });
  });

  it('exports the error type so callers can branch on it', () => {
    expect(new EnsApiError('x', 'CODE')).toBeInstanceOf(Error);
  });
});
