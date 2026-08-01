/**
 * NewChatIntro — Shown when opening a chat with someone for the first time
 * (before a conversation has been created).
 *
 * Displays the peer's profile info and DM policy details so the user knows
 * what to expect before sending the first message:
 *   - Avatar, display name, username
 *   - DM status (enabled / disabled)
 *   - Per-message fee (if any)
 *   - Free access indicator
 *   - Block status
 */
import React, { memo } from "react";
import { View, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import { truncateAddress } from "../../libs/strings.util";

interface PeerInfo {
  address?: string;
  displayName?: string;
  username?: string;
  avatarImageUrl?: string;
}

interface DmPolicyInfo {
  dmEnabled: boolean;
  dmDisabledReason?: string | null;
  perMessageFee: number;
  hasFreeAccess: boolean;
  isBlocked: boolean;
}

interface NewChatIntroProps {
  peer: PeerInfo;
  policy: DmPolicyInfo;
}

const InfoRow: React.FC<{
  icon: string;
  iconColor: string;
  text: string;
  subtext?: string;
}> = ({ icon, iconColor, text, subtext }) => (
  <View className="flex-row items-center py-1.5">
    <View className="w-7 items-center">
      <Ionicons name={icon as any} size={16} color={iconColor} />
    </View>
    <View className="flex-1 ml-1">
      <Text className="text-[13px] text-theme-neutrals-200">{text}</Text>
      {subtext ? (
        <Text className="text-[11px] text-theme-neutrals-500 mt-0.5">{subtext}</Text>
      ) : null}
    </View>
  </View>
);

const NewChatIntroComponent: React.FC<NewChatIntroProps> = ({
  peer,
  policy,
}) => {
  const name =
    peer.displayName ||
    peer.username ||
    (peer.address ? truncateAddress(peer.address) : "User");

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-6 pb-4"
    >
      <View className="items-center mb-4">
        <Avatar uri={peer.avatarImageUrl} size={72} name={name} />
        <Text className="text-white text-[18px] font-semibold mt-3">
          {name}
        </Text>
        {peer.username && peer.displayName ? (
          <Text className="text-theme-neutrals-400 text-[13px] mt-0.5">
            @{peer.username}
          </Text>
        ) : null}
        {peer.address ? (
          <Text className="text-theme-neutrals-500 text-[11px] mt-1 font-mono">
            {truncateAddress(peer.address)}
          </Text>
        ) : null}
      </View>

      <View className="bg-theme-neutrals-800/50 rounded-xl px-4 py-3 w-full max-w-[300px]">
        {/* DM status */}
        {policy.dmEnabled ? (
          <InfoRow
            icon="chatbubble-ellipses-outline"
            iconColor="#22C55E"
            text="DMs are open"
            subtext="You can send messages"
          />
        ) : (
          <InfoRow
            icon="chatbubble-ellipses-outline"
            iconColor="#EF4444"
            text="DMs are closed"
            subtext={policy.dmDisabledReason || "This user is not accepting messages"}
          />
        )}

        {/* Per-message fee */}
        {policy.perMessageFee > 0 && (
          <>
            {policy.hasFreeAccess ? (
              <InfoRow
                icon="shield-checkmark"
                iconColor="#22C55E"
                text="Free access granted"
                subtext={`Normally ${policy.perMessageFee} DHB per message`}
              />
            ) : (
              <InfoRow
                icon="diamond"
                iconColor="#F4F4F5"
                text={`${policy.perMessageFee} DHB per message`}
                subtext="Each message requires a DHB payment"
              />
            )}
          </>
        )}

        {/* Block status */}
        {policy.isBlocked && (
          <InfoRow
            icon="ban-outline"
            iconColor="#EF4444"
            text="You've blocked this user"
            subtext="Unblock to send messages"
          />
        )}

        {/* Free to message (no fee, enabled, not blocked) */}
        {policy.dmEnabled &&
          !policy.isBlocked &&
          policy.perMessageFee <= 0 && (
            <InfoRow
              icon="checkmark-circle-outline"
              iconColor="#22C55E"
              text="Free to message"
              subtext="No fees required"
            />
          )}
      </View>

      <Text className="text-theme-neutrals-600 text-[11px] text-center mt-4 px-4">
        Send your first message to start the conversation
      </Text>
    </Animated.View>
  );
};

export default memo(NewChatIntroComponent);
