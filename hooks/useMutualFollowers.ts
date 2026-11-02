import { useState, useEffect, useRef } from "react";
import { getFollowList, getMutualFollowers, type FollowListItem } from "../services/user.service";
import { useAuthState, useUser } from "../context/AuthContext";

interface UseMutualFollowersOptions {
  profileAddress: string | undefined;
  enabled?: boolean;
}

export function useMutualFollowers({ profileAddress, enabled = true }: UseMutualFollowersOptions) {
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const walletAddress = (user as any)?.walletAddress || (user as any)?.address;
  const [mutuals, setMutuals] = useState<FollowListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const fetchIdRef = useRef(0);

  const isOwnProfile = !!(
    walletAddress &&
    profileAddress &&
    walletAddress.toLowerCase() === profileAddress.toLowerCase()
  );

  const shouldFetch = enabled && isSignedIn && !!walletAddress && !!profileAddress && !isOwnProfile;

  useEffect(() => {
    if (!shouldFetch) {
      setMutuals([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);

    (async () => {
      try {
        // The server intersects the full lists. The first-100-of-each check
        // only runs while an older API without the endpoint is still live.
        let result: { items: FollowListItem[]; totalCount: number };
        try {
          result = await getMutualFollowers(profileAddress!, 5);
        } catch {
          const [myFollowing, theirFollowers] = await Promise.all([
            getFollowList({ address: walletAddress, type: "following", limit: 100 }),
            getFollowList({ address: profileAddress!, type: "followers", limit: 100 }),
          ]);
          const myFollowingSet = new Set(
            (myFollowing.result?.items || []).map((item) => item.user.address.toLowerCase()),
          );
          const items = (theirFollowers.result?.items || []).filter((item) =>
            myFollowingSet.has(item.user.address.toLowerCase()),
          );
          result = { items, totalCount: items.length };
        }

        if (fetchId !== fetchIdRef.current) return;
        setMutuals(result.items);
        setTotalCount(result.totalCount);
      } catch {
        if (fetchId === fetchIdRef.current) { setMutuals([]); setTotalCount(0); }
      } finally {
        if (fetchId === fetchIdRef.current) setIsLoading(false);
      }
    })();

    return () => {
      fetchIdRef.current++;
    };
  }, [shouldFetch, walletAddress, profileAddress]);

  return { mutuals, totalCount, isLoading: shouldFetch ? isLoading : false };
}
