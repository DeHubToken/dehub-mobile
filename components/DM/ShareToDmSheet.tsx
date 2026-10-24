import Icon from "../ui/Icon";
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import { useSearchFieldMaterial, SEARCH_INPUT_CLEAR } from '../../hooks/useSearchFieldMaterial';
import BadgeArtwork from "../common/BadgeArtwork";
import { getBadgeHoverOpticalStyle } from "../../libs/misc";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import SmartImage from "../common/SmartImage";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import Avatar from "../common/Avatar";
import GlassModal from "../ui/GlassModal";
import { getAvatarUrl, toastError, toastSuccess } from "../../libs";
import { useWebSocketApi } from "../../context/WebSocketContext";
import { getDmUserStatus } from "../../services/dm/dm.api";
import { dmSendQueue } from "../../services/dm/dm.send";
import { getBadgeUrlFor } from "../../libs/misc";
import { useDmContacts } from "../../store/dm.store";
import { getOtherParticipant } from "../../services/dm/dm.types";
import { ScreenNames } from "../../navigation/ScreenNames";
import { WEBSITE_LINK } from "../../config";
import { useUser } from "../../context/AuthContext";
import type { DmConversation } from "../../services/dm/dm.types";

type ShareToDmSheetProps = {
  visible: boolean;
  onClose: () => void;
  postTitle?: string;
} & ({ tokenId: number | string; url?: never } | { url: string; tokenId?: never });

const ShareToDmSheetComponent: React.FC<ShareToDmSheetProps> = ({
  visible,
  onClose,
  tokenId,
  url,
  postTitle,
}) => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const user = useUser();
  const ws = useWebSocketApi();
  const sendingRef = useRef(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (visible) setSentIds(new Set());
  }, [visible, tokenId, url]);
  const conversations = useDmContacts();
  const [search, setSearch] = useSurfaceDraft("components/DM/ShareToDmSheet.tsx:search", "");
  const searchMaterial = useSearchFieldMaterial();

  const myUserId = (user as any)?._id || (user as any)?.id;
  const myAddress = (user as any)?.walletAddress || (user as any)?.address;

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const other = getOtherParticipant(c, myUserId, myAddress);
      const name = (
        other?.displayName || other?.username || other?.address || ""
      ).toLowerCase();
      return name.includes(q);
    });
  }, [conversations, search, myUserId, myAddress]);

  const handleSelect = useCallback(
    async (conv: DmConversation) => {
      if (sendingRef.current || sentIds.has(conv._id)) return;
      sendingRef.current = true;
      setSendingId(conv._id);
      const postUrl = url ?? `${WEBSITE_LINK || ""}/app/post/${tokenId}`;
      const prefill = postTitle
        ? `${postTitle}\n${postUrl}`
        : postUrl;
      try {
        const other = getOtherParticipant(conv, myUserId, myAddress);
        if (!other?.address || !myUserId || !myAddress) throw new Error(t("common.somethingWentWrong"));
        const rawStatus = await getDmUserStatus(other.address);
        const status = (rawStatus as any)?.data ?? (rawStatus as any)?.result ?? rawStatus;
        const hasFreeAccess = status.freeAccessUsers?.some(
          (address: string) => address.toLowerCase() === myAddress.toLowerCase(),
        );
        if (Number(status.perMessageFee) > 0 && !hasFreeAccess) {
          onClose();
          navigation.navigate(ScreenNames.Chat as never, {
            conversationId: conv._id,
            sharedText: prefill,
          } as never);
          return;
        }
        dmSendQueue.init(ws);
        const tempId = dmSendQueue.sendText({
          conversationId: conv._id,
          userId: myUserId,
          address: myAddress,
          content: prefill,
        });
        if (!(await dmSendQueue.waitForDelivery(tempId))) throw new Error(t("dm.failedToSend"));
        setSentIds((previous) => new Set(previous).add(conv._id));
        toastSuccess(t("toasts.message_sent"));
      } catch (error) {
        toastError(error instanceof Error ? error.message : t("common.somethingWentWrong"));
      } finally {
        sendingRef.current = false;
        setSendingId(null);
      }
    },
    [navigation, tokenId, url, postTitle, onClose, t, sentIds, myUserId, myAddress, ws],
  );

  const renderItem = useCallback(
    ({ item }: { item: DmConversation }) => {
      const other = getOtherParticipant(item, myUserId, myAddress);
      const name = other?.displayName || other?.username || t("settings.unknown");
      const avatar = getAvatarUrl(other?.avatarImageUrl);
      const badgeImg = getBadgeUrlFor(other as any);
      return (
        <TouchableOpacity
          onPress={() => handleSelect(item)}
          disabled={sendingId !== null || sentIds.has(item._id)}
          activeOpacity={0.7}
          className="flex-row items-center px-4 py-3 gap-3"
        >
          <Avatar
            uri={avatar && avatar !== "default-avatar" ? avatar : undefined}
            size={40}
            name={name}
          />
          {/* Name and badge share a row of their own — the outer row's 12px gap
              is meant for the icon at the end, not for the badge. */}
          <View className="flex-1 flex-row items-center" style={{ gap: 4, minWidth: 0 }}>
            <Text
              className="text-[15px] text-white font-medium"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {name}
            </Text>
            {badgeImg ? (
              <BadgeArtwork source={badgeImg} style={getBadgeHoverOpticalStyle(badgeImg, 15, 0, 21)} contentFit="contain" />
            ) : null}
          </View>
          {sendingId === item._id ? (
            <ActivityIndicator size="small" color="#D4D4D8" />
          ) : (
            <Ionicons name={sentIds.has(item._id) ? "checkmark" : "send-outline"} size={18} color="#D4D4D8" />
          )}
        </TouchableOpacity>
      );
    },
    [myUserId, myAddress, handleSelect, t, sendingId, sentIds],
  );

  return (
    <GlassModal surface="theme" visible={visible} onClose={onClose} presentation="bottom">
      <View className="pb-6">
        <View className="flex-row items-center justify-between px-4 pt-1 pb-3">
          <Text className="text-lg font-semibold text-white">{t("dm.sendToDm")}</Text>
          <TouchableOpacity
            onPress={onClose}
            className="w-11 h-11 items-center justify-center -mr-2"
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <Ionicons name="close" size={22} color="#A6A9AC" />
          </TouchableOpacity>
        </View>

        <View className="mx-4 mb-3 bg-theme-neutrals-800 rounded-xl px-3 py-2 flex-row items-center gap-2" style={searchMaterial.surface}>
          <Ionicons name="search" size={16} color="#A1A1AA" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            style={SEARCH_INPUT_CLEAR}
            onFocus={searchMaterial.onFocus}
            onBlur={searchMaterial.onBlur}
            placeholder={t("messages.searchConversations")}
            placeholderTextColor="#8B8D90"
            className="flex-1 text-white text-sm p-0 m-0"
          />
        </View>

        {conversations.length === 0 ? (
          <View className="items-center py-10 px-6">
            <Icon name="MessageEnvelope" size={40} color="#4B5563" />
            <Text className="text-theme-neutrals-500 text-sm text-center mt-3">
              {t("dm.noConversationsYet")}{"\n"}{t("dm.startDmToShare")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c._id}
            renderItem={renderItem}
            style={{ maxHeight: 400 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text className="text-theme-neutrals-500 text-center py-8 text-sm">
                {t("dm.noMatchingConversations")}
              </Text>
            }
          />
        )}
      </View>
    </GlassModal>
  );
};

export const ShareToDmSheet = memo(ShareToDmSheetComponent);
export default ShareToDmSheet;
