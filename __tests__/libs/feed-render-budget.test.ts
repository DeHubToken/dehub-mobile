import { feedRenderBudget } from '../../libs/feed-render-budget';

test('keeps the reversal buffer for ordinary and mixed feeds', () => {
  expect(feedRenderBudget([]).windowSize).toBe(11);
  expect(feedRenderBudget([{ imageUrls: ['a', 'b'] }, {}, {}, {}]).windowSize).toBe(11);
  expect(feedRenderBudget([...Array.from({ length: 4 }, () => ({ imageUrls: ['a', 'b'] })), ...Array.from({ length: 5 }, () => ({}))]).windowSize).toBe(11);
});

test('bounds the bitmap working set when galleries dominate a channel', () => {
  expect(feedRenderBudget([...Array.from({ length: 4 }, () => ({ imageUrls: ['a', 'b', 'c', 'd'] })), ...Array.from({ length: 4 }, () => ({}))])).toEqual({ windowSize: 5, initialRows: 2 });
});
