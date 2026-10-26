import { largestJobReceipt } from '../libs/jobPaymentBalance';

describe('banked generation payments', () => {
  it('permits a single owned receipt with zero wallet balance and never pools small receipts', () => {
    expect(Math.max(0, largestJobReceipt('alice', 'alice', [{ purpose: 'job', remainingDhb: 100 }])) >= 100).toBe(true);
    expect(largestJobReceipt('alice', 'alice', [{ remainingDhb: 40 }, { remainingDhb: 60 }]) >= 100).toBe(false);
  });
  it('excludes voice, invalid balances and stale data from another account', () => {
    const receipts = [{ purpose: 'voice', remainingDhb: 1000 }, { remainingDhb: 30 }, { remainingDhb: NaN }];
    expect(largestJobReceipt('alice', 'ALICE', receipts)).toBe(30);
    expect(largestJobReceipt('bob', 'alice', receipts)).toBe(0);
    expect(largestJobReceipt(null, 'alice', receipts)).toBe(0);
  });
});
