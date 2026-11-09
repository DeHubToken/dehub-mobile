import React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../ScreenHeader";
import Avatar from "../common/Avatar";
import { useUser } from "../../context/AuthContext";
import { dmState } from "../../store/dm.store";
import { getOtherParticipant, type DmConversation } from "../../services/dm/dm.types";
import { getAvatarUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";

type ShellPeer = { displayName?: string; username?: string; avatarImageUrl?: string; address?: string };

type ChatRouteShellProps = {
  route?: {
    params?: {
      conversationId?: string | number;
      targetUser?: ShellPeer;
      targetAddress?: string;
      title?: string;
    };
  };
};

/**
 * A chat's first frame: the header it opens with, on the page's colour. The
 * thread (messages, composer) is built on the next frame while the page slides
 * in, so the slide starts at the tap instead of after the whole chat screen
 * has rendered (see deferredScreen's shellFirst).
 *
 * Reads the conversation once, outside the store's subscription: this frame
 * is gone a moment later.
 */
export default function ChatRouteShell({ route }: ChatRouteShellProps) {
  const { t } = useTranslation();
  const user = useUser() as { id?: string; walletAddress?: string; address?: string } | null;
  const params = route?.params;
  const conversation = params?.conversationId != null
    ? (dmState.contactsById as Record<string, DmConversation | undefined>)[String(params.conversationId)]
    : undefined;
  const myAddress = (user?.walletAddress || user?.address || "").toLowerCase();
  const peer: ShellPeer | undefined = params?.targetUser
    ?? (conversation ? getOtherParticipant(conversation, user?.id, myAddress) : undefined);
  const address = peer?.address || params?.targetAddress || "";
  const title = params?.title
    || peer?.displayName
    || peer?.username
    || (address ? truncateAddress(address) : t("copy.460b3a7da007", { defaultValue: "Chat" }));
  const avatarUrl = getAvatarUrl(peer?.avatarImageUrl);
  const avatarUri = avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined;
  return (
    <View style={{ flex: 1 }} className="bg-theme-neutrals-900">
      <ScreenHeader
        appearance="flat"
        title={title}
        subtitle={peer?.username ? `@${peer.username}` : undefined}
        leftContent={<Avatar uri={avatarUri} size={40} name={peer?.displayName || peer?.username} />}
      />
    </View>
  );
}
