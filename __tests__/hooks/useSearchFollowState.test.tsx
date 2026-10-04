import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchFollowState } from '../../hooks/useSearchFollowState';
import { getFollowStatus, followUser, unfollowUser } from '../../services/user.service';

let mockViewer = '0xViewerA';
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ address: mockViewer }) }));
jest.mock('../../services/user.service', () => ({ getFollowStatus: jest.fn(), followUser: jest.fn(), unfollowUser: jest.fn() }));

const initial = { isFollowing: false, isFollowRequestPending: false };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client, children });
  return { client, wrapper };
}

beforeEach(() => {
  mockViewer = '0xViewerA';
  jest.clearAllMocks();
  (getFollowStatus as jest.Mock).mockResolvedValue({ isFollowing: true, isFollowRequestPending: false });
  (followUser as jest.Mock).mockResolvedValue({ status: 'following' });
  (unfollowUser as jest.Mock).mockResolvedValue({ status: 'unfollowed' });
});

it('uses the server relationship instead of stale search fields and remembers it after remount', async () => {
  const { wrapper } = setup();
  const hook = renderHook(() => useSearchFollowState('0xTarget', initial), { wrapper });
  expect(hook.result.current.isLoading).toBe(true);
  await waitFor(() => expect(hook.result.current.isFollowing).toBe(true));
  hook.unmount();
  const restored = renderHook(() => useSearchFollowState('0xTarget', initial), { wrapper });
  expect(restored.result.current.isFollowing).toBe(true);
  expect(getFollowStatus).toHaveBeenCalledTimes(1);
});

it('shares mutations between account cards and chips', async () => {
  const { wrapper } = setup();
  const card = renderHook(() => useSearchFollowState('0xTarget', initial), { wrapper });
  const chip = renderHook(() => useSearchFollowState('0xtarget', initial), { wrapper });
  await waitFor(() => expect(card.result.current.isFollowing).toBe(true));
  await act(async () => { await card.result.current.toggle(); });
  await waitFor(() => expect(chip.result.current.isFollowing).toBe(false));
  expect(unfollowUser).toHaveBeenCalledWith('0xViewerA', '0xTarget');
  (followUser as jest.Mock).mockResolvedValue({ status: 'pending' });
  await act(async () => { await chip.result.current.toggle(); });
  await waitFor(() => expect(card.result.current.isPending).toBe(true));
  expect(card.result.current.isFollowing).toBe(false);
});

it('separates relationship caches when the viewer changes', async () => {
  const { wrapper } = setup();
  const hook = renderHook(() => useSearchFollowState('0xTarget', initial), { wrapper });
  await waitFor(() => expect(hook.result.current.isFollowing).toBe(true));
  mockViewer = '0xViewerB';
  (getFollowStatus as jest.Mock).mockResolvedValue(initial);
  hook.rerender({});
  expect(hook.result.current.isFollowing).toBe(false);
  expect(hook.result.current.isLoading).toBe(true);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(getFollowStatus).toHaveBeenCalledTimes(2);
});
