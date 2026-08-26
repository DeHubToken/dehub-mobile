/**
 * Wallets to people, for the bounty surfaces.
 * ==========================================
 * Mirrors the web app's `useWalletProfiles` (src/hooks/use-wallet-profiles.ts):
 * every Work screen used to print a raw `0x1234…abcd`, which is unreadable and
 * tells you nothing about who is about to be paid.
 *
 * Keyed on the address alone rather than on the screen asking, so the poster in
 * the header and the same wallet appearing again as a submitter cost one
 * request between them. `useUserProfileData` is the profile *sheet's* hook —
 * it carries follow state, blocking and a manual cache; this is the cheap
 * read-only lookup a list row wants.
 */
import { useQuery } from "@tanstack/react-query";
import { getAccount } from "../services/user.service";
import { getAvatarUrl } from "../libs/misc";

export interface WorkProfile {
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  badgeBalance?: number;
}

async function fetchWorkProfile(address: string): Promise<WorkProfile | null> {
  const res: any = await getAccount(address);
  return res?.data?.result || res?.result || null;
}

export function useWorkProfile(address?: string | null) {
  const key = address?.toLowerCase();
  const { data } = useQuery({
    queryKey: ["work-wallet-profile", key],
    queryFn: () => fetchWorkProfile(key!),
    enabled: !!key,
    // An avatar five minutes stale is still the right avatar.
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return data ?? undefined;
}

/** Display name, falling back through username to a shortened address. */
export function workProfileName(
  profile: WorkProfile | undefined,
  wallet: string | null | undefined,
): string {
  if (profile?.displayName || profile?.username) {
    return profile.displayName || profile.username!;
  }
  if (!wallet) return "anon";
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

/**
 * Avatar URI for the shared `Avatar` component. `getAvatarUrl` already handles
 * the flattening and the dead `blob:` previews — see libs/misc.ts — so nothing
 * here re-bases a path by hand.
 */
export function workProfileAvatar(
  profile: WorkProfile | undefined,
  sizePt = 28,
): string | undefined {
  return profile?.avatarImageUrl ? getAvatarUrl(profile.avatarImageUrl, sizePt) : undefined;
}
