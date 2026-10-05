import React, { useId, useRef } from "react";
import { Pressable, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import { useStreamerProgress } from "../../hooks/useStreamerProgress";
import { openStreamerShowcase } from "../../libs/badgeShowcase";
import { streamerBadgeBounds, streamerBadgeSvg } from "../../libs/streamer-badge-art";

interface Props {
  address?: string | null;
  canSelect?: boolean;
  size?: number;
  fontSize?: number;
  lineHeight?: number;
}

const StreamerBadge: React.FC<Props> = ({ address, canSelect = false, size, fontSize = size ?? 20, lineHeight = fontSize * 1.4 }) => {
  const { data } = useStreamerProgress(address);
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const instance = useId();
  const badgeRef = useRef<View>(null);
  const equipped = data?.cards.find((card) => card.id === data.selectedBadgeId && card.earnedAt);

  if (!address || !data || !(data.totalStreams > 0) || !equipped) return null;
  const bounds = streamerBadgeBounds(equipped.id, theme);
  const capHeight = fontSize * 0.732 * 1.1;
  const scale = capHeight / (bounds.bottom - bounds.top);

  return (
    <Pressable
      ref={badgeRef}
      collapsable={false}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t(`live.progress.card.${equipped.id}.name`)}
      style={{ width: (bounds.right - bounds.left) * scale, height: capHeight, flexShrink: 0, alignSelf: "flex-end", marginBottom: lineHeight / 2 - fontSize * 0.3375 }}
      onPress={() => openStreamerShowcase(equipped.id, address, canSelect, badgeRef.current)}
    >
      <View style={{ position: "absolute", left: -bounds.left * scale, top: -bounds.top * scale }}>
        <SvgXml xml={streamerBadgeSvg(equipped.id, theme, true, instance, 'compact')} width={120 * scale} height={120 * scale} />
      </View>
    </Pressable>
  );
};

export default StreamerBadge;
