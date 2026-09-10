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
import React, { FC, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View, Text, ScrollView, TouchableOpacity } from "react-native";
import Avatar from "./Avatar";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth, useUser } from "../../context/AuthContext";
import { followUser, isFollowing } from "../../services/user.service";
import {
  joinedAgoLabel,
  useNewMembers,
  type NewMember,
} from "../../hooks/useNewMembers";

type FollowState = {
  isFollowing: boolean;
  isPending: boolean;
  isLoading?: boolean;
};

const NewMembersRail: FC = () => {
  const { showUserProfile } = useUserProfileSheet();
  const { requireAuth } = useAuth();
  const authUser = useUser() as { address?: string; walletAddress?: string } | null;
  const viewerAddress = authUser?.address ?? authUser?.walletAddress;
  const { data: members = [] } = useNewMembers(20);
  const viewerAddressRef = useRef(viewerAddress);
  const [followStates, setFollowStates] = useState<Record<string, FollowState>>({});

  // `requireAuth` can resume the saved press immediately after sign-in, before
  // an effect would have a chance to refresh this value.
  viewerAddressRef.current = viewerAddress;

  useEffect(() => {
    let cancelled = false;
    if (!viewerAddress || members.length === 0) {
      setFollowStates({});
      return () => {
        cancelled = true;
      };
    }

    void Promise.all(
      members.map(async (member) => {
        const relationship = await isFollowing(member.address);
        return [member.address.toLowerCase(), relationship] as const;
      }),
    ).then((relationships) => {
      if (cancelled) return;
      setFollowStates((current) => {
        const next: Record<string, FollowState> = {};
        for (const [address, relationship] of relationships) {
          // A successful tap wins over an in-flight status lookup.
          if (current[address]?.isFollowing || current[address]?.isPending) {
            next[address] = current[address];
          } else {
            next[address] = {
              isFollowing: relationship.isFollowing,
              isPending: !!relationship.isFollowRequestPending,
            };
          }
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [members, viewerAddress]);

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

    setFollowStates((current) => ({
      ...current,
      [address]: { ...current[address], isFollowing: false, isPending: false, isLoading: true },
    }));

    try {
      const response = await followUser(viewer, member.address);
      setFollowStates((current) => ({
        ...current,
        [address]: {
          isFollowing: response.status === "following",
          isPending: response.status === "pending",
        },
      }));
    } catch {
      setFollowStates((current) => ({
        ...current,
        [address]: { ...(current[address] ?? { isFollowing: false, isPending: false }), isLoading: false },
      }));
      Alert.alert("Couldn't follow this member", "Please check your connection and try again.");
    }
  }, []);

  const handleFollow = useCallback(
    (member: NewMember) => {
      const address = member.address.toLowerCase();
      const state = followStates[address];
      if (state?.isFollowing || state?.isPending || state?.isLoading) return;
      requireAuth(() => {
        void followMember(member);
      });
    },
    [followMember, followStates, requireAuth],
  );

  if (members.length === 0) return null;

  return (
    <View className="mb-2">
      <View className="px-4 pt-3 pb-2">
        <Text className="text-white text-base font-bold">New members</Text>
        <Text className="text-theme-neutrals-500 text-xs mt-0.5">Just joined — say hello</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {members.map((member) => {
          const state = followStates[member.address.toLowerCase()];
          const isFollowed = state?.isFollowing ?? false;
          const isPending = state?.isPending ?? false;
          const isLoading = state?.isLoading ?? false;
          return (
            <View
              key={member.address}
              className="w-28 items-center rounded-2xl bg-theme-neutrals-800 px-2 py-3"
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
                    {isPending ? "Requested" : isFollowed ? "Following" : "Follow"}
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
