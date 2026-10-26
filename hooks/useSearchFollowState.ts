import { useRef } from 'react';
import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../context/AuthContext';
import { followUser, unfollowUser, getFollowStatusBatch, type IsFollowingResult } from '../services/user.service';

type Lookup = { address: string; resolve: (state: IsFollowingResult) => void; reject: (error: unknown) => void };
const waiting = new Map<string, Lookup[]>();
function check(address: string, viewer: string): Promise<IsFollowingResult> {
  const owner = viewer.toLowerCase();
  return new Promise((resolve, reject) => {
    const queued = waiting.get(owner);
    const entry = { address: address.toLowerCase(), resolve, reject };
    if (queued) { queued.push(entry); return; }
    waiting.set(owner, [entry]);
    setTimeout(async () => {
      const entries = waiting.get(owner)!;
      waiting.delete(owner);
      for (let offset = 0; offset < entries.length; offset += 100) {
        const batch = entries.slice(offset, offset + 100);
        try {
          const states = await getFollowStatusBatch([...new Set(batch.map(item => item.address))], owner);
          for (const item of batch) {
            const state = states[item.address];
            if (state) item.resolve(state); else item.reject(new Error('Missing follow status'));
          }
        } catch (error) { batch.forEach(item => item.reject(error)); }
      }
    }, 0);
  });
}

export function followStatusOptions(viewer: string, address: string) {
  return {
    queryKey: ['user-follow-status', viewer.toLowerCase(), address.toLowerCase()],
    queryFn: () => check(address, viewer),
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
    isLoading: mutation.isPending || (!!viewer && !query.data),
    toggle: mutation.mutateAsync,
  };
}
