jest.mock('../../libs', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ warn: jest.fn() }) }));
import { apiClient } from '../../libs';
import { lookupPairing } from '../../services/tvPairing.service';

const get = apiClient.get as jest.Mock;
const failWith = (status?: number, message = 'failed') =>
  Object.assign(new Error(message), status === undefined ? {} : { status });

beforeEach(() => get.mockReset());

it('names the device behind a live code', async () => {
  get.mockResolvedValue({ deviceName: 'Living room TV', expiresAt: '2026-09-29T12:00:00Z' });
  expect(await lookupPairing('ABCD-1234')).toEqual({ deviceName: 'Living room TV', expiresAt: '2026-09-29T12:00:00Z' });
});

it('keeps an empty answer and any 4xx as "not found"', async () => {
  get.mockResolvedValueOnce({});
  expect(await lookupPairing('ABCD-1234')).toBeNull();
  for (const status of [400, 404, 410]) {
    get.mockRejectedValueOnce(failWith(status));
    expect(await lookupPairing('ABCD-1234')).toBeNull();
  }
});

// A failed request says nothing about the code, so the screen must not blame it.
it('reports a failed lookup as an error, not as a wrong code', async () => {
  get.mockRejectedValueOnce(new TypeError('Network request failed'));
  expect(await lookupPairing('ABCD-1234')).toBe('error');
  get.mockRejectedValueOnce(Object.assign(new Error('Request timed out'), { isTimeout: true }));
  expect(await lookupPairing('ABCD-1234')).toBe('error');
  get.mockRejectedValueOnce(new Error('Authentication required'));
  expect(await lookupPairing('ABCD-1234')).toBe('error');
  get.mockRejectedValueOnce(failWith(502));
  expect(await lookupPairing('ABCD-1234')).toBe('error');
});
