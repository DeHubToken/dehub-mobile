import { useQuery } from '@tanstack/react-query';
import { useBadgeLadderPrice, useBadgeScale } from '../../hooks/useBadgeScale';
import { badgeThresholds } from '../../libs/misc';

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));

describe('APK badge info valuation', () => {
  it.each([0.0001, 0.02, undefined])('uses $0.001 even with a cached DHB quote of %s', (quote) => {
    (useQuery as jest.Mock).mockReturnValue({ data: quote ? { DHB: quote } : undefined });
    const price = useBadgeLadderPrice();
    expect(price).toBe(0.001);
    const ladder = badgeThresholds(useBadgeScale());
    expect(ladder[0].min * price).toBe(10);
    expect(ladder[3].min * price).toBe(100);
    expect(ladder[12].min * price).toBe(50_000);
    expect(250_000 * price).toBe(250);
  });
});
