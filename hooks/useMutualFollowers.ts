import { useState, useEffect, useRef } from "react";
import { getFollowList, type FollowListItem } from "../services/user.service";
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
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);

    (async () => {
      try {
        const [myFollowing, theirFollowers] = await Promise.all([
          getFollowList({ address: walletAddress, type: "following", limit: 50 }),
          getFollowList({ address: profileAddress!, type: "followers", limit: 50 }),
        ]);

        if (fetchId !== fetchIdRef.current) return;

        const myFollowingSet = new Set(
          (myFollowing.result?.items || []).map((item) => item.user.address.toLowerCase()),
        );

        const mutualList = (theirFollowers.result?.items || []).filter((item) =>
          myFollowingSet.has(item.user.address.toLowerCase()),
        );

        setMutuals(mutualList);
      } catch {
        if (fetchId === fetchIdRef.current) setMutuals([]);
      } finally {
        if (fetchId === fetchIdRef.current) setIsLoading(false);
      }
    })();

    return () => {
      fetchIdRef.current++;
    };
  }, [shouldFetch, walletAddress, profileAddress]);

  return { mutuals, isLoading: shouldFetch ? isLoading : false };
}
