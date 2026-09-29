jest.mock('../../config/env', () => ({
  __esModule: true,
  default: { SUPABASE_URL: 'https://aigxuutjaqsywioxjefr.supabase.co', APP_ORIGIN: 'https://dehub.io' },
}));
jest.mock('../../libs/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const DIRECT = 'https://aigxuutjaqsywioxjefr.supabase.co';
const RELAY = 'https://dehub.io/_sb';
const REST = '/rest/v1/posts?select=*&id=eq.1';
const REFRESH = '/auth/v1/token?grant_type=refresh_token';

const supabaseResponse = (status = 200) =>
  ({ ok: status < 400, status, headers: new Headers({ 'sb-project-ref': 'aigxuutjaqsywioxjefr' }) }) as unknown as Response;
const spaResponse = () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }) }) as unknown as Response;
const networkError = () => new TypeError('Network request failed');

/** Direct host fails with a transport error; the relay answers as Supabase. */
function blockedDirect() {
  return jest.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).startsWith(DIRECT + '/')) throw networkError();
    return supabaseResponse();
  });
}

const urls = (base: jest.Mock) => base.mock.calls.map(([u]) => String(u));

function load(): typeof import('../../libs/supabaseRelayFetch') {
  return require('../../libs/supabaseRelayFetch');
}

describe('supabase relay fetch', () => {
  beforeEach(() => jest.resetModules());
  afterEach(() => jest.useRealTimers());

  it('goes direct and never touches the relay when direct answers', async () => {
    const base = jest.fn(async () => supabaseResponse(404));
    const f = load().createSupabaseRelayFetch(base);
    const res = await f(DIRECT + REST, { method: 'GET' });
    expect(res.status).toBe(404);
    expect(urls(base)).toEqual([DIRECT + REST]);
  });

  it('replays a read once through the relay after a transport failure', async () => {
    const base = blockedDirect();
    const f = load().createSupabaseRelayFetch(base);
    const headers = { apikey: 'anon' };
    const res = await f(DIRECT + REST, { method: 'GET', headers });
    expect(res.status).toBe(200);
    expect(urls(base)).toEqual([DIRECT + REST, RELAY + REST]);
    expect(base.mock.calls[1][1]).toMatchObject({ method: 'GET', headers });
  });

  it('does not replay a REST write, but sends the next request through the relay', async () => {
    const base = blockedDirect();
    const f = load().createSupabaseRelayFetch(base);
    await expect(f(DIRECT + '/rest/v1/posts', { method: 'POST', body: '{"a":1}' })).rejects.toThrow('Network request failed');
    expect(urls(base)).toEqual([DIRECT + '/rest/v1/posts']);

    await f(DIRECT + '/rest/v1/posts', { method: 'PATCH', body: '{"a":2}' });
    expect(urls(base)).toEqual([DIRECT + '/rest/v1/posts', RELAY + '/rest/v1/posts']);
  });

  it('replays a refresh-token grant but not other auth posts', async () => {
    const base = blockedDirect();
    const f = load().createSupabaseRelayFetch(base);
    const body = JSON.stringify({ refresh_token: 'r1' });
    await f(DIRECT + REFRESH, { method: 'POST', body });
    expect(urls(base)).toEqual([DIRECT + REFRESH, RELAY + REFRESH]);
    expect(base.mock.calls[1][1]?.body).toBe(body);

    jest.resetModules();
    const base2 = blockedDirect();
    const f2 = load().createSupabaseRelayFetch(base2);
    await expect(f2(DIRECT + '/auth/v1/token?grant_type=password', { method: 'POST', body })).rejects.toThrow();
    expect(base2).toHaveBeenCalledTimes(1);
  });

  it('leaves URLs outside the project origin alone, even while relaying', async () => {
    const base = blockedDirect();
    const f = load().createSupabaseRelayFetch(base);
    await f(DIRECT + REST);
    base.mockClear();
    await f('https://api.dehub.io/api/feed');
    await f('https://aigxuutjaqsywioxjefr.supabase.co.evil.test/rest/v1/x');
    expect(urls(base)).toEqual(['https://api.dehub.io/api/feed', 'https://aigxuutjaqsywioxjefr.supabase.co.evil.test/rest/v1/x']);
  });

  it('probes direct again once the ten-minute window has passed', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-29T10:00:00Z') });
    const base = blockedDirect();
    const f = load().createSupabaseRelayFetch(base);
    await f(DIRECT + REST);
    base.mockClear();

    jest.setSystemTime(Date.now() + load().RELAY_WINDOW_MS - 1000);
    await f(DIRECT + REST);
    expect(urls(base)).toEqual([RELAY + REST]);
    base.mockClear();

    jest.setSystemTime(Date.now() + 2000);
    base.mockImplementation(async () => supabaseResponse());
    await f(DIRECT + REST);
    expect(urls(base)).toEqual([DIRECT + REST]);
  });

  it('treats a relay that does not answer as Supabase as absent', async () => {
    const base = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith(DIRECT + '/')) throw networkError();
      return spaResponse();
    });
    const f = load().createSupabaseRelayFetch(base);
    await expect(f(DIRECT + REST)).rejects.toThrow('Network request failed');
    base.mockClear();
    await expect(f(DIRECT + REST)).rejects.toThrow('Network request failed');
    expect(urls(base)).toEqual([DIRECT + REST]);
  });

  it('does not reroute a request the caller cancelled', async () => {
    const controller = new AbortController();
    const base = jest.fn(async (): Promise<Response> => {
      controller.abort();
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    });
    const f = load().createSupabaseRelayFetch(base);
    await expect(f(DIRECT + REST, { signal: controller.signal })).rejects.toThrow('Aborted');
    base.mockClear();
    base.mockImplementation(async () => supabaseResponse());
    await f(DIRECT + REST);
    expect(urls(base)).toEqual([DIRECT + REST]);
  });

  it('gives up on a hung direct read and replays it through the relay', async () => {
    jest.useFakeTimers();
    const base = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).startsWith(DIRECT)) return Promise.resolve(supabaseResponse());
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
      });
    });
    const f = load().createSupabaseRelayFetch(base);
    const pending = f(DIRECT + REST);
    await jest.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(urls(base)).toEqual([DIRECT + REST, RELAY + REST]);
  });
});
