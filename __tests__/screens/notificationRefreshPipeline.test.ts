import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
jest.mock('../../services/user.service', () => ({}));
jest.mock('../../libs/custom-notifications', () => ({}));
import { mergeFirstPage } from '../../libs/notifications-cache';

const source = readFileSync(resolve(__dirname, '../../screens/NotificationScreen.tsx'), 'utf8');
const code = source.slice(source.indexOf('  const fetchNotifications = useCallback('), source.indexOf('  // Store fetchNotifications in a ref'));
const compiled = ts.transpileModule(code + '\nfetchNotifications', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

it('starts all sources together, paints the API page first, folds in custom rows, and does not wait on badges', async () => {
  let finishCounts!: (value: unknown) => void;
  const api = jest.fn().mockResolvedValueOnce({ result: [{ id: 'list', createdAt: '2026-01-01' }] })
    .mockImplementationOnce(() => new Promise(resolve => { finishCounts = resolve; }));
  const custom = jest.fn().mockResolvedValue([{ id: 'custom', createdAt: '2026-01-02' }]);
  const scope: any = {
    useCallback: (fn: unknown) => fn, fetchGenRef: { current: 0 }, pageRef: { current: 1 },
    selectedFilterRef: { current: 'likes' }, walletAddressRef: { current: 'viewer' },
    apiTypesForFilter: () => ['like'], getNotifications: api, fetchCustomNotifications: custom,
    log: { error: jest.fn() }, listedUnreadRef: { current: new Map() },
    takeInflightFirstPage: () => null, mergeFirstPage, customRowsRef: { current: [] }, lastRefreshAtRef: { current: 0 },
  };
  for (const key of ['setLoadError', 'setNotifications', 'setPage', 'setHasMore', 'setCountsSource', 'setRefreshing', 'setLoading', 'setLoadingMore']) scope[key] = jest.fn();
  const refresh = runInNewContext(compiled, scope);
  const pending = refresh(true);
  expect(api).toHaveBeenCalledTimes(2);
  expect(custom).toHaveBeenCalledTimes(1);
  await new Promise(resolve => setImmediate(resolve));
  expect(scope.setNotifications).toHaveBeenNthCalledWith(1, [{ id: 'list', createdAt: '2026-01-01' }]);
  expect(scope.setNotifications).toHaveBeenNthCalledWith(2, [{ id: 'custom', createdAt: '2026-01-02' }, { id: 'list', createdAt: '2026-01-01' }]);
  expect(scope.lastRefreshAtRef.current).toBeGreaterThan(0);
  expect(scope.setLoading).toHaveBeenCalledWith(false);
  expect(scope.setCountsSource).not.toHaveBeenCalled();
  finishCounts({ result: [{ id: 'all' }] });
  await pending;
  expect(scope.setCountsSource).toHaveBeenCalledWith([{ id: 'all' }, { id: 'custom', createdAt: '2026-01-02' }]);
  expect(custom).toHaveBeenCalledTimes(1);
});

it('an unfiltered refresh reuses the warm-up fetch instead of asking again', async () => {
  const api = jest.fn();
  const custom = jest.fn();
  const scope: any = {
    useCallback: (fn: unknown) => fn, fetchGenRef: { current: 0 }, pageRef: { current: 1 },
    selectedFilterRef: { current: 'all' }, walletAddressRef: { current: 'viewer' },
    apiTypesForFilter: () => undefined, getNotifications: api, fetchCustomNotifications: custom,
    log: { error: jest.fn() }, listedUnreadRef: { current: new Map() },
    takeInflightFirstPage: () => Promise.resolve({ api: [{ _id: 'a', createdAt: '2026-01-01' }], custom: [] }),
    mergeFirstPage, customRowsRef: { current: [] }, lastRefreshAtRef: { current: 0 },
  };
  for (const key of ['setLoadError', 'setNotifications', 'setPage', 'setHasMore', 'setCountsSource', 'setRefreshing', 'setLoading', 'setLoadingMore']) scope[key] = jest.fn();
  const refresh = runInNewContext(compiled, scope);
  await refresh(true);
  expect(api).not.toHaveBeenCalled();
  expect(custom).not.toHaveBeenCalled();
  expect(scope.setNotifications).toHaveBeenCalledWith([{ _id: 'a', createdAt: '2026-01-01' }]);
  expect(scope.setCountsSource).toHaveBeenCalledWith([{ _id: 'a', createdAt: '2026-01-01' }]);
});
