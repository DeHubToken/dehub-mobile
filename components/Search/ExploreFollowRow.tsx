/**
 * One person on one line in Explore's clean list: avatar, name, a short
 * second line (@handle, "joined 6h ago"), and the same chrome Follow button
 * the cover cards carry. Twin of web's FollowRow.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import Avatar from "../common/Avatar";
import { ChromeFollowButton } from "../Home/SuggestedAccountCard";
import { exploreRowStyles as row } from "./ExploreSection";

export default function ExploreFollowRow({
  avatarUri,
  name,
  sub,
  followLabel,
  done,
  pending,
  hideFollow,
  onOpen,
  onFollow,
}: {
  avatarUri?: string | null;
  name: string;
  sub: string;
  followLabel: string;
  done: boolean;
  pending?: boolean;
  hideFollow?: boolean;
  onOpen: () => void;
  onFollow: () => void;
}) {
  return (
    <Pressable onPress={onOpen} style={row.row}>
      <Avatar uri={avatarUri} size={40} name={name} />
      <View style={row.flex}>
        <Text className="text-white" style={row.name} numberOfLines={1}>{name}</Text>
        <Text className="text-theme-neutrals-500" style={row.sub} numberOfLines={1}>{sub}</Text>
      </View>
      {hideFollow ? null : <ChromeFollowButton label={followLabel} done={done} pending={pending} onPress={onFollow} />}
    </Pressable>
  );
}
