import React, { useId, useRef } from "react";
import { Pressable, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import { useStreamerProgress } from "../../hooks/useStreamerProgress";
import { openStreamerShowcase } from "../../libs/badgeShowcase";
import { streamerBadgeSvg } from "../../libs/streamer-badge-art";

interface Props {
  address?: string | null;
  canSelect?: boolean;
  size?: number;
}

const StreamerBadge: React.FC<Props> = ({ address, canSelect = false, size = 20 }) => {
  const { data } = useStreamerProgress(address);
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const instance = useId();
  const badgeRef = useRef<View>(null);
  const equipped = data?.cards.find((card) => card.id === data.selectedBadgeId && card.earnedAt);

  if (!address || !data || !(data.totalStreams > 0) || !equipped) return null;

  return (
    <Pressable
      ref={badgeRef}
      collapsable={false}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t(`live.progress.card.${equipped.id}.name`)}
      style={{ width: size, height: size, flexShrink: 0 }}
      onPress={() => openStreamerShowcase(equipped.id, address, canSelect, badgeRef.current)}
    >
      <SvgXml xml={streamerBadgeSvg(equipped.id, theme, true, instance)} width={size} height={size} />
    </Pressable>
  );
};

export default StreamerBadge;
