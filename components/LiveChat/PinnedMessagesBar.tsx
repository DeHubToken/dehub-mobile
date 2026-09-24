import React, { memo, useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import ConfirmModal from "../common/ConfirmModal";
import { resolveChatGif, gifCaption } from "../../libs/chat-gif";
import type { LiveChatMessageData } from "../../services/livechat.service";

interface PinnedMessagesBarProps {
  pinnedMessages: LiveChatMessageData[];
  onPinnedPress?: (msg: LiveChatMessageData) => void;
  onUnpin?: (msg: LiveChatMessageData) => void;
  isModerator?: boolean;
}

const PinnedMessagesBar: React.FC<PinnedMessagesBarProps> = ({
  pinnedMessages,
  onPinnedPress,
  onUnpin,
  isModerator,
}) => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);

  const count = pinnedMessages.length;
  const safeIndex = activeIndex >= count ? 0 : activeIndex;
  const current = pinnedMessages[safeIndex];

  const handlePress = useCallback(() => {
    if (count > 1) {
      // Cycle to next pinned message
      setActiveIndex((prev) => (prev + 1) % count);
    }
    if (current) onPinnedPress?.(current);
  }, [count, current, onPinnedPress]);

  const [unpinConfirmVisible, setUnpinConfirmVisible] = useState(false);

  const handleUnpin = useCallback(() => {
    if (!current || !onUnpin) return;
    setUnpinConfirmVisible(true);
  }, [current, onUnpin]);

  const confirmUnpin = useCallback(() => {
    setUnpinConfirmVisible(false);
    if (!current || !onUnpin) return;
    onUnpin(current);
    if (safeIndex >= count - 1 && count > 1) {
      setActiveIndex(0);
    }
  }, [current, onUnpin, safeIndex, count]);

  const senderName = useMemo(() => {
    if (!current?.sender) return current?.senderAddress?.slice(0, 8) || t("liveChat.user");
    return current.sender.displayName || current.sender.username || t("liveChat.user");
  }, [current, t]);

  // A pin's one-line summary. Web posts a GIF with its URL as the body, so the
  // raw text would put an address here where every other kind gets a label.
  const preview = useMemo(() => {
    if (!current) return "";
    const gif = resolveChatGif(current);
    return (
      gifCaption(current, gif) ||
      (gif ? "GIF" : current.media?.length ? t("liveChat.photo") : t("liveChat.message"))
    );
  }, [current, t]);

  if (!current) return null;

  // Segment heights for the multi-pin indicator (Telegram style)
  const segmentHeight = count > 1 ? Math.max(4, Math.min(16, 40 / count)) : 0;
  const segmentGap = 2;

  return (<>
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      className="flex-row items-center bg-theme-neutrals-900/95 border-b border-white/5 px-3 py-2.5"
    >
      {/* Left indicator — segmented line for multiple pins */}
      {count > 1 ? (
        <View className="mr-3" style={{ height: count * (segmentHeight + segmentGap) - segmentGap }}>
          {pinnedMessages.map((_, i) => (
            <View
              key={i}
              style={{
                width: 2.5,
                height: segmentHeight,
                marginBottom: i < count - 1 ? segmentGap : 0,
                borderRadius: 1.5,
                backgroundColor: i === safeIndex ? "#F4F4F5" : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </View>
      ) : (
        <View className="mr-3">
          <View
            style={{
              width: 2.5,
              height: 28,
              borderRadius: 1.5,
              backgroundColor: "#F4F4F5",
            }}
          />
        </View>
      )}

      {/* Content */}
      <View className="flex-1 mr-2">
        <View className="flex-row items-center gap-1.5">
          <Icon name="Pin" size={13} color="#F4F4F5" />
          <Text className="text-blue-400 text-[11px] font-semibold">
            {count > 1 ? t("liveChat.pinnedMessageN", { n: safeIndex + 1 }) : t("liveChat.pinnedMessage")}
          </Text>
          {count > 1 && (
            <Text className="text-white/40 text-[11px]">
              {safeIndex + 1}/{count}
            </Text>
          )}
        </View>
        <Text className="text-white/60 text-[12px] mt-0.5" numberOfLines={1}>
          {preview}
        </Text>
      </View>

      {/* Sender name */}
      <Text className="text-white/60 text-[11px] mr-2" numberOfLines={1}>
        {senderName}
      </Text>

      {/* Unpin button — mods only */}
      {isModerator && onUnpin && (
        <TouchableOpacity
          onPress={handleUnpin}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
          className="p-1"
        >
          <Icon name="X" size={16} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>

    <ConfirmModal
      visible={unpinConfirmVisible}
      title={t("liveChat.unpinTitle")}
      description={t("liveChat.unpinConfirm")}
      confirmText={t("liveChat.unpinMessage")}
      confirmKind="danger"
      onConfirm={confirmUnpin}
      onCancel={() => setUnpinConfirmVisible(false)}
    />
  </>);
};

export default memo(PinnedMessagesBar);
