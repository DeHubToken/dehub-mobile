/**
 * New Members Rail (mobile)
 * =========================
 * Horizontal rail of everyone who joined in the last 30 days, newest first,
 * each with a one-tap way to say hello. Twin of web's right-rail
 * `SidebarNewMembers` tab; Search's idle state is the mobile equivalent of that
 * slot — it is where people already go to find other people.
 *
 * Wave opens the DM with a greeting typed and waiting (`sharedText`), never
 * pre-sent: an identical canned message fired off unseen is the bot behaviour
 * this feature exists to avoid. Web's `draftBody` does the same thing.
 *
 * Waves are remembered per device — the worst case of losing that is a button
 * that says "Wave" again after a reinstall.
 */
import React, { FC, useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Avatar from "./Avatar";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  joinedAgoLabel,
  useNewMembers,
  NEW_MEMBER_WELCOME,
  type NewMember,
} from "../../hooks/useNewMembers";

const WAVED_KEY = "dehub_waved_at";

const NewMembersRail: FC = () => {
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();
  const { data: members = [] } = useNewMembers(20);
  const [waved, setWaved] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(WAVED_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setWaved(parsed);
      })
      .catch(() => {
        // A missing or corrupt list only costs the "Waved" label.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleWave = useCallback(
    (member: NewMember) => {
      const address = member.address.toLowerCase();
      setWaved((prev) => {
        if (prev.includes(address)) return prev;
        const next = [...prev, address];
        AsyncStorage.setItem(WAVED_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });

      navigation.navigate(ScreenNames.Chat as never, {
        targetAddress: member.address,
        title: member.displayName,
        targetUser: {
          username: member.username ?? undefined,
          displayName: member.displayName,
          address: member.address,
        },
        sharedText: NEW_MEMBER_WELCOME,
      } as never);
    },
    [navigation],
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
          const hasWaved = waved.includes(member.address.toLowerCase());
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
                onPress={() => handleWave(member)}
                className={`mt-2 flex-row items-center rounded-lg px-2.5 py-1 ${
                  hasWaved ? "bg-white/10" : "border border-white/20 bg-white/15"
                }`}
              >
                <Text
                  className={`text-[11px] font-semibold ${
                    hasWaved ? "text-white/40" : "text-white"
                  }`}
                >
                  {hasWaved ? "Waved" : "Wave 👋"}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default React.memo(NewMembersRail);
