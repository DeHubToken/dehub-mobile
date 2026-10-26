import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(resolve(__dirname, '../../screens/NotificationScreen.tsx'), 'utf8');
const code = source.slice(source.indexOf('  const fetchNotifications = useCallback('), source.indexOf('  // Store fetchNotifications in a ref'));
const compiled = ts.transpileModule(code + '\nfetchNotifications', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

it('starts all sources together, reuses custom rows, and paints before slow badges finish', async () => {
  let finishCounts!: (value: unknown) => void;
  const api = jest.fn().mockResolvedValueOnce({ result: [{ id: 'list', createdAt: '2026-01-01' }] })
    .mockImplementationOnce(() => new Promise(resolve => { finishCounts = resolve; }));
  const custom = jest.fn().mockResolvedValue([{ id: 'custom', createdAt: '2026-01-02' }]);
  const scope: any = {
    useCallback: (fn: unknown) => fn, fetchGenRef: { current: 0 }, pageRef: { current: 1 },
    selectedFilterRef: { current: 'likes' }, walletAddressRef: { current: 'viewer' },
    apiTypesForFilter: () => ['like'], getNotifications: api, fetchCustomNotifications: custom,
    log: { error: jest.fn() },
  };
  for (const key of ['setLoadError', 'setNotifications', 'setPage', 'setHasMore', 'setCountsSource', 'setRefreshing', 'setLoading', 'setLoadingMore']) scope[key] = jest.fn();
  const refresh = runInNewContext(compiled, scope);
  const pending = refresh(true);
  expect(api).toHaveBeenCalledTimes(2);
  expect(custom).toHaveBeenCalledTimes(1);
  await new Promise(resolve => setImmediate(resolve));
  expect(scope.setNotifications).toHaveBeenCalledWith([{ id: 'custom', createdAt: '2026-01-02' }, { id: 'list', createdAt: '2026-01-01' }]);
  expect(scope.setLoading).toHaveBeenCalledWith(false);
  expect(scope.setCountsSource).not.toHaveBeenCalled();
  finishCounts({ result: [{ id: 'all' }] });
  await pending;
  expect(scope.setCountsSource).toHaveBeenCalledWith([{ id: 'all' }, { id: 'custom', createdAt: '2026-01-02' }]);
  expect(custom).toHaveBeenCalledTimes(1);
});
