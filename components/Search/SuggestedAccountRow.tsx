import React, { useCallback, useState } from "react";
import { useTranslation as _useCopy } from "react-i18next";
import { haptic } from "../../libs/haptics";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useUser } from "../../context/AuthContext";
import { getAvatarUrl } from "../../libs/misc";
import type { SuggestedAccount } from "../../services/user.service";
import type { FollowState } from "./SearchAccountChip";
import { followWithRetries } from "../Home/SuggestedAccountCard";
import ExploreFollowRow from "./ExploreFollowRow";
/**
 * The same suggestion on one line, for Explore's clean list: avatar, name,
 * @handle, Follow. Same optimistic follow with quiet retries as the card.
 */
export function SuggestedAccountRow({
  account,
  onFollowChange,
}: {
  account: SuggestedAccount;
  onFollowChange?: (address: string, newState: FollowState, failed?: unknown) => void;
}) {
  const { t: _copy } = _useCopy();
  const { showUserProfile } = useUserProfileSheet();
  const authUser = useUser() as { address?: string } | null;
  const myAddress = authUser?.address;
  const [isFollowing, setIsFollowing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const isOwnAccount = !!(myAddress && account.address && myAddress.toLowerCase() === account.address.toLowerCase());
  const username = account.username || account.address?.slice(0, 6) || "";
  const avatarSrc = getAvatarUrl(account.avatarImageUrl || "");

  const follow = useCallback(() => {
    if (!myAddress || !account.address || isOwnAccount || isFollowing || isPending) return;
    const target = account.address;
    haptic.tap();
    setIsFollowing(true);
    onFollowChange?.(target, { isFollowing: true, isFollowRequestPending: false });
    followWithRetries(myAddress, target).then(
      (res) => {
        if (res.status !== "pending") return;
        setIsFollowing(false);
        setIsPending(true);
        onFollowChange?.(target, { isFollowing: false, isFollowRequestPending: true });
      },
      (error) => {
        setIsFollowing(false);
        setIsPending(false);
        onFollowChange?.(target, { isFollowing: false, isFollowRequestPending: false }, error);
      },
    );
  }, [myAddress, account.address, isOwnAccount, isFollowing, isPending, onFollowChange]);

  const label = isPending
    ? _copy("follow.requested", { defaultValue: "Requested" })
    : isFollowing
      ? _copy("follow.following", { defaultValue: "Following" })
      : account.followsYou
        ? _copy("follow.followBack", { defaultValue: "Follow back" })
        : _copy("follow.follow", { defaultValue: "Follow" });

  return (
    <ExploreFollowRow
      avatarUri={avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined}
      name={account.displayName || username}
      sub={`@${username}`}
      followLabel={label}
      done={isFollowing || isPending}
      pending={isPending}
      hideFollow={isOwnAccount}
      onOpen={() => showUserProfile(account.username || account.address)}
      onFollow={follow}
    />
  );
}

export default SuggestedAccountRow;
