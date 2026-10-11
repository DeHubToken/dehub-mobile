
import { parsePresenceRequest } from '../../libs/map-presence';

const request = { source: 'gods-eye-view', type: 'presence-place-requested', requestId: 'pin-1' };
describe('community map requests', () => {
  it('accepts device location, a chosen point, and removal', () => {
    expect(parsePresenceRequest(request)).toEqual(request);
    expect(parsePresenceRequest({ ...request, latitude: 0, longitude: -180 })).toMatchObject({ latitude: 0, longitude: -180 });
    expect(parsePresenceRequest({ ...request, type: 'presence-remove-requested' })?.type).toBe('presence-remove-requested');
  });
  it.each([
    { latitude: null, longitude: 0 }, { latitude: 0 }, { latitude: '51', longitude: 0 },
    { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 }, { latitude: 0, longitude: Infinity },
  ])('rejects malformed coordinates without falling back to GPS: %j', (coords) => {
    expect(parsePresenceRequest({ ...request, ...coords })).toBeNull();
  });
  it('rejects unrelated messages and arbitrary operations', () => {
    expect(parsePresenceRequest({ ...request, source: 'other' })).toBeNull();
    expect(parsePresenceRequest({ ...request, type: 'POST' })).toBeNull();
    expect(parsePresenceRequest({ ...request, requestId: '' })).toBeNull();
    expect(parsePresenceRequest({ ...request, type: 'presence-remove-requested', latitude: 0, longitude: 0 })).toBeNull();
  });
});
