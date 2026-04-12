import React, { memo, useEffect, useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSnapshot } from "valtio";
import Icon from "../ui/Icon";
import { uploadState, type UploadJob, MAX_RETRIES } from "../../store/upload.store";
import { navigationRef } from "../../App";
import { ScreenNames } from "../../navigation/ScreenNames";

const PILL_BOTTOM_OFFSET = 80;
const DISMISS_DELAY = 3000;

const BADGE_SIZE = 44;
const BADGE_STROKE = 3;
const BADGE_RADIUS = (BADGE_SIZE - BADGE_STROKE) / 2;
const BADGE_CIRCUMFERENCE = 2 * Math.PI * BADGE_RADIUS;

const UploadProgressPill: React.FC = () => {
  const snap = useSnapshot(uploadState);
  const insets = useSafeAreaInsets();
  const [minimized, setMinimized] = useState(false);

  const currentJob = snap.jobs.find(
    (j) =>
      j.status === "uploading" ||
      j.status === "processing" ||
      j.status === "minting" ||
      j.status === "queued",
  ) as UploadJob | undefined;
  const failedJobs = snap.jobs.filter((j) => j.status === "failed") as UploadJob[];
  const recentlyDone = snap.jobs.find((j) => j.status === "done") as UploadJob | undefined;
  const activeCount = snap.jobs.filter(
    (j) => j.status !== "done" && j.status !== "failed",
  ).length;

  const shouldShow = !!(currentJob || failedJobs.length > 0 || recentlyDone);

  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (shouldShow) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 160 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      setMinimized(false);
      translateY.value = withTiming(100, { duration: 250, easing: Easing.in(Easing.ease) });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [shouldShow]);

  useEffect(() => {
    if (recentlyDone && !currentJob && failedJobs.length === 0) {
      const timer = setTimeout(() => {
        const { uploadActions } = require("../../store/upload.store");
        uploadActions.clearCompleted();
      }, DISMISS_DELAY);
      return () => clearTimeout(timer);
    }
  }, [recentlyDone, currentJob, failedJobs.length]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const handlePressPill = useCallback(() => {
    if (navigationRef.isReady()) {
      navigationRef.navigate(ScreenNames.UploadQueue as never);
    }
  }, []);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
  }, []);

  const handleExpand = useCallback(() => {
    setMinimized(false);
  }, []);

  if (!shouldShow) return null;

  const isFailed = failedJobs.length > 0 && !currentJob;
  const isDone = !!recentlyDone && !currentJob && failedJobs.length === 0;
  const progress = currentJob?.progress ?? (isDone ? 1 : 0);
  const progressPercent = Math.min(Math.round(progress * 100), 100);

  let statusText = "";
  if (isDone) {
    statusText = "Posted!";
  } else if (isFailed) {
    const retriable = failedJobs.filter((j) => j.retryCount < MAX_RETRIES);
    if (failedJobs.length === 1) {
      statusText = retriable.length > 0
        ? "Failed · Tap to retry"
        : "Failed · No retries left";
    } else {
      statusText = `${failedJobs.length} uploads failed`;
    }
  } else if (currentJob) {
    statusText = `${progressPercent}%`;
  }

  const title = currentJob?.title || failedJobs[0]?.title || recentlyDone?.title || "Upload";
  const truncatedTitle = title.length > 26 ? title.slice(0, 26) + "…" : title;
  const iconName = isDone ? "CircleCheck" : isFailed ? "CircleAlert" : "Upload";

  if (minimized) {
    return (
      <Reanimated.View
        style={[
          styles.badgeOuter,
          { bottom: PILL_BOTTOM_OFFSET + Math.max(insets.bottom, 8) },
          animStyle,
        ]}
        pointerEvents="box-none"
      >
        <Pressable onPress={handleExpand} style={styles.badgePressable}>
          <View style={styles.badgeCircle}>
            <Svg width={BADGE_SIZE} height={BADGE_SIZE} style={StyleSheet.absoluteFill}>
              <Circle
                cx={BADGE_SIZE / 2}
                cy={BADGE_SIZE / 2}
                r={BADGE_RADIUS}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={BADGE_STROKE}
                fill="none"
              />
              <Circle
                cx={BADGE_SIZE / 2}
                cy={BADGE_SIZE / 2}
                r={BADGE_RADIUS}
                stroke={isFailed ? "#f87171" : "#fff"}
                strokeWidth={BADGE_STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${BADGE_CIRCUMFERENCE}`}
                strokeDashoffset={`${BADGE_CIRCUMFERENCE * (1 - progress)}`}
                rotation={-90}
                origin={`${BADGE_SIZE / 2}, ${BADGE_SIZE / 2}`}
              />
            </Svg>
            <Icon
              name={iconName}
              size={18}
              color={isFailed ? "#f87171" : "#fff"}
            />
          </View>
        </Pressable>
      </Reanimated.View>
    );
  }

  return (
    <Reanimated.View
      style={[
        styles.container,
        { bottom: PILL_BOTTOM_OFFSET + Math.max(insets.bottom, 8) },
        animStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable onPress={handlePressPill} style={styles.pressable}>
        <View style={styles.pill}>
          <View style={styles.inner}>
            <View style={styles.iconWrap}>
              <Icon name={iconName} size={18} color={isFailed ? "#f87171" : "#fff"} />
            </View>
            <View style={styles.textWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {truncatedTitle}
                </Text>
                {activeCount > 1 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{activeCount}</Text>
                  </View>
                )}
              </View>
              <Text
                style={[styles.status, isFailed && styles.statusFailed]}
                numberOfLines={1}
              >
                {statusText}
              </Text>
            </View>
            <Pressable
              onPress={handleMinimize}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.minimizeBtn}
            >
              <Icon name="Minus" size={14} color="rgba(255,255,255,0.5)" />
            </Pressable>
            <Icon name="ChevronRight" size={16} color="rgba(255,255,255,0.4)" />
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(progressPercent, 1)}%` },
                isFailed && styles.progressFillFailed,
              ]}
            />
          </View>
        </View>
      </Pressable>
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    alignItems: "center",
  },
  pressable: {
    width: "100%",
  },
  pill: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(10,10,10,0.95)",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
    marginRight: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  countBadge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
  },
  countText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    fontWeight: "700",
  },
  status: {
    fontSize: 11,
    marginTop: 1,
    color: "rgba(255,255,255,0.5)",
  },
  statusFailed: {
    color: "#f87171",
  },
  minimizeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  progressFill: {
    height: 2,
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  progressFillFailed: {
    backgroundColor: "#f87171",
  },

  // Minimized circular badge
  badgeOuter: {
    position: "absolute",
    right: 16,
    zIndex: 999,
  },
  badgePressable: {
    alignItems: "center",
    justifyContent: "center",
  },
  badgeCircle: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: "rgba(10,10,10,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default memo(UploadProgressPill);
