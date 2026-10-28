import { createSearchRequestGuard } from '../../libs/search-request-guard';
it('prevents a late search or old page from overwriting the newer query', async () => {
  const guard = createSearchRequestGuard();
  let visible = '';
  const old = guard.begin('a:all:viewer', 1)!;
  const page = guard.begin('a:all:viewer', 2)!;
  const next = guard.begin('b:people:viewer', 1)!;
  if (next.current()) visible = 'B';
  await Promise.resolve();
  if (old.current()) visible = 'A';
  if (page.current()) visible += 'old page';
  expect(visible).toBe('B');
  expect(guard.begin('a:all:viewer', 3)).toBeNull();
});
it('deduplicates pending pages and invalidates callbacks on clear or account change', () => {
  const guard = createSearchRequestGuard();
  guard.begin('a', 1);
  const page = guard.begin('a', 2)!;
  expect(guard.begin('a', 2)).toBeNull();
  page.finish();
  expect(guard.begin('a', 2)).not.toBeNull();
  guard.invalidate();
  expect(page.current()).toBe(false);
  expect(guard.begin('a', 3)).toBeNull();
});
