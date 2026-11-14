import { ownLandingCtaLabel, ownLandingHeadline, ownLandingMessage } from '../../libs/affiliate';

jest.mock('../../libs/wallet-session', () => ({ ensureWalletSession: jest.fn() }));
jest.mock('../../services/supabase', () => ({ supabase: {} }));
jest.mock('../../config/env', () => ({ APP_ORIGIN: 'https://riftn.com', SHARE_ORIGIN: 'https://riftn.com' }));
jest.mock('../../libs/misc', () => ({ shareProfile: jest.fn() }));

describe('invite page stock text', () => {
  it('reads an unchanged stock line as not set, whichever name it carries', () => {
    for (const line of ['Join me on DeHub', 'join me on dehub.', ' Join me on Riftn ', 'Join me on Riftn!']) {
      expect(ownLandingHeadline(line)).toBeNull();
      expect(ownLandingCtaLabel(line)).toBeNull();
    }
    expect(ownLandingMessage('Create, share and earn on a platform built for creators and their communities.')).toBeNull();
    expect(ownLandingHeadline('')).toBeNull();
    expect(ownLandingHeadline(null)).toBeNull();
  });

  it('keeps text the inviter wrote', () => {
    expect(ownLandingHeadline('The App Built for Creators')).toBe('The App Built for Creators');
    expect(ownLandingCtaLabel(' Explore DeHub ')).toBe('Explore DeHub');
    expect(ownLandingMessage('LETS GET THIS PARTY STARTED')).toBe('LETS GET THIS PARTY STARTED');
  });
});
