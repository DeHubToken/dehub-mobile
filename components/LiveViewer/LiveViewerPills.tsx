/**
 * The strip of context pills under the live viewer's header.
 *
 * Every live app on a phone puts a scrolling row of small tags here, and the
 * stream page had nowhere to put its own: state, elapsed time and title were
 * competing for the header, which is why the header had grown two lines.
 * They are facts about the stream, they are all short, and they belong on one
 * scrollable line that can overflow off the right edge without pushing
 * anything around.
 *
 * Monochrome, like the rest of the chrome: state is carried by the dot's
 * opacity and the word, never by a hue.
 */
import React, { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Avatar from "../common/Avatar";
import { DhbCoin } from "../common/DhbCoin";
import Icon from "../ui/Icon";
import { formatCompactNumber } from "../../libs/numbers.util";
import { EDGE, TEXT_SHADOW } from "../common/ViewerChrome";

interface Props {
  isLive: boolean;
  isPaused: boolean;
  isEnded: boolean;
  /** Kept for the caller's sake; the strip no longer says anything about it. */
  isScheduled?: boolean;
  /** When the broadcast started, for the running clock. */
  startedAt?: Date | null;
  /** How many are watching. A pill, not a header chip — see the note below. */
  viewerCount?: number;
  title?: string;
  /** DHB gifted to this stream, all told. */
  giftTotal?: number;
  /** The latest faces in the room, newest first, for the "who's here" pill. */
  faces?: { uri?: string; name: string }[];
  /** Opens the Who's here sheet. */
  onOpenAudience?: () => void;
}

const two = (n: number) => (n < 10 ? "0" + n : String(n));

const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
};

/** A fact on the picture: text and a shadow, no chip behind it. */
const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.pill}>{children}</View>
);

const LiveViewerPills: React.FC<Props> = ({
  isLive,
  isPaused,
  isEnded,
  isScheduled,
  startedAt,
  viewerCount,
  title,
  giftTotal,
  faces,
  onOpenAudience,
}) => {
  const { t } = useTranslation();
  /* Reused keys, not new ones: these five words are already translated
     into all 110 locales elsewhere in the bundle, and a fresh set would
     have shipped as English everywhere but here. */
  // One interval, and only while the stream is actually running — an ended
  // stream's clock would otherwise keep counting past the end of it.
  const running = isLive && !isPaused && !!startedAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = useMemo(() => {
    if (!running || !startedAt) return null;
    return formatElapsed(now - startedAt.getTime());
  }, [running, startedAt, now]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Live and how long, in one tag: red is the only hue on the frame. */}
      {isLive && !isEnded ? (
        <Pill>
          <View style={styles.liveTag}>
            <Text style={styles.liveText}>{isPaused ? t("ads.statuses.paused") : t("live.statusLive")}</Text>
          </View>
          {elapsed ? <Text style={styles.value}>{elapsed}</Text> : null}
        </Pill>
      ) : null}

      {/* Who's here: the newest faces and the head count. Tap for the sheet
          with the host, top tippers, most active and everyone watching. */}
      {onOpenAudience ? (
        <Pressable
          onPress={onOpenAudience}
          accessibilityRole="button"
          accessibilityLabel={t("liveViewer.whosHere")}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          <Pill>
            {faces && faces.length ? (
              <View style={styles.faces}>
                {faces.slice(0, 3).map((f, i) => (
                  <View key={i} style={[styles.face, i > 0 ? styles.faceOverlap : null]}>
                    <Avatar uri={f.uri} size={18} name={f.name} />
                  </View>
                ))}
              </View>
            ) : (
              <Icon name="Users" size={12} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            )}
            <Text style={styles.value}>
              {t("liveViewer.hereCount", { formatted: formatCompactNumber(Math.max(0, viewerCount ?? 0)) })}
            </Text>
            <Icon name="ChevronRight" size={11} color="rgba(255,255,255,0.6)" strokeWidth={2.4} />
          </Pill>
        </Pressable>
      ) : null}

      {giftTotal != null ? (
        <Pill>
          <DhbCoin size={11} />
          <Text style={styles.value}>{formatCompactNumber(Math.max(0, giftTotal))}</Text>
        </Pill>
      ) : null}

      {title ? (
        <Pill>
          <Text style={styles.value} numberOfLines={1}>
            {title}
          </Text>
        </Pill>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
    marginTop: 8,
  },
  content: {
    paddingHorizontal: EDGE,
    gap: 12,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 28,
    maxWidth: 220,
    paddingHorizontal: 2,
    gap: 5,
  },
  liveTag: {
    backgroundColor: "#EF4444",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  liveText: {
    color: "#fff",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  faces: {
    flexDirection: "row",
    marginLeft: -5,
  },
  face: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.55)",
  },
  faceOverlap: {
    marginLeft: -6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  dotDim: {
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  label: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    ...TEXT_SHADOW,
  },
  value: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
    ...TEXT_SHADOW,
  },
});

export default memo(LiveViewerPills);
