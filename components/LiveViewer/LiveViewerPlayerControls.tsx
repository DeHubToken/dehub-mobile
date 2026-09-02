/**
 * Sound and fullscreen for the live viewer.
 *
 * The stream page hides the player's own top row (`hideTopControls`) because
 * the viewer header carries close and options — and with it went the only
 * mute and fullscreen buttons on the page. This row puts them back, drawn
 * from the same chrome kit as the header so the two read as one surface.
 *
 * Rendered in two places: under the header in the normal layout, and alone
 * at the top-right corner once the viewer goes immersive.
 */
import React, { memo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import {
  ChromeFill,
  CHROME_GAP,
  CHROME_HIT_SLOP,
  CHROME_RADIUS,
  CHROME_SIZE,
} from "../common/ViewerChrome";

interface Props {
  isMuted: boolean;
  immersive: boolean;
  onToggleMute: () => void;
  onToggleImmersive: () => void;
}

const LiveViewerPlayerControls: React.FC<Props> = ({
  isMuted,
  immersive,
  onToggleMute,
  onToggleImmersive,
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.row} pointerEvents="box-none">
      <Pressable
        onPress={onToggleMute}
        hitSlop={CHROME_HIT_SLOP}
        style={styles.chromeButton}
        accessibilityRole="button"
        accessibilityLabel={
          isMuted
            ? t("common.unmute", { defaultValue: "Unmute" })
            : t("common.mute", { defaultValue: "Mute" })
        }
      >
        <ChromeFill />
        <Icon name={isMuted ? "VolumeX" : "Volume2"} size={20} color="#fff" />
      </Pressable>
      <Pressable
        onPress={onToggleImmersive}
        hitSlop={CHROME_HIT_SLOP}
        style={styles.chromeButton}
        accessibilityRole="button"
        accessibilityLabel={
          immersive
            ? t("common.exitFullscreen", { defaultValue: "Exit fullscreen" })
            : t("common.fullscreen", { defaultValue: "Fullscreen" })
        }
      >
        <ChromeFill />
        <Icon name={immersive ? "Minimize" : "Maximize"} size={20} color="#fff" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: CHROME_GAP,
  },
  chromeButton: {
    width: CHROME_SIZE,
    height: CHROME_SIZE,
    borderRadius: CHROME_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});

export default memo(LiveViewerPlayerControls);
