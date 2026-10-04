import { useRef } from 'react';
import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../context/AuthContext';
import { followUser, unfollowUser, getFollowStatus, type IsFollowingResult } from '../services/user.service';

let active = 0;
const waiting: Array<() => void> = [];
async function check(address: string) {
  if (active >= 4) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try {
    return await getFollowStatus(address);
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export function followStatusOptions(viewer: string, address: string) {
  return {
    queryKey: ['user-follow-status', viewer.toLowerCase(), address.toLowerCase()],
    queryFn: () => check(address),
    enabled: !!viewer && !!address,
    staleTime: 60_000,
    retry: 1,
  };
}

export function useSearchFollowStates(viewer: string, addresses: string[]) {
  const unique = [...new Set(addresses.map(address => address.toLowerCase()))];
  const queries = useQueries({ queries: unique.map(address => followStatusOptions(viewer, address)) });
  return Object.fromEntries(unique.map((address, index) => [address, queries[index].data]));
}

export function useSearchFollowState(address: string, initial: IsFollowingResult) {
  const user = useUser();
  const viewer = user?.walletAddress || user?.address || '';
  const queryClient = useQueryClient();
  const options = followStatusOptions(viewer, address);
  const query = useQuery(options);
  const state = viewer ? query.data ?? initial : { isFollowing: false, isFollowRequestPending: false };
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!viewer || !address || !query.data || busy.current) return;
      busy.current = true;
      try {
        const response = state.isFollowing || state.isFollowRequestPending
          ? await unfollowUser(viewer, address)
          : await followUser(viewer, address);
        const next = {
          isFollowing: response.status === 'following',
          isFollowRequestPending: response.status === 'pending',
        };
        queryClient.setQueryData<IsFollowingResult>(options.queryKey, next);
        return next;
      } finally {
        busy.current = false;
      }
    },
  });
  return {
    isFollowing: state.isFollowing,
    isPending: !!state.isFollowRequestPending,
    isLoading: mutation.isPending || (!!viewer && (!query.data || query.isFetching)),
    toggle: mutation.mutateAsync,
  };
}
