import * as SecureStore from 'expo-secure-store';
import { readLogIdentity } from '../../libs/logIdentity';

describe('startup log identity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the stored account before React auth hydration', () => {
    (SecureStore.getItem as jest.Mock).mockReturnValue(JSON.stringify({ walletAddress: '0xABC' }));
    expect(readLogIdentity()).toBe('0xabc');
  });

  it('supports the legacy address field', () => {
    (SecureStore.getItem as jest.Mock).mockReturnValue(JSON.stringify({ address: '0xDEF' }));
    expect(readLogIdentity()).toBe('0xdef');
  });

  it.each([null, 'null', '{broken', '{"address":42}'])('tolerates unavailable or corrupt storage: %s', raw => {
    (SecureStore.getItem as jest.Mock).mockReturnValue(raw);
    expect(readLogIdentity()).toBeNull();
  });

  it('does not crash boot when native storage fails', () => {
    (SecureStore.getItem as jest.Mock).mockImplementation(() => { throw new Error('locked'); });
    expect(readLogIdentity()).toBeNull();
  });
});
