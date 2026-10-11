import { normalizeSubReferral, referralFromUrl } from '../../libs/affiliate-subref';

describe('outreach referral tags', () => {
  it('retains the parent code with bounded, optional outreach identifiers', () => {
    expect(referralFromUrl('https://dehub.io/r/N849U2PZ?sub=john')).toEqual({ code: 'N849U2PZ', subId: 'john' });
    expect(referralFromUrl('https://dehub.io/converter?ref=N849U2PZ&sub=sarah')).toEqual({ code: 'N849U2PZ', subId: 'sarah' });
    expect(referralFromUrl('dehub://r/N849U2PZ?sub=team-1')).toEqual({ code: 'N849U2PZ', subId: 'team-1' });
  });
  it('ignores unsafe or oversized tags without losing the parent', () => {
    for (const sub of ['', 'a'.repeat(65), '<script>', 'first last', '../path/name']) {
      expect(normalizeSubReferral(sub)).toBeNull();
      expect(referralFromUrl('https://dehub.io/r/N849U2PZ?sub=' + encodeURIComponent(sub))).toEqual({ code: 'N849U2PZ', subId: null });
    }
  });
  it('ignores non-DeHub links and invalid parent codes', () => {
    expect(referralFromUrl('https://other.example/r/N849U2PZ?sub=john')).toBeNull();
    expect(referralFromUrl('https://dehub.io/r/a?sub=john')).toBeNull();
    expect(referralFromUrl('javascript:alert(1)')).toBeNull();
  });
});
