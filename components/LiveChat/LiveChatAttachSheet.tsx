/**
 * Everything you can put in a public-chat message, behind one button.
 * ===================================================================
 *
 * Public chat had a composer with a single GIF button on it, and only when the
 * field was empty — so a photo could not be posted from the phone at all,
 * while web has had pictures, GIFs and an emoji picker for months.
 *
 * The obvious fix — a row of icons, the way the DM composer does it — is the
 * wrong one on this screen. The DM row is eight buttons wide and the public
 * chat composer already carries a mention list, a character counter, the
 * assistant hint and the AI button; on a 360dp phone the text field ends up
 * narrower than the toolbar under it. So one attach button opens this, and the
 * composer keeps its width.
 *
 * Emoji live here rather than behind a second button because the keyboard
 * already has every emoji there is — what this adds is the shortlist people
 * actually use, one tap from the same place as the picture and the GIF, and
 * the same six the reaction picker offers so the two never disagree.
 *
 * Video is deliberately absent. The chat message type is `'image' | 'gif'`
 * (dehub-stream-backend src/livechat/livechat.types.ts) and the upload
 * function's allow-list is images and audio, so a video option would offer
 * something neither client could post or render.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

import GlassModal from '../ui/GlassModal';
import Icon, { type IconName } from '../ui/Icon';

/**
 * The same shortlist the reaction picker uses, plus the ones people type
 * rather than react with. Two rows of eight on a narrow phone.
 */
export const QUICK_EMOJIS = [
  '🔥', '❤️', '😂', '👀', '💯', '🙌', '👍', '🙏',
  '😅', '😍', '🤝', '🚀', '🎉', '😭', '🤔', '👋',
];

interface LiveChatAttachSheetProps {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickGif: () => void;
  onPickEmoji: (emoji: string) => void;
}

function AttachAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center px-5 py-3.5"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
        <Icon name={icon} size={18} color="#D4D4D8" />
      </View>
      <Text className="text-white text-[15px] font-medium">{label}</Text>
    </TouchableOpacity>
  );
}

const LiveChatAttachSheet: React.FC<LiveChatAttachSheetProps> = ({
  visible,
  onClose,
  onPickImage,
  onPickGif,
  onPickEmoji,
}) => {
  const { t } = useTranslation();

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      scrollable
      maxHeight="60%"
      blurIntensity={30}
    >
      <View className="pb-4 pt-2">
        <Text className="text-theme-neutrals-400 text-xs text-center py-3 font-semibold uppercase tracking-widest">
          {t('liveChat.attachTitle', 'Add to your message')}
        </Text>

        <AttachAction
          icon="Image"
          label={t('liveChat.attachPhoto', 'Photo')}
          onPress={onPickImage}
        />
        <AttachAction
          icon="Clapperboard"
          label={t('liveChat.attachGif', 'GIF')}
          onPress={onPickGif}
        />

        {/* The picker stays open on a tap: people send two or three of these in
            a row, and closing after each one costs a trip back through the
            attach button every time. */}
        <Text className="text-theme-neutrals-400 text-xs px-5 pt-3 pb-2 font-semibold uppercase tracking-widest">
          {t('liveChat.attachEmoji', 'Emoji')}
        </Text>
        <View className="flex-row flex-wrap px-3">
          {QUICK_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => onPickEmoji(emoji)}
              activeOpacity={0.6}
              className="w-[12.5%] items-center justify-center py-2.5"
              accessibilityRole="button"
              accessibilityLabel={emoji}
            >
              <Text style={{ fontSize: 24 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </GlassModal>
  );
};

export default LiveChatAttachSheet;
