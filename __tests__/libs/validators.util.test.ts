// The module pulls useUser/useProvider from AuthContext for its hook export.
// None of the pure helpers under test touch the context, so stub it out rather
// than dragging the whole provider tree (and its native deps) into the suite.
jest.mock('../../context/AuthContext', () => ({
  useUser: jest.fn(),
  useProvider: jest.fn(() => ({ chainId: undefined })),
}));

import {
  maxStacked,
  isOwner,
  getTotalBountyAmount,
  isValidDataForMinting,
  filteredStreamInfo,
  lockAmountMin,
  bountyAmountMin,
} from '../../libs/validators.util';
import { streamInfoKeys, supportedTokens } from '../../config/constants';

// Derived from the live config so the test tracks whichever token set
// (dev or production) the env mock selects.
const token = supportedTokens[0] as {
  symbol: string;
  chainId: number;
  address: string;
};

describe('libs/validators.util', () => {
  describe('maxStacked', () => {
    it('returns 0 for missing balance data', () => {
      expect(maxStacked(undefined)).toBe(0);
      expect(maxStacked(null)).toBe(0);
    });

    it('returns 0 for an empty list', () => {
      expect(maxStacked([])).toBe(0);
    });

    it('returns the largest staked value', () => {
      expect(maxStacked([{ staked: 5 }, { staked: 12 }, { staked: 3 }])).toBe(12);
    });

    it('treats entries with no staked field as zero', () => {
      expect(maxStacked([{}, { staked: undefined }])).toBe(0);
      expect(maxStacked([{}, { staked: 7 }])).toBe(7);
    });
  });

  describe('isOwner', () => {
    it('matches the minter case-insensitively', () => {
      expect(isOwner({ minter: '0xAbCd' }, '0xabcd')).toBe(true);
      expect(isOwner({ minter: '0xabcd' }, '0xABCD')).toBe(true);
    });

    it('rejects a different account', () => {
      expect(isOwner({ minter: '0xAbCd' }, '0xbeef')).toBe(false);
    });

    it('is false when either side is missing', () => {
      expect(isOwner(null, '0xabcd')).toBe(false);
      expect(isOwner(undefined, '0xabcd')).toBe(false);
      expect(isOwner({ minter: '0xabcd' }, null)).toBe(false);
      expect(isOwner({}, '0xabcd')).toBe(false);
    });
  });

  describe('getTotalBountyAmount', () => {
    it('multiplies the amount by viewers plus comments', () => {
      expect(
        getTotalBountyAmount({
          [streamInfoKeys.addBountyAmount]: 2,
          [streamInfoKeys.addBountyFirstXViewers]: 3,
          [streamInfoKeys.addBountyFirstXComments]: 4,
        })
      ).toBe(14);
    });

    it('returns 0 when nothing is set', () => {
      expect(getTotalBountyAmount({})).toBe(0);
    });

    it('coerces non-numeric input to 0 rather than NaN', () => {
      expect(
        getTotalBountyAmount({
          [streamInfoKeys.addBountyAmount]: 'abc',
          [streamInfoKeys.addBountyFirstXViewers]: 5,
        })
      ).toBe(0);
    });
  });

  describe('isValidDataForMinting', () => {
    const ok = { title: 'A valid title', description: 'A valid description' };

    it('rejects a short title', () => {
      const r = isValidDataForMinting('ab', ok.description, {}, null, {});
      expect(r.isError).toBe(true);
      expect(r.error).toBe('Title is too short');
    });

    it('rejects a short description', () => {
      const r = isValidDataForMinting(ok.title, 'xy', {}, null, {});
      expect(r.isError).toBe(true);
      expect(r.error).toBe('Description is too short');
    });

    it('accepts a plain post with no monetisation', () => {
      expect(
        isValidDataForMinting(ok.title, ok.description, {}, null, {})
      ).toEqual({ isError: false });
    });

    describe('lock content', () => {
      it('flags a zero amount', () => {
        const r = isValidDataForMinting(ok.title, ok.description, {
          [streamInfoKeys.isLockContent]: true,
          [streamInfoKeys.lockContentAmount]: 0,
          [streamInfoKeys.lockContentChainIds]: token.chainId,
          [streamInfoKeys.lockContentTokenSymbol]: token.symbol,
        }, null, {});
        expect(r.isError).toBe(true);
        expect(r.error).toBe('Amount for lock content is invalid!');
      });

      it('flags a missing token symbol', () => {
        const r = isValidDataForMinting(ok.title, ok.description, {
          [streamInfoKeys.isLockContent]: true,
          [streamInfoKeys.lockContentAmount]: 5,
          [streamInfoKeys.lockContentChainIds]: token.chainId,
        }, null, {});
        expect(r.isError).toBe(true);
        expect(r.error).toBe('Token for lock content is invalid!');
      });

      it('flags an amount below the minimum', () => {
        const r = isValidDataForMinting(ok.title, ok.description, {
          [streamInfoKeys.isLockContent]: true,
          [streamInfoKeys.lockContentAmount]: lockAmountMin / 10,
          [streamInfoKeys.lockContentChainIds]: token.chainId,
          [streamInfoKeys.lockContentTokenSymbol]: token.symbol,
        }, null, {});
        expect(r.isError).toBe(true);
        expect(r.error).toBe('Amount for lock content is too small!');
      });

      it('accepts a well-formed lock', () => {
        expect(
          isValidDataForMinting(ok.title, ok.description, {
            [streamInfoKeys.isLockContent]: true,
            [streamInfoKeys.lockContentAmount]: 10,
            [streamInfoKeys.lockContentChainIds]: token.chainId,
            [streamInfoKeys.lockContentTokenSymbol]: token.symbol,
          }, null, {})
        ).toEqual({ isError: false });
      });
    });

    describe('pay per view', () => {
      it('flags a missing token symbol', () => {
        const r = isValidDataForMinting(ok.title, ok.description, {
          [streamInfoKeys.isPayPerView]: true,
          [streamInfoKeys.payPerViewAmount]: 5,
          [streamInfoKeys.payPerViewChainIds]: token.chainId,
        }, null, {});
        expect(r.isError).toBe(true);
        expect(r.error).toBe('Token for pay per view is invalid!');
      });

      it('accepts a well-formed PPV config', () => {
        expect(
          isValidDataForMinting(ok.title, ok.description, {
            [streamInfoKeys.isPayPerView]: true,
            [streamInfoKeys.payPerViewAmount]: 5,
            [streamInfoKeys.payPerViewChainIds]: token.chainId,
            [streamInfoKeys.payPerViewTokenSymbol]: token.symbol,
          }, null, {})
        ).toEqual({ isError: false });
      });
    });

    describe('bounty', () => {
      const bountyBase = {
        [streamInfoKeys.isAddBounty]: true,
        [streamInfoKeys.addBountyAmount]: 1,
        [streamInfoKeys.addBountyChainId]: token.chainId,
        [streamInfoKeys.addBountyTokenSymbol]: token.symbol,
        [streamInfoKeys.addBountyFirstXViewers]: 10,
      };

      it('flags a missing amount', () => {
        const r = isValidDataForMinting(ok.title, ok.description, {
          ...bountyBase,
          [streamInfoKeys.addBountyAmount]: 0,
        }, null, {});
        expect(r.isError).toBe(true);
        expect(r.error).toBe('Amount for bounty is invalid!');
      });

      it('rejects a token/chain pair that is not supported', () => {
        const r = isValidDataForMinting(ok.title, ok.description, {
          ...bountyBase,
          [streamInfoKeys.addBountyChainId]: 999999,
          [streamInfoKeys.addBountyTokenSymbol]: 'NOTATOKEN',
        }, null, {});
        expect(r.isError).toBe(true);
        expect(r.error).toBe('Token or Chain is not selected!');
      });

      it('rejects a total below the bounty minimum', () => {
        const r = isValidDataForMinting(ok.title, ok.description, {
          ...bountyBase,
          [streamInfoKeys.addBountyAmount]: bountyAmountMin / 100,
          [streamInfoKeys.addBountyFirstXViewers]: 1,
        }, null, { [token.address]: 1000 });
        expect(r.isError).toBe(true);
        expect(r.error).toBe('You need to input correct bounty amount!');
      });

      it('rejects an insufficient balance', () => {
        // total = 1 * 10 viewers = 10, balance = 1
        const r = isValidDataForMinting(ok.title, ok.description, bountyBase, null, {
          [token.address]: 1,
        });
        expect(r.isError).toBe(true);
        expect(r.error).toContain('enough token balance');
      });

      it('reads the balance by symbol off the user when no address key exists', () => {
        const user = { tokenBalances: { [token.symbol]: 1000 } } as any;
        expect(
          isValidDataForMinting(ok.title, ok.description, bountyBase, user, {})
        ).toEqual({ isError: false });
      });

      it('accepts a funded bounty keyed by token address', () => {
        expect(
          isValidDataForMinting(ok.title, ok.description, bountyBase, null, {
            [token.address]: 1000,
          })
        ).toEqual({ isError: false });
      });
    });
  });

  describe('filteredStreamInfo', () => {
    it('returns an empty object for null input', () => {
      expect(filteredStreamInfo(null)).toEqual({});
      expect(filteredStreamInfo(undefined)).toEqual({});
    });

    it('strips lock content fields when the flag is off', () => {
      const out = filteredStreamInfo({
        [streamInfoKeys.lockContentAmount]: 5,
        [streamInfoKeys.lockContentTokenSymbol]: token.symbol,
        [streamInfoKeys.lockContentChainIds]: token.chainId,
      });
      expect(out).toEqual({});
    });

    it('keeps lock content fields when the flag is on', () => {
      const out = filteredStreamInfo({
        [streamInfoKeys.isLockContent]: true,
        [streamInfoKeys.lockContentAmount]: 5,
      });
      expect(out[streamInfoKeys.isLockContent]).toBe(true);
      expect(out[streamInfoKeys.lockContentAmount]).toBe(5);
    });

    it('strips pay per view and bounty fields when their flags are off', () => {
      const out = filteredStreamInfo({
        [streamInfoKeys.payPerViewAmount]: 3,
        [streamInfoKeys.payPerViewTokenSymbol]: token.symbol,
        [streamInfoKeys.addBountyAmount]: 2,
        [streamInfoKeys.addBountyFirstXViewers]: 4,
      });
      expect(out).toEqual({});
    });

    it('drops empty, null and undefined values', () => {
      const out = filteredStreamInfo({
        keep: 'value',
        emptyString: '',
        nullValue: null,
        undefinedValue: undefined,
      });
      expect(out).toEqual({ keep: 'value' });
    });

    it('does not mutate the input object', () => {
      const input = { [streamInfoKeys.lockContentAmount]: 5 };
      filteredStreamInfo(input);
      expect(input[streamInfoKeys.lockContentAmount]).toBe(5);
    });
  });
});
