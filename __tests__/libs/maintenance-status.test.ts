import { parseMaintenanceStatus, readMaintenanceStatus } from '../../libs/maintenance-status';

describe('maintenance status', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  it('requires an explicit boolean, never a truthy string or error body', () => {
    expect(parseMaintenanceStatus({ enabled: true })).toEqual({ enabled: true });
    expect(parseMaintenanceStatus({ enabled: false })).toEqual({ enabled: false });
    for (const value of [null, {}, { enabled: 'false' }, { error: 'unavailable' }]) expect(parseMaintenanceStatus(value)).toBeNull();
  });
  it('distinguishes reopening from an unavailable status endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: false }) })
      .mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error('offline'));
    expect(await readMaintenanceStatus()).toEqual({ enabled: false });
    expect(await readMaintenanceStatus()).toBeNull();
    expect(await readMaintenanceStatus()).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('https://dehub.io/maintenance.json', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
  });
});
