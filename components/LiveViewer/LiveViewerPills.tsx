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
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Icon from "../ui/Icon";
import { formatCompactNumber } from "../../libs/numbers.util";
import { ChromeFill, EDGE, TEXT_SHADOW } from "../common/ViewerChrome";

interface Props {
  isLive: boolean;
  isPaused: boolean;
  isEnded: boolean;
  isScheduled?: boolean;
  /** When the broadcast started, for the running clock. */
  startedAt?: Date | null;
  /** How many are watching. A pill, not a header chip — see the note below. */
  viewerCount?: number;
  title?: string;
}

const two = (n: number) => (n < 10 ? "0" + n : String(n));

const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
};

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.pill}>
    <ChromeFill radius={13} />
    {children}
  </View>
);

const LiveViewerPills: React.FC<Props> = ({
  isLive,
  isPaused,
  isEnded,
  isScheduled,
  startedAt,
  viewerCount,
  title,
}) => {
  const { t } = useTranslation();
  /* Reused keys, not new ones: these five words are already translated
     into all 110 locales elsewhere in the bundle, and a fresh set would
     have shipped as English everywhere but here. */
  const statusLabel = isPaused
    ? t("ads.statuses.paused", { defaultValue: "Paused" }).toUpperCase()
    : isLive
      ? t("stages.live", { defaultValue: "LIVE" })
      : isEnded
        ? t("stages.ended", { defaultValue: "ENDED" })
        : isScheduled
          ? t("commandCentre.soon", { defaultValue: "SOON" })
          : t("postInfo.streamOffline", { defaultValue: "Stream Offline" }).toUpperCase();
  const statusDim = !isLive || isPaused;

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
      <Pill>
        <View style={[styles.dot, statusDim ? styles.dotDim : null]} />
        <Text style={styles.label}>{statusLabel}</Text>
      </Pill>

      {/* Audience. A count, not an avatar stack: the socket carries a
          number and inventing faces for it would be a lie at a glance.
          Here rather than in the header because that row was a capsule, a
          follow button and four controls over 375pt, and this is the one
          of them that is not a control. */}
      {viewerCount != null ? (
        <Pill>
          <Icon name="Eye" size={11} color="rgba(255,255,255,0.75)" strokeWidth={2} />
          <Text style={styles.value}>
            {formatCompactNumber(Math.max(0, viewerCount))}
          </Text>
        </Pill>
      ) : null}

      {elapsed ? (
        <Pill>
          <Icon name="Clock" size={11} color="rgba(255,255,255,0.75)" strokeWidth={2} />
          <Text style={styles.value}>{elapsed}</Text>
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
    gap: 6,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    maxWidth: 220,
    borderRadius: 13,
    paddingHorizontal: 10,
    gap: 5,
    overflow: "hidden",
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
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
    ...TEXT_SHADOW,
  },
});

export default memo(LiveViewerPills);
