import { withReinvestedOperations, type FinanceAccountingDay } from '../../libs/finance-reinvestment';

it('preserves server allocations despite floating-point month totals', () => {
  const stats: { days: FinanceAccountingDay[] } = { days: Array.from({ length: 31 }, (_, index) => ({
    date: `2021-11-${String(index + 1).padStart(2, '0')}`,
    revenue: { bsc_token_tax: index === 0 ? 100.1 : 0 },
    costs: { operations_reinvestment: 100.1 / 31 },
  })) };
  expect(withReinvestedOperations(stats)).toEqual(stats);
});

it('retains existing allocations when more operating funds remain', () => {
  const stats = { days: [{ date: '2021-11-01', revenue: { bsc_token_tax: 100 }, costs: { operations_reinvestment: 60 } }] };
  expect(withReinvestedOperations(stats).days[0].costs.operations_reinvestment).toBe(100);
});

it('averages reinvested operating funds and subtracts costs already recorded', () => {
  const stats: { days: FinanceAccountingDay[] } = { days: [
    { date: '2022-01-01', revenue: { bsc_token_tax: 100 }, costs: { digitalocean: 10 } },
    { date: '2022-01-02', revenue: { bsc_token_tax: -20 }, costs: {} },
    { date: '2026-01-01', revenue: { ads: 30 }, costs: { digitalocean: 5 } },
  ] };
  const result = withReinvestedOperations(stats);
  expect(result.days[0].costs.operations_reinvestment).toBe(35);
  expect(result.days[1].costs.operations_reinvestment).toBe(35);
  expect(result.days[2].costs).toEqual({ digitalocean: 5 });
  expect(withReinvestedOperations(result)).toEqual(result);
});
