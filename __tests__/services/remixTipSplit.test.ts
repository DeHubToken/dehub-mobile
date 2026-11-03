jest.mock('../../services/supabase', () => ({ supabase: {} }));
jest.mock('../../libs/auth.utils', () => ({ getAuthToken: jest.fn() }));
import { splitRemixTip } from '../../services/remix-links.service';

const share = { sourceTokenId: 1, sourceAddress: '0xa', splitBps: 1000 };

describe('splitRemixTip', () => {
  it('sends 10% to the original creator', () => {
    expect(splitRemixTip(100, share)).toEqual({ source: 10, remixer: 90 });
  });
  it('keeps the whole tip when there is no remix link', () => {
    expect(splitRemixTip(100, null)).toEqual({ source: 0, remixer: 100 });
  });
  it('skips a share too small to send', () => {
    expect(splitRemixTip(0.05, share)).toEqual({ source: 0, remixer: 0.05 });
  });
  it('never sends more than the tip', () => {
    const { source, remixer } = splitRemixTip(3.33, share);
    expect(source + remixer).toBeCloseTo(3.33, 6);
  });
});
