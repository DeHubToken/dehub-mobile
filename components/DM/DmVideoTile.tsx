/**
 * A DM video at its real shape, before it plays: the sender's cover frame with
 * their mirror and rotation, the kept length, the self-destruct chip and — when
 * the sender hid it — a frosted blind that lifts on tap. Tapping it again opens
 * the full-screen player, which applies the trim.
 *
 * Shared by the composer card, plain video bubbles and encrypted ones.
 */
import React, { memo, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useTranslation as _useCopy } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import {
  fitVideoBox,
  formatClock,
  hasRevealed,
  keptDuration,
  markRevealed,
  posterTime,
  videoTransform,
  type DmVideoOptions,
} from "../../libs/dm-video-options";
import { destructLeft, type DmDestruct } from "../../libs/dm-destruct";

/** Cover frame of a plain (not encrypted) video, taken at the sender's cover time. */
export function useVideoPoster(uri: string | null | undefined, options?: DmVideoOptions | null, skip?: boolean) {
  const [poster, setPoster] = useState<{ uri: string; w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const at = Math.round(posterTime(options) * 1000);
  useEffect(() => {
    if (!uri || skip) return;
    let alive = true;
    setFailed(false);
    VideoThumbnails.getThumbnailAsync(uri, { time: at, quality: 0.7 })
      .then((res) => { if (alive) setPoster({ uri: res.uri, w: res.width, h: res.height }); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [uri, at, skip]);
  return { poster, failed };
}

const CHIP = { backgroundColor: "rgba(0,0,0,0.58)", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row" as const, alignItems: "center" as const, gap: 3 };
const CHIP_TEXT = { color: "#fff", fontSize: 10, fontWeight: "600" as const, fontVariant: ["tabular-nums" as const] };

export interface DmVideoTileProps {
  posterUri?: string | null;
  /** Picture size before rotation, when known. */
  width?: number;
  height?: number;
  /** Seconds, for the length chip. */
  duration?: number;
  options?: DmVideoOptions | null;
  destruct?: DmDestruct | null;
  /** Short timer label for the composer card, before the message exists. */
  destructLabel?: string | null;
  mine: boolean;
  /** Remembers that a hidden video was uncovered. */
  messageId?: string;
  maxW: number;
  maxH: number;
  /** Blur the poster (an encrypted video's tiny placeholder). */
  softPoster?: boolean;
  loading?: boolean;
  failed?: boolean;
  onOpen?: () => void;
  onLongPress?: () => void;
  /** Composer card: no play button, the sheet opens instead. */
  hidePlay?: boolean;
  children?: React.ReactNode;
}

export const DmVideoTile: React.FC<DmVideoTileProps> = memo(({
  posterUri, width, height, duration, options, destruct, destructLabel, mine, messageId,
  maxW, maxH, softPoster, loading, failed, onOpen, onLongPress, hidePlay, children,
}) => {
  const { t: _copy } = _useCopy();
  const { boxW, boxH, innerW, innerH } = fitVideoBox(width, height, options, maxW, maxH);
  const hiddenForMe = options?.hidden === "reveal" && !mine;
  const [covered, setCovered] = useState(() => hiddenForMe && !(messageId && hasRevealed(messageId)));
  const lift = useSharedValue(0);
  const kept = keptDuration(options, duration);
  const left = destructLeft(destruct);
  const timer = destructLabel ?? (destruct?.mode === "view" ? _copy("dmVideo.destruct.view", { defaultValue: "1 view" }) : left);

  // A timed message counts down while it is on screen.
  const [, tick] = useState(0);
  useEffect(() => {
    if (destruct?.mode !== "time") return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [destruct?.mode]);

  const finishReveal = () => setCovered(false);
  const reveal = () => {
    if (messageId) markRevealed(messageId);
    lift.value = withTiming(1, { duration: 700, easing: Easing.bezier(0.7, 0, 0.2, 1) }, (done) => {
      if (done) runOnJS(finishReveal)();
    });
  };

  // The blind moves up; the frosted picture inside it stays put, so it reads
  // as glass sliding off the video rather than the video moving.
  const blindStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value * boxH }] }));
  const blindInner = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value * boxH }] }));
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: lift.value > 0 && lift.value < 1 ? 1 - lift.value : 0,
    transform: [{ translateY: (1 - lift.value) * boxH - 20 }],
  }));

  const picture = (blur?: number) =>
    posterUri ? (
      <SmartImage
        source={{ uri: posterUri }}
        recyclingKey={posterUri}
        cachePolicy={softPoster ? "none" : undefined}
        blurRadius={blur}
        contentFit="cover"
        style={{
          position: "absolute",
          width: innerW,
          height: innerH,
          left: (boxW - innerW) / 2,
          top: (boxH - innerH) / 2,
          transform: videoTransform(options),
        }}
      />
    ) : null;

  return (
    <Pressable
      onPress={() => { if (covered) reveal(); else onOpen?.(); }}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={covered
        ? _copy("dmVideo.revealAria", { defaultValue: "Reveal hidden video" })
        : _copy("dmVideo.play", { defaultValue: "Play video" })}
    >
      <View style={{ width: boxW, height: boxH, borderRadius: 10, overflow: "hidden", backgroundColor: "#000" }}>
        {picture(softPoster ? 12 : undefined)}
        {!posterUri && !failed && (
          <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="small" color="#777" />
          </View>
        )}
        {!posterUri && failed && (
          <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <Icon name="Video" size={28} color="#555" />
          </View>
        )}

        {!covered && !hidePlay && (
          <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" }}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="Play" size={20} color="#fff" fill="#fff" />}
            </View>
          </View>
        )}

        {covered && (
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: boxW, height: boxH, overflow: "hidden" }, blindStyle]}>
            <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: boxW, height: boxH }, blindInner]}>
              {picture(28)}
              <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,255,255,0.12)" }} />
            </Animated.View>
            <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 12, paddingVertical: 6 }}>
                <Icon name="Hand" size={14} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{_copy("dmVideo.tapToReveal", { defaultValue: "Tap to reveal" })}</Text>
              </View>
            </View>
          </Animated.View>
        )}
        {covered && (
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: boxW, height: 40, backgroundColor: "rgba(255,255,255,0.35)" }, sweepStyle]} />
        )}

        <View pointerEvents="none" style={{ position: "absolute", left: 6, top: 6, gap: 4, alignItems: "flex-start" }}>
          {kept != null && !hidePlay && (
            <View style={CHIP}><Text style={CHIP_TEXT}>{formatClock(kept)}</Text></View>
          )}
          {!!timer && (
            <View style={CHIP}>
              <Icon name="Timer" size={11} color="#fff" />
              <Text style={CHIP_TEXT}>{timer}</Text>
            </View>
          )}
        </View>
        {mine && options?.hidden === "reveal" && !hidePlay && (
          <View pointerEvents="none" style={[CHIP, { position: "absolute", right: 6, top: 6 }]}>
            <Icon name="EyeOff" size={11} color="#fff" />
            <Text style={CHIP_TEXT}>{_copy("dmVideo.hiddenTag", { defaultValue: "Hidden" })}</Text>
          </View>
        )}
        {children}
      </View>
    </Pressable>
  );
});
DmVideoTile.displayName = "DmVideoTile";

export default DmVideoTile;
