import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
let mockOptions: any;
let mockData: any;
const mockClient = { getQueryData: () => [] };
const mockMerge = jest.fn();
const mockFetch = jest.fn(async (..._args: any[]) => mockData);
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: any) => { mockOptions = options; return { data: mockData }; },
  useQueryClient: () => mockClient,
}));
jest.mock('../../services/feed.unified.service', () => ({ getUnifiedFeedSignal: (...args: any[]) => mockFetch(...args) }));
jest.mock('../../libs/liveCounts', () => ({ mergeLiveCounts: (...args: any[]) => mockMerge(...args) }));
import { useNewPostsSignal } from '../../hooks/useNewPostsSignal';

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active', writable: true });
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  mockData = { result: [{ tokenId: 30, createdAt: '2026-05-02' }],
    visibleResult: [{ tokenId: 1, totalViews: 99, createdAt: '2026-05-03' }] };
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('reads fresh native viewability at poll time and defers both counter sets until scrolling settles', async () => {
  const ids = { current: [1] }; const scrolling = { current: true };
  const { result } = renderHook(() => useNewPostsSignal({ enabled: true, newestCreatedAt: '2026-05-01',
    visibleTokenIds: ids, scrolling }));
  expect(mockMerge).not.toHaveBeenCalled();
  expect(result.current.newPostCount).toBe(1);
  ids.current = [2];
  await mockOptions.queryFn();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith({ limit: 20 }, [2]);
  scrolling.current = false;
  act(() => result.current.flushLiveCounts());
  expect(mockMerge).toHaveBeenCalledWith(mockClient, [...mockData.result, ...mockData.visibleResult]);
  act(() => result.current.flushLiveCounts());
  expect(mockMerge).toHaveBeenCalledTimes(1);
});
