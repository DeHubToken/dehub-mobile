/**
 * New Members Rail (mobile)
 * =========================
 * Horizontal rail of everyone who joined in the last 30 days, newest first,
 * each with a one-tap way to follow. Twin of web's right-rail
 * `SidebarNewMembers` tab; Search's idle state is the mobile equivalent of that
 * slot — it is where people already go to find other people.
 *
 * The action uses the same follow request as the web carousel. Relationship
 * state is fetched when the rail appears so existing follows and private
 * account requests never look actionable again.
 */
import React, { FC, useCallback, useRef } from "react";
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View, Text, ScrollView, TouchableOpacity } from "react-native";
import Avatar from "./Avatar";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth, useUser } from "../../context/AuthContext";
import { followUser } from "../../services/user.service";
import { followStatusOptions, useSearchFollowStates } from '../../hooks/useSearchFollowState';
import { useKeyedState } from '../../hooks/useItemState';
import { reportActionError } from "../../libs/error-feedback";
import {
  joinedAgoLabel,
  useNewMembers,
  type NewMember,
} from "../../hooks/useNewMembers";
import { useAppTheme } from "../../context/ThemeContext";

/** How much of the roster to show. Followed members keep their status label. */
const ROSTER_SIZE = 20;

/** Maximum number of cards on screen. */
const VISIBLE_LIMIT = 20;

const NewMembersRail: FC = () => {
  const { t } = useTranslation();
  const { showUserProfile } = useUserProfileSheet();
  const { isMinimal } = useAppTheme();
  const { requireAuth } = useAuth();
  const authUser = useUser() as { address?: string; walletAddress?: string } | null;
  const viewerAddress = authUser?.address ?? authUser?.walletAddress;
  const queryClient = useQueryClient();
  const { data: members = [] } = useNewMembers(ROSTER_SIZE);
  const viewerAddressRef = useRef(viewerAddress);
  const followStates = useSearchFollowStates(viewerAddress || '', members.map(member => member.address));
  const [loadingAddress, setLoadingAddress] = useKeyedState<string | null>(viewerAddress?.toLowerCase() || '', null);

  // `requireAuth` can resume the saved press immediately after sign-in, before
  // an effect would have a chance to refresh this value.
  viewerAddressRef.current = viewerAddress;

  const openProfile = useCallback(
    (member: NewMember) => {
      // By address, never by the username on the row. The roster row is a
      // snapshot from registration, and at that moment most accounts still
      // carry the generated placeholder shown before a username is chosen
      // ("rapidbadger_7a38"). That string was never a username the API knows,
      // so opening it resolved to nothing and the reader got "not found" on a
      // member who is perfectly real. The address cannot drift.
      showUserProfile(member.address);
    },
    [showUserProfile],
  );

  const followMember = useCallback(async (member: NewMember) => {
    const viewer = viewerAddressRef.current;
    const address = member.address.toLowerCase();
    if (!viewer || !member.address) return;

    setLoadingAddress(address);

    try {
      const response = await followUser(viewer, member.address);
      queryClient.setQueryData(followStatusOptions(viewer, member.address).queryKey, {
          isFollowing: response.status === "following",
          isFollowRequestPending: response.status === "pending",
      });
    } catch (err) {
      reportActionError(err, "Couldn't follow this member");
    } finally {
      setLoadingAddress(null);
    }
  }, [queryClient, setLoadingAddress]);

  const handleFollow = useCallback(
    (member: NewMember) => {
      const address = member.address.toLowerCase();
      const state = followStates[address];
      if (state?.isFollowing || state?.isFollowRequestPending || loadingAddress || (viewerAddress && !state)) return;
      requireAuth(() => {
        void followMember(member);
      });
    },
    [followMember, followStates, requireAuth, loadingAddress, viewerAddress],
  );

  const visibleMembers = members.slice(0, VISIBLE_LIMIT);

  if (visibleMembers.length === 0) return null;

  return (
    <View className="mb-2">
      <View className="px-4 pt-3 pb-2">
        <Text className="text-white text-base font-bold">{t("stats.newMembers")}</Text>
        <Text className="text-theme-neutrals-500 text-xs mt-0.5">{t("feed.newMembersHint")}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {visibleMembers.map((member) => {
          const state = followStates[member.address.toLowerCase()];
          const isFollowed = state?.isFollowing ?? false;
          const isPending = state?.isFollowRequestPending ?? false;
          const isLoading = loadingAddress === member.address.toLowerCase() || (!!viewerAddress && !state);
          return (
            <View
              key={member.address}
              // Minimal: no card fill — avatar, name and Follow stand on the black.
              className={isMinimal ? "w-28 items-center px-2 py-3" : "w-28 items-center rounded-2xl bg-theme-neutrals-800 px-2 py-3"}
            >
              <TouchableOpacity activeOpacity={0.8} onPress={() => openProfile(member)}>
                <Avatar uri={member.avatarUrl} size={56} name={member.displayName} />
              </TouchableOpacity>
              <Text
                className="text-white text-xs font-semibold mt-2 text-center"
                numberOfLines={1}
              >
                {member.displayName}
              </Text>
              <Text className="text-theme-neutrals-500 text-[10px] mt-0.5" numberOfLines={1}>
                {joinedAgoLabel(member.joinedAt)}
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleFollow(member)}
                className={`mt-2 flex-row items-center rounded-lg px-2.5 py-1 ${
                  isFollowed || isPending ? "bg-white/10" : "border border-white/20 bg-white/15"
                }`}
                disabled={isFollowed || isPending || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    className={`text-[11px] font-semibold ${
                      isFollowed || isPending ? "text-white/40" : "text-white"
                    }`}
                  >
                    {isPending ? t("follow.requested") : isFollowed ? t("follow.following") : t("follow.follow")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default React.memo(NewMembersRail);
