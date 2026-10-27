import React, { memo, useEffect, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  withDelay,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSnapshot } from "valtio";
import Icon from "../ui/Icon";
import SmartImage from "../common/SmartImage";
import { uploadState, uploadActions, type UploadJob, MAX_RETRIES } from "../../store/upload.store";
import { navigationRef } from "../../App";
import { postLandingState, uploadPillRect } from "../../libs/postLanding";
import { ScreenNames } from "../../navigation/ScreenNames";

const PILL_BOTTOM_OFFSET = 80;
const DISMISS_DELAY = 3000;

const BADGE_SIZE = 44;
const BADGE_STROKE = 3;
const BADGE_RADIUS = (BADGE_SIZE - BADGE_STROKE) / 2;
const BADGE_CIRCUMFERENCE = 2 * Math.PI * BADGE_RADIUS;

const UploadProgressPill: React.FC = () => {
  const { t } = useTranslation();
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

  // A posted video still being prepared, or the outcome of one, leads the pill
  // whatever the job itself is still doing (the mint, the payment).
  const videoJob = snap.jobs.find((j) => j.video && !j.video.dismissed) as UploadJob | undefined;
  const video = videoJob?.video;

  // While a new post lands in Home its card shows how the upload is going,
  // so the pill steps aside for that job (libs/postLanding).
  // The pill landing keeps the pill until it opens out of it; and a post
  // that has landed needs no "Posted" after its card has said so.
  const { landing, landedJobId } = useSnapshot(postLandingState);
  const landingJobId = landing && (landing.style !== "pill" || landing.phase !== "waiting") ? landing.jobId : null;
  const leadJob = videoJob ?? currentJob ?? recentlyDone;
  const landingCovers = !!leadJob && (leadJob.id === landingJobId || (!videoJob && !currentJob && leadJob.id === landedJobId));

  const shouldShow = !landingCovers && !!(videoJob || currentJob || failedJobs.length > 0 || recentlyDone);

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

  // Once the post is up the bar reads full, then fades out under the pill.
  const barDone = video ? video.stage === "ready" : !!recentlyDone && !currentJob && failedJobs.length === 0;
  const barOpacity = useSharedValue(1);
  useEffect(() => {
    barOpacity.value = barDone ? withDelay(600, withTiming(0, { duration: 400 })) : 1;
  }, [barDone]);
  const barStyle = useAnimatedStyle(() => ({ opacity: barOpacity.value }));

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const handlePressPill = useCallback(() => {
    if (!navigationRef.isReady()) return;
    if (videoJob && video?.stage === "ready") {
      uploadActions.dismissVideo(videoJob.id);
      (navigationRef.navigate as any)(ScreenNames.PostResolver, { tokenId: String(video.tokenId) });
      return;
    }
    navigationRef.navigate(ScreenNames.UploadQueue as never);
  }, [videoJob, video?.stage, video?.tokenId]);

  // Where the pill sits: the pill landing flies out of it.
  const pillRef = useRef<View>(null);
  const measurePill = useCallback(() => {
    pillRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) uploadPillRect.current = { x, y, width, height };
    });
  }, []);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
  }, []);

  const handleExpand = useCallback(() => {
    setMinimized(false);
  }, []);

  if (!shouldShow) return null;

  const videoFailed = video?.stage === "failed";
  const videoReady = video?.stage === "ready";
  const isFailed = videoFailed || (!video && failedJobs.length > 0 && !currentJob);
  const isDone = videoReady || (!video && !!recentlyDone && !currentJob && failedJobs.length === 0);
  const progress = isDone ? 1 : video ? video.progress / 100 : currentJob?.progress ?? 0;
  const progressPercent = Math.min(Math.round(progress * 100), 100);

  let statusText = "";
  let headline: string | null = null;
  if (video) {
    if (videoReady) headline = t("upload.pillPostedView");
    else if (videoFailed) headline = t("upload.pillVideoFailed");
    else {
      headline = t("upload.pillPreparingVideo");
      statusText = videoJob?.status === "minting"
        ? `${progressPercent}% · ${t("upload.stageMinting")}`
        : `${progressPercent}%`;
    }
    if (!statusText) statusText = videoJob?.title || t("upload.pillDefaultTitle");
  } else if (isDone) {
    statusText = t("upload.pillPosted");
  } else if (isFailed) {
    const retriable = failedJobs.filter((j) => j.retryCount < MAX_RETRIES);
    if (failedJobs.length === 1) {
      statusText = retriable.length > 0
        ? t("upload.pillFailedRetry")
        : t("upload.pillFailedNoRetries");
    } else {
      statusText = t("upload.pillUploadsFailed", { count: failedJobs.length });
    }
  } else if (currentJob) {
    statusText = `${progressPercent}%`;
  }

  const title = headline || currentJob?.title || failedJobs[0]?.title || recentlyDone?.title || t("upload.pillDefaultTitle");
  const truncatedTitle = !headline && title.length > 26 ? title.slice(0, 26) + "…" : title;
  const iconName = isDone ? "CircleCheck" : isFailed ? "CircleAlert" : "Upload";
  const thumbnailUri = (videoJob ?? currentJob)?.thumbnailUri;

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
        <Pressable
          onPress={handleExpand}
          style={styles.badgePressable}
          accessibilityRole="button"
          accessibilityLabel={
            isFailed
              ? t("upload.pillA11yFailed")
              : t("upload.pillA11yProgress", { percent: progressPercent })
          }
        >
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
                stroke={isFailed ? "#F4F4F5" : "#fff"}
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
              color={isFailed ? "#F4F4F5" : "#fff"}
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
        <View ref={pillRef} collapsable={false} onLayout={measurePill} style={styles.pill}>
          <View style={styles.inner}>
            <View style={styles.iconWrap}>
              {thumbnailUri ? (
                <>
                  <SmartImage
                    source={{ uri: thumbnailUri }}
                    recyclingKey={thumbnailUri}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                  {(isDone || isFailed) && (
                    <View style={styles.thumbBadge}>
                      <Icon name={iconName} size={14} color={isFailed ? "#F4F4F5" : "#fff"} />
                    </View>
                  )}
                </>
              ) : (
                <Icon name={iconName} size={18} color={isFailed ? "#F4F4F5" : "#fff"} />
              )}
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
              accessibilityRole="button"
              accessibilityLabel={t("upload.pillMinimize")}
            >
              <Icon name="Minus" size={14} color="rgba(255,255,255,0.5)" />
            </Pressable>
            <Icon name="ChevronRight" size={16} color="rgba(255,255,255,0.4)" />
          </View>

          <Reanimated.View style={[styles.progressTrack, barStyle]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(progressPercent, 1)}%` },
                isFailed && styles.progressFillFailed,
              ]}
            />
          </Reanimated.View>
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
    borderRadius: 12,
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
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  thumbBadge: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 12,
    fontWeight: "700",
  },
  status: {
    fontSize: 12,
    marginTop: 1,
    color: "rgba(255,255,255,0.5)",
  },
  statusFailed: {
    color: "#F4F4F5",
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
    backgroundColor: "rgba(255,255,255,0.55)",
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
