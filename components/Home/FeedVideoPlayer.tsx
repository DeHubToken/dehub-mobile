import { PersistentVideoView } from '../common/PersistentVideoView';
import { isPictureInPicturePlayer, canStartVideo } from '../../libs/pictureInPicture';
import { useMediaVolume } from '../../libs/video-preferences';
import { useFeedPlaybackAllowed, useCallInProgress, visualActivity } from "../../libs/visualActivity";
import { MediaControlIcon as BareIcon, MediaControlText } from "../common/MediaControlGlyph";
import { usePostVideoPlayer } from "../../hooks/usePostVideoPlayer";
import { hasPostVideoSession, postMediaIsTransferring, preparePostMediaNavigation } from "../../libs/post-media-session";
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  GestureResponderEvent,
  PanResponder,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { VideoView, VideoPlayer, isPictureInPictureSupported } from "expo-video";
import PictureInPictureButton from "../common/PictureInPictureButton";
import { configureForBackgroundPlayback, releaseBackgroundPlayback } from "../../libs/audioSession";
import { feedVolumeResponder } from "../../libs/feed-volume-responder";
import { GestureDetector } from "react-native-gesture-handler";
import { useScrubGesture } from "../../hooks/useScrubGesture";
import { ACTIVE_FEED_BUFFER_OPTIONS } from "../../libs/videoBuffering";
import { requestVideoPlayback } from "../../libs/video-start";
import { createLogger } from "../../libs/logger";
import {
  getPlaybackRateFor,
  setPlaybackRate as persistPlaybackRate,
  getVolume,
  setVolume as persistVolume,
} from "../../libs/video-preferences";
import SmartImage from "../common/SmartImage";
import { useAppTheme } from "../../context/ThemeContext";
import { patchPostStage } from "../../libs/postStage";
import { useFeedBleed } from "./feedBleed";
import type { CaptionControls } from "../VideoPlayerCore/CaptionOverlay";
import Spinner from "../common/Spinner";
import { useNavigation } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { formatCompactNumber } from "../../libs/numbers.util";
import {
  requestAudioFocus,
  releaseAudioFocus,
} from "../../libs/audioFocus";
import { stopActivePreview } from "../../libs/previewRegistry";
import {
  requestFeedVideoFocus,
  releaseFeedVideoFocus,
} from "../../libs/feedVideoFocus";
import { createViewRecorder } from "../../services/view.service";
import { ScreenNames } from "../../navigation/ScreenNames";
import { getCachedMuted, setMutedState } from "../../libs/videoMutedState";
import { useDataSaver } from "../../hooks/useDataSaver";
import { getAppPrefs, useAppPrefs } from "../../hooks/useAppPrefs";
import { useVideoSegments, segmentAt } from "../../hooks/useVideoSegments";
import { useMediaAspect, THIN_MIN_RATIO } from "../../hooks/useMediaAspect";
import { useSettledAutoplay } from "../../hooks/useSettledAutoplay";
import { useCellState } from "../../hooks/useCellState";
import { toastInfo } from "../../libs/toast";
import { toastError, toastSuccess } from "../../libs/toast";
import { retryTranscode } from "../../services/nft.service";
import CaptionOverlay from "../VideoPlayerCore/CaptionOverlay";
import { PLAYER_CONSTANTS } from "../VideoPlayerCore/utils";
import { getSubtitlesEnabled } from "../../libs/subtitlePrefs";
import { movedBeyondMediaTapSlop } from "../../libs/media-gesture";
import {
  continuesTapGesture,
  TAP_GESTURE_WINDOW_MS,
  TAP_LIKE_ANIMATION_MS,
  TAP_LOVE_ANIMATION_MS,
  TAP_REACTION_RESOLUTION_MS,
} from "../../libs/tap-gesture";

/** Card content width — mirrors FeedCard, which lays this player out. */
const cardWidthFor = (screenWidth: number) => screenWidth - 40;
const playbackLog = createLogger("FeedVideoPlayer");

/**
 * Tallest the media may get. A portrait clip stops growing here and narrows
 * its own width instead, so a vertical video takes about a screen rather than
 * scrolling for three.
 */
const maxMediaHeightFor = (screenHeight: number) => Math.round(Math.min(600, screenHeight * 0.6));

/**
 * Post page cap: the clip is the page, so it grows to most of the screen, and
 * at least as tall as a full-width 9:16 clip so a vertical video spans the
 * whole width.
 */
const postPageMaxHeightFor = (screenHeight: number, boxWidth: number) =>
  Math.round(Math.max(screenHeight * 0.8, (boxWidth * 16) / 9));

/**
 * Width of the media box. Takes the live window size (useWindowDimensions) so
 * split-screen and unfolding resize the player instead of keeping the size
 * the app started with.
 */
const mediaBoxWidth = (
  win: { width: number; height: number },
  isMinimal: boolean,
  mediaAspect: number,
  postPage = false,
) => {
  // The post page runs its media edge to edge, whatever the theme.
  const fullWidth = isMinimal || postPage ? win.width : cardWidthFor(win.width);
  const maxHeight = postPage ? postPageMaxHeightFor(win.height, fullWidth) : maxMediaHeightFor(win.height);
  return Math.min(fullWidth, Math.round(maxHeight * mediaAspect));
};

/** Whether this device can pop a video out. Not every platform build of
 *  expo-video carries the check, so a missing one reads as "no". */
const pipSupported = () => {
  try {
    return typeof isPictureInPictureSupported === "function" && isPictureInPictureSupported();
  } catch {
    return false;
  }
};

/**
 * Cinematic feed (system theme, home): the box is always the full width, and
 * as tall as the clip up to the post page cap. A clip thinner than that is
 * cropped to the box rather than letterboxed; 9:16 always fits whole, since
 * the cap is never below a full-width 9:16 frame.
 */
const bleedBoxAspect = (win: { width: number; height: number }, mediaAspect: number) =>
  Math.max(mediaAspect, win.width / postPageMaxHeightFor(win.height, win.width));

interface FeedVideoPlayerProps {
  thumbnail: string;
  /** Post page: the clip fills the width or most of the screen height, at its
   *  real shape even when thinner than 9:16, and sits centred. */
  postPage?: boolean;
  videoUrl: string | undefined;
  /** Absent (older posts) or 'done' renders normally. 'pending'/'on' shows a
   *  processing spinner instead of attempting playback; 'failed' shows an
   *  error state — in both cases videoUrl points at a file that was never
   *  actually uploaded, so mounting the player would just hang or error. */
  transcodingStatus?: "pending" | "on" | "done" | "failed";
  /** Only the post's owner can reach Edit → Replace video file, so the
   *  failed-state hint pointing there only makes sense for them. */
  isOwner?: boolean;
  duration?: string;
  tokenId: string | number | undefined;
  isContentGated: boolean;
  isPPVLocked: boolean;
  isHoldingsLocked: boolean;
  isBountyLocked: boolean;
  isComboLocked: boolean;
  isBounty: boolean;
  ppvAmount: number;
  ppvCurrency: string;
  lockAmount: number;
  lockCurrency: string;
  bountyAmount: number;
  bountyCurrency: string;
  isVisible: boolean;
  /** True only on the card the feed has handed autoplay to while scrolling.
   *  Every other visible card still mounts, still shows its play button and
   *  still starts on a tap — it just does not start on its own. Defaults to
   *  true for callers with no notion of an active row. */
  isAutoplayActive?: boolean;
  isSignedIn: boolean;
  onPress: () => void;
  /** Double tap casts Like; triple tap upgrades it to Love. */
  onTapReaction?: (reaction: "like" | "love") => void;
  onPPVPress?: () => void;
  onLockPress?: () => void;
  onBountyPress?: () => void;
  /** Hide play button, controls, progress bar, and duration badge (used for shorts). */
  /** Creator address — a rate pinned to this channel starts the video there. */
  creator?: string | null;
  hideControls?: boolean;
  /** Mounted by a tap on the poster that stood in for this card: start at once. */
  startOnMount?: boolean;
  /** The poster already waited before allocating this native player. */
  autoplaySettled?: boolean;
  /** The person tapped play here, so the wrapper must keep this card mounted. */
  onUserStarted?: () => void;
  onPictureInPictureChange?: (active: boolean) => void;
}

// Grace period before a scrolled-to video gets a media source at all, so a
// fast flick past a row doesn't spin up a player it is about to discard.
// Playback starts on readyToPlay after this fires. Was 1200ms — well past the
// point where a settled card reads as broken rather than loading. The shorts
// grid has always used 250ms for the same job.
const AUTOPLAY_DELAY = 400;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/**
 * A media press lives inside the feed's vertical FlatList. Keep a local travel
 * guard even though Pressable normally cancels under a scroll: Android can
 * still deliver `onPress` when the native list intercepts a short, fast flick.
 */
const useTapOnlyPress = (onPress: (event: GestureResponderEvent) => void) => {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    originRef.current = { x: pageX, y: pageY };
    movedRef.current = false;
  }, []);

  const onTouchMove = useCallback((event: GestureResponderEvent) => {
    const origin = originRef.current;
    if (!origin || movedRef.current) return;
    const { pageX, pageY } = event.nativeEvent;
    if (movedBeyondMediaTapSlop(origin, { x: pageX, y: pageY })) {
      movedRef.current = true;
    }
  }, []);

  const handlePress = useCallback((event: GestureResponderEvent) => {
    if (movedRef.current) return;
    onPress(event);
  }, [onPress]);

  const onTouchCancel = useCallback(() => {
    movedRef.current = true;
    originRef.current = null;
  }, []);

  return { onPress: handlePress, onTouchStart, onTouchMove, onTouchCancel };
};

const LOVE_BLOOM = [
  { x: -14, y: -54, size: 14 },
  { x: -44, y: -30, size: 10 },
  { x: 38, y: -34, size: 11 },
  { x: -50, y: 2, size: 8 },
  { x: 46, y: 4, size: 9 },
] as const;

const FeedVideoPlayerComponent: React.FC<FeedVideoPlayerProps> = ({
  thumbnail,
  postPage = false,
  videoUrl,
  transcodingStatus,
  isOwner,
  duration,
  tokenId,
  isContentGated,
  isPPVLocked,
  isHoldingsLocked,
  isBountyLocked,
  isComboLocked,
  isBounty,
  ppvAmount,
  ppvCurrency,
  lockAmount,
  lockCurrency,
  bountyAmount,
  bountyCurrency,
  isVisible,
  isAutoplayActive = true,
  isSignedIn,
  onPress,
  onTapReaction,
  onPPVPress,
  onLockPress,
  onBountyPress,
  creator,
  hideControls = false,
  startOnMount = false,
  autoplaySettled = false,
  onUserStarted,
  onPictureInPictureChange,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [isPlaying, setIsPlaying] = useState(false);
  const postPageRef = useRef(postPage);
  postPageRef.current = postPage;
  const tokenIdRef = useRef(tokenId);
  tokenIdRef.current = tokenId;
  const [isMuted, setIsMuted] = useState(() => getCachedMuted());
  const [currentTime, setCurrentTime] = useState(0);
  // `currentTime` only reaches the screen through the scrubber, which exists
  // only while `showControls` is true. With `timeUpdateEventInterval = 0.5` the
  // old unconditional setState re-rendered the autoplaying card twice a second
  // for nothing — right through every fling. The ref carries the real value for
  // seek/fullscreen; state is only committed while something is watching it.
  const currentTimeRef = useRef(0);
  const scrubbingRef = useRef(false);
  const showControlsRef = useRef(false);
  // Caption playhead. Same rule as `currentTime`: only committed while
  // subtitles are switched on, so a card with CC off never re-renders on tick.
  const [captionPosMs, setCaptionPosMs] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [hasStartedAutoplay, setHasStartedAutoplay] = useState(false);
  // True when the card started itself rather than from a tap. With
  // "Start autoplay muted" on, those always start silent — the shared mute
  // flag persists across launches, so otherwise opening the app somewhere
  // quiet plays whatever sound was left on last time.
  const autoStartRef = useRef(false);
  const shouldStartMuted = useCallback(
    () => getCachedMuted() || (autoStartRef.current && getAppPrefs().autoplayMuted),
    [],
  );
  const [isBuffering, setIsBuffering] = useState(false);
  // True from the instant a tap lands until this card's first frame is on
  // screen. Nothing used to mark that window: `isPlaying` stays false while the
  // source attaches and buffers, so the play button just sat there and the tap
  // read as dropped. The buffering spinner was no help either — it was gated on
  // `isPlaying`, so it could only ever appear after playback had already begun.
  const [isStarting, setIsStarting] = useState(false);
  // Read by the tap handler, which must see the current value inside the same
  // tick that opened the window rather than the previous render's state.
  const isStartingRef = useRef(false);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  // Android can hand the VideoView a surface still holding a frame from a
  // neighbouring card's video. Keep the view transparent (thumbnail shows
  // through) until THIS source has drawn its own first frame.
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const isPlayingRef = useRef(false);
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { liteMode } = useDataSaver();
  const { autoplay: autoplayEnabled, skipSegments: skipSegmentsPref } = useAppPrefs();
  const playerRef = useRef<VideoPlayer | null>(null);
  const videoViewRef = useRef<VideoView>(null);
  const lastSurfaceTapRef = useRef(0);
  const surfaceTapCountRef = useRef(0);
  const surfaceTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surfaceWasPlayingRef = useRef(false);
  const surfaceWasUserStartedRef = useRef(false);
  const tapAnimProgress = useRef(new Animated.Value(0)).current;
  const [tapAnimReaction, setTapAnimReaction] = useState<"like" | "love" | null>(null);
  const [tapAnimPos, setTapAnimPos] = useState({ x: 0, y: 0 });
  const [tapAnimRun, setTapAnimRun] = useState(0);

  const resetSurfaceTapSequence = useCallback(() => {
    if (surfaceTapTimerRef.current) clearTimeout(surfaceTapTimerRef.current);
    surfaceTapTimerRef.current = null;
    surfaceTapCountRef.current = 0;
    lastSurfaceTapRef.current = 0;
  }, []);

  useEffect(() => () => {
    resetSurfaceTapSequence();
    tapAnimProgress.stopAnimation();
  }, [resetSurfaceTapSequence, tapAnimProgress]);

  // As in the shorts viewer, attach the native driver only after the overlay
  // exists. Starting it in the callback that mounted the view dropped the
  // first frames on Android's video compositor.
  useEffect(() => {
    if (!tapAnimReaction || tapAnimRun === 0) return;
    tapAnimProgress.stopAnimation();
    tapAnimProgress.setValue(0);
    const animation = Animated.timing(tapAnimProgress, {
      toValue: 1,
      duration: tapAnimReaction === "love" ? TAP_LOVE_ANIMATION_MS : TAP_LIKE_ANIMATION_MS,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setTapAnimReaction(null);
    });
    return () => animation.stop();
  }, [tapAnimReaction, tapAnimRun, tapAnimProgress]);

  const showTapReactionAnimation = useCallback((
    reaction: "like" | "love",
    x: number,
    y: number,
  ) => {
    setTapAnimReaction(reaction);
    setTapAnimPos({ x: x - 32, y: y - 32 });
    setTapAnimRun((run) => run + 1);
  }, []);

  const viewRecorderRef = useRef(
    tokenId != null
      ? createViewRecorder({ tokenId, isSignedIn })
      : null
  );

  // Re-arm on unmount so reopening this video counts as another view. The
  // recorder guards a WATCH, not the post — see resetRecordedView.
  useEffect(() => () => viewRecorderRef.current?.reset(), []);

  const isProcessing = transcodingStatus === "pending" || transcodingStatus === "on";
  const isFailed = transcodingStatus === "failed";

  /**
   * The creator's own failed post can be re-run from the file the server
   * kept, so the overlay carries a button rather than an instruction to go
   * and find the original again.
   */
  const [retryState, setRetryState] = useState<"idle" | "sending" | "queued">("idle");
  const handleRetryTranscode = useCallback(async () => {
    if (tokenId == null) return;
    setRetryState("sending");
    try {
      await retryTranscode(tokenId);
      // The post moves to 'pending' on the next feed read; until then this
      // stands in for it, so the button cannot be pressed twice.
      setRetryState("queued");
      toastSuccess(t("player.retryQueued"));
    } catch (e: any) {
      setRetryState("idle");
      // The server's wording: it knows whether the file is missing, the post
      // is already processing, or something transient went wrong.
      toastError(e?.message || t("player.retryFailed"));
    }
  }, [tokenId, t]);
  const canPlay = !isContentGated && !!videoUrl && !isProcessing && !isFailed;

  // True once something has actually asked for media: the autoplay settle
  // timer, or a tap. Visibility alone used to attach the source, which created
  // (and then released) a native player + network prepare for every video card
  // the viewport passed over — most of the cost of scrolling a video feed, and
  // it downloaded video for Data Saver users who autoplay would never serve.
  // The wrapper has already established dwell or an explicit tap. Seed the
  // source so mounting doesn't create an empty player and immediately replace
  // it with a second native instance when playback is requested.
  const [sourceRequested, setSourceRequested] = useState(startOnMount || autoplaySettled);
  // A play intent to submit to the shared native player.
  const pendingPlayRef = useRef(false);

  // Only attach the media source while the card is visible AND intent exists.
  // Off-screen cards keep an empty player, so their ExoPlayer buffers are
  // released — with FlatList's render window this is the difference between 1
  // and 10+ live players and was causing OutOfMemoryError on Android.
  const { player, session: videoSession, ownsPlayer, active: ownsVideo } = usePostVideoPlayer(canPlay ? videoUrl : null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.loop = true;
    p.muted = getCachedMuted();
    p.volume = getVolume();
    p.timeUpdateEventInterval = 0.5;
    // A rate pinned to this creator applies from the first frame; everyone
    // else plays at whatever rate was last used generally.
    p.playbackRate = getPlaybackRateFor(creator);
    // On iOS, assigning the rate also starts AVPlayer. Playback needs an intent.
    p.pause();
    p.bufferOptions = ACTIVE_FEED_BUFFER_OPTIONS;
  });
  const ownsPlayerRef = useRef(ownsPlayer);
  ownsPlayerRef.current = ownsPlayer;

  useEffect(() => {
    playerRef.current = player;
    // New player instance = new source; the previous first frame no longer counts.
    setFirstFrameRendered(false);
    return () => {
      // expo-video's Android time-update clock re-posts itself on the main
      // looper and release() never zeroes it, so every player this card ever
      // created kept a 2 Hz native timer ticking in the background. Stop the
      // clock before the instance is released.
      // The session, rather than a card, releases the native player.
    };
  }, [player]);

  // Crowdsourced sponsor reads and intros. Fetched only while this card has a
  // source attached and the viewer asked for skipping — otherwise a feed of
  // twenty cards would be twenty requests for a feature most leave off.
  const skipSegmentsOn = skipSegmentsPref;
  const { segments: skipSegments } = useVideoSegments(
    tokenId,
    skipSegmentsOn && canPlay && isVisible && sourceRequested,
  );
  // Segments already jumped in this session. Without it, seeking back into one
  // by hand would be undone instantly by the next progress tick.
  const skippedRef = useRef<Set<string>>(new Set());
  const skipSegmentsRef = useRef(skipSegments);
  useEffect(() => {
    skipSegmentsRef.current = skipSegments;
  }, [skipSegments]);
  const skipOnRef = useRef(skipSegmentsOn);
  useEffect(() => {
    skipOnRef.current = skipSegmentsOn;
  }, [skipSegmentsOn]);

  /**
   * Read from refs, not state: the timeUpdate listener is subscribed once per
   * player and would otherwise close over the first render's empty list.
   */
  const maybeSkipSegment = useCallback(
    (time: number) => {
      if (!skipOnRef.current || !playerRef.current) return;
      const segment = segmentAt(skipSegmentsRef.current, time);
      if (!segment || skippedRef.current.has(segment.id)) return;
      skippedRef.current.add(segment.id);
      // Where they were when the jump fired, so Undo lands back at the start
      // of the sponsor read rather than at zero.
      const resumeAt = time;
      playerRef.current.currentTime = segment.end_seconds;
      toastInfo(t(`player.segmentSkipped.${segment.category}`), {
        actionLabel: t("player.undo"),
        onActionPress: () => {
          if (playerRef.current) playerRef.current.currentTime = resumeAt;
        },
        duration: 4000,
      });
    },
    [],
  );

  const [showControls, setShowControls] = useState(false);
  // Real shape of the clip, so a portrait video is shown portrait instead of
  // being cropped into a fixed 16:9 slot. Measured off the thumbnail, which is
  // extracted from the video itself; 16:9 until that resolves.
  const mediaAspect = useMediaAspect(thumbnail, tokenId, postPage ? THIN_MIN_RATIO : undefined);
  const { isMinimal: minimalTheme } = useAppTheme();
  // The cinematic system feed runs media edge to edge exactly like minimal,
  // with its own chrome over the top and bottom bands.
  const bleed = useFeedBleed();
  const isMinimal = minimalTheme || !!bleed;
  // Media that reaches the screen edges keeps its controls off them.
  const edgeToEdge = isMinimal || postPage;
  const windowSize = useWindowDimensions();
  const bareControls = true;

  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirrors showControls for the timeUpdate listener (which is subscribed once
  // per player and must not re-subscribe when the controls toggle). Revealing
  // the controls seeds the scrubber from the ref so it starts at the real
  // position rather than at whatever it held when it was last hidden.
  useEffect(() => {
    showControlsRef.current = showControls;
    if (showControls) setCurrentTime(currentTimeRef.current);
  }, [showControls]);

  const controlsOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fade = Animated.timing(controlsOpacity, {
      toValue: showControls ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [showControls, controlsOpacity]);

  const clearHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideControlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, PLAYER_CONSTANTS.HIDE_CONTROLS_DELAY);
  }, [clearHideTimer]);

  useEffect(() => {
    return () => { clearHideTimer(); };
  }, [clearHideTimer]);

  // Set by a tap, cleared by any stop. While it is true this card outranks
  // the scroll position: autoplay moving to another row does not stop it.
  const userStartedRef = useRef(false);

  const endStarting = useCallback(() => {
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
    isStartingRef.current = false;
    setIsStarting(false);
  }, []);

  /**
   * Open the tap→first-frame window, with a hard stop on it.
   *
   * A source that never becomes playable — dead URL, no network, a transcode
   * that lied about being done — would otherwise leave the card spinning
   * forever. After ten seconds it gives the play button back so the viewer can
   * try again instead of staring at a spinner.
   */
  const beginStarting = useCallback(() => {
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    isStartingRef.current = true;
    setIsStarting(true);
    startTimeoutRef.current = setTimeout(() => {
      startTimeoutRef.current = null;
      isStartingRef.current = false;
      setIsStarting(false);
    }, 10000);
  }, []);

  useEffect(() => () => { if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current); }, []);

  // The window closes on the first frame, not on `isPlaying`: play() resolving
  // before the surface has drawn anything would swap the spinner for a poster
  // frame and then jump to video, which is the flicker this is meant to avoid.
  useEffect(() => {
    if (isStarting && isPlaying && firstFrameRendered) endStarting();
  }, [isStarting, isPlaying, firstFrameRendered, endStarting]);

  const playbackAllowedRef = useRef(false);
  const stopPlayback = useCallback(() => {
    if (!ownsPlayerRef.current() || postMediaIsTransferring(videoSession) || (isPictureInPicturePlayer(playerRef.current) && !visualActivity.isCallBusy())) return;
    playbackAllowedRef.current = false;
    pendingPlayRef.current = false;
    if (autoplayTimerRef.current) { clearTimeout(autoplayTimerRef.current); autoplayTimerRef.current = null; }
    try { playerRef.current?.pause(); } catch {}
    isPlayingRef.current = false;
    userStartedRef.current = false;
    setIsPlaying(false);
    endStarting();
    releaseFeedVideoFocus(stopPlayback);
    releaseAudioFocus(stopPlayback);
  }, [endStarting, videoSession]);

  const startPlayback = useCallback(() => {
    if (!ownsPlayerRef.current()) return;
    if (!playerRef.current || !canPlay || !canStartVideo(playerRef.current)) return;
    try { stopActivePreview(); } catch {}
    requestFeedVideoFocus(stopPlayback);
    if (!shouldStartMuted()) requestAudioFocus(stopPlayback);
    playbackAllowedRef.current = true;
    // The player is a native shared object that expo-video releases when the
    // card scrolls off-screen. A deferred call (autoplay timer) can land after
    // release and throw "Cannot use shared object that was already released".
    try {
      const current = playerRef.current;
      current.volume = getVolume();
      void requestVideoPlayback(current, videoUrl!, () =>
        playerRef.current === current && ownsPlayerRef.current() &&
        playbackAllowedRef.current && canStartVideo(current),
      ).catch((error) => {
        if (playerRef.current === current && ownsPlayerRef.current()) {
          playbackLog.error("Video source retry failed", error, { tokenId });
          stopPlayback();
        }
      });
    } catch (error) {
      playbackLog.error("Video play request failed", error, { tokenId });
      stopPlayback();
      return;
    }
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, [canPlay, videoUrl, tokenId, stopPlayback]);

  /**
   * Submit the intent even while loading. The shared player already has its
   * source; native playback queues until it can start. Waiting for readyToPlay
   * here can leave a paused iOS player loading without ever receiving play().
   */
  const flushPendingPlay = useCallback(() => {
    if (!pendingPlayRef.current) return;
    const p = playerRef.current;
    if (!p) return;
    pendingPlayRef.current = false;
    // Seed mute from the shared cache the same way the old direct path did.
    try {
      const m = shouldStartMuted();
      p.muted = m;
      setIsMuted(m);
    } catch {}
    startPlayback();
  }, [startPlayback]);

  useEffect(() => {
    if (!player) return;
    const subs: Array<{ remove: () => void }> = [];
    try {
      subs.push(
        player.addListener("playingChange", ({ isPlaying: playing }) => {
          if (!ownsPlayerRef.current()) return;
          // Native readiness can arrive after another card claimed playback.
          if (playing && !playbackAllowedRef.current && !isPictureInPicturePlayer(player)) {
            try { player.pause(); } catch {}
            return;
          }
          isPlayingRef.current = playing;
          setIsPlaying(playing);
        })
      );
    } catch {}
    try {
      subs.push(
        player.addListener("statusChange", ({ status, error }) => {
          if (!ownsPlayerRef.current()) return;
          setIsBuffering(status === "loading");
          if (status === "error") {
            playbackLog.error("Video source failed", error?.message || "Unknown error", { tokenId });
            stopPlayback();
          }
          if (status === "readyToPlay") {
            setVideoReady(true);
            if (player.duration > 0) setVideoDuration(player.duration);
            // The deferred source has arrived; honour the intent that
            // attached it.
            flushPendingPlay();
          }
        })
      );
    } catch {}
    try {
      subs.push(
        player.addListener("timeUpdate", ({ currentTime: ct }: any) => {
          if (!ownsPlayerRef.current()) return;
          if (!scrubbingRef.current) {
            currentTimeRef.current = ct ?? 0;
            if (showControlsRef.current) setCurrentTime(ct ?? 0);
          }
          if (ct != null && getSubtitlesEnabled()) setCaptionPosMs(ct * 1000);
          if (ct != null && postPageRef.current && player.duration > 0) {
            patchPostStage(tokenIdRef.current, { progress: Math.min(1, Math.max(0, ct / player.duration)) });
          }
          if (ct != null) maybeSkipSegment(ct);
          if (ct != null && viewRecorderRef.current) {
            viewRecorderRef.current.onProgress(
              ct * 1000,
              player.duration > 0 ? player.duration * 1000 : undefined
            );
          }
        })
      );
    } catch {}
    return () => { subs.forEach((s) => { try { s.remove(); } catch {} }); };
  }, [player, flushPendingPlay, maybeSkipSegment, stopPlayback, tokenId]);

  // The other side of the same race: readiness landing before the intent, or a
  // source that was already attached when the intent was queued.
  useEffect(() => {
    if (videoReady) flushPendingPlay();
  }, [videoReady, sourceRequested, flushPendingPlay]);

  useEffect(() => {
    if (!canPlay || !isVisible) {
      if (!ownsPlayerRef.current() || postMediaIsTransferring(videoSession) || isPictureInPicturePlayer(playerRef.current)) return;
      if (autoplayTimerRef.current) { clearTimeout(autoplayTimerRef.current); autoplayTimerRef.current = null; }
      // Cleared before the source detaches so a readyToPlay event landing in
      // the same frame can't start a card that has already scrolled off.
      pendingPlayRef.current = false;
      if (isPlayingRef.current) stopPlayback();
      setSourceRequested(false);
      setHasStartedAutoplay(false);
      setVideoReady(false);
      setFirstFrameRendered(false);
      setShowControls(false);
      userStartedRef.current = false;
      endStarting();
      clearHideTimer();
      return;
    }
    if (hasStartedAutoplay) return;
    if (videoSession.userPaused || player.playing) return;
    // Visible, but the scroll position gave autoplay to another card. This one
    // stays mounted and tappable; it just does not start itself.
    if (!isAutoplayActive) return;
    // Data Saver: skip autoplay entirely, same as web's VideoCard lite-mode
    // guard. The card stays tappable — this only suppresses *auto* playback.
    if (liteMode) return;
    // Settings → Appearance → Auto-play videos, mirroring web's AutoplayContext
    // gate in VideoCard. Same as Data Saver, this only suppresses *auto* play.
    if (!autoplayEnabled) return;
    // The card survived the settle delay, so submit autoplay now. A tap in
    // this window sets hasStartedAutoplay and cancels the timer.
    autoplayTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current || !canPlay) return;
      autoStartRef.current = true;
      pendingPlayRef.current = true;
      setHasStartedAutoplay(true);
      setShowControls(true);
      startHideTimer();
      // Same treatment for autoplay: the card the feed settled on shows it is
      // loading instead of a play button that is about to vanish on its own.
      beginStarting();
      setSourceRequested(true);
      // The source may already be attached and ready — sourceRequested never
      // went false — in which case nothing else will carry this intent.
      flushPendingPlay();
    }, autoplaySettled ? 0 : AUTOPLAY_DELAY);
    return () => { if (autoplayTimerRef.current) { clearTimeout(autoplayTimerRef.current); autoplayTimerRef.current = null; } };
  }, [canPlay, isVisible, isAutoplayActive, hasStartedAutoplay, liteMode, autoplayEnabled, autoplaySettled, flushPendingPlay, clearHideTimer, startHideTimer, beginStarting, endStarting]);

  // Autoplay is exclusive: when the scroll hands it to another card, a card
  // that started ITSELF gives up the screen and its native player. One the
  // viewer deliberately tapped does not — their choice outranks where the list
  // happens to sit, and that is what lets the second video on screen be played
  // at all.
  //
  // Releasing the source here is what keeps the player count where it was
  // before visibility and autoplay were split: at most the autoplay target
  // plus whatever the viewer started by hand, rather than one per card the
  // scroll has passed. Resetting hasStartedAutoplay is what lets the card
  // autoplay again when the scroll comes back to it.
  useEffect(() => {
    if (!ownsPlayerRef.current() || postMediaIsTransferring(videoSession) || isPictureInPicturePlayer(playerRef.current)) return;
    if (isAutoplayActive || userStartedRef.current) return;
    pendingPlayRef.current = false;
    if (isPlayingRef.current) stopPlayback();
    setSourceRequested(false);
    setHasStartedAutoplay(false);
    setVideoReady(false);
    setFirstFrameRendered(false);
    endStarting();
  }, [isAutoplayActive, stopPlayback, endStarting]);

  useEffect(() => {
    if (!isPlaying) return;
    configureForBackgroundPlayback().catch(() => {});
    return () => { releaseBackgroundPlayback().catch(() => {}); };
  }, [isPlaying]);

  useEffect(() => {
    return () => { if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current); stopPlayback(); };
  }, [stopPlayback]);

  const handleVideoPress = useCallback((preserveAutoplay = false) => {
    if (!canPlay) { onPress(); return; }

    // Already loading from an earlier tap. Swallow the repeat rather than
    // re-queueing the same intent — this is the window where an impatient
    // second tap used to land, and treating it as a fresh press only churned
    // state while the source was still being prepared.
    if (isStartingRef.current && !isPlayingRef.current) return;

    // A tap on a playing clip pauses it and brings the controls up, the same
    // as a tap on the web card. Toggling only the controls here meant the
    // clip could not be stopped by touch at all: the centre pause button sat
    // underneath the full-size tap surface, so every tap on it just blinked
    // the overlay while the video kept going.
    if (isPlayingRef.current) {
      videoSession.userPaused = true;
      stopPlayback();
      setShowControls(true);
      startHideTimer();
      return;
    }

    // A deliberate single tap keeps this card playing even when autoplay moves
    // on. Reversing the pause half of a double tap preserves the earlier
    // autoplay ownership instead of accidentally turning it into background
    // manual playback.
    userStartedRef.current = !preserveAutoplay;
    if (!preserveAutoplay) onUserStarted?.();
    // Before any of the state churn below: the viewer gets a spinner in the
    // same frame as their tap, so the press is acknowledged whether the source
    // still has to be fetched or is merely a few hundred ms from ready.
    // Skipped for a card that is already loaded and has drawn a frame — that
    // resumes in this tick, and a spinner would only flash for one frame on
    // every pause/resume.
    if (!(videoReady && firstFrameRendered)) beginStarting();
    // Submit play in this tick whether the source has buffered yet or not.
    // The spinner covers the wait for the native player's first frame.
    autoStartRef.current = false;
    videoSession.userPaused = false;
    pendingPlayRef.current = true;
    setHasStartedAutoplay(true);
    setSourceRequested(true);
    flushPendingPlay();
    setShowControls(true);
    startHideTimer();
  }, [canPlay, onPress, stopPlayback, flushPendingPlay, clearHideTimer, startHideTimer, onUserStarted, beginStarting, videoReady, firstFrameRendered]);

  // The post page's pinned mini player mirrors this player and can toggle it.
  const videoPressRef = useRef(handleVideoPress);
  videoPressRef.current = handleVideoPress;
  const stageToggle = useCallback(() => videoPressRef.current(), []);
  useEffect(() => {
    if (!postPage || tokenId == null) return;
    patchPostStage(tokenId, { playing: isPlaying, toggle: stageToggle });
  }, [postPage, tokenId, isPlaying, stageToggle]);

  const handleMediaSurfacePress = useCallback((event: GestureResponderEvent) => {
    if (!onTapReaction) {
      handleVideoPress();
      return;
    }

    const now = Date.now();
    const continuesGesture = continuesTapGesture(lastSurfaceTapRef.current, now);
    const { locationX, locationY } = event.nativeEvent;

    if (!continuesGesture || surfaceTapCountRef.current === 0) {
      resetSurfaceTapSequence();
      lastSurfaceTapRef.current = now;
      surfaceTapCountRef.current = 1;
      surfaceWasPlayingRef.current = isPlayingRef.current;
      surfaceWasUserStartedRef.current = userStartedRef.current;
      // Playback is reversible, so keep the primary gesture instant. Tap two
      // toggles it straight back before resolving the reaction.
      handleVideoPress();
      surfaceTapTimerRef.current = setTimeout(() => {
        surfaceTapTimerRef.current = null;
        surfaceTapCountRef.current = 0;
        lastSurfaceTapRef.current = 0;
      }, TAP_GESTURE_WINDOW_MS);
      return;
    }

    lastSurfaceTapRef.current = now;
    if (surfaceTapCountRef.current === 1) {
      surfaceTapCountRef.current = 2;
      if (surfaceTapTimerRef.current) clearTimeout(surfaceTapTimerRef.current);
      handleVideoPress(
        surfaceWasPlayingRef.current && !surfaceWasUserStartedRef.current,
      );
      showTapReactionAnimation("like", locationX, locationY);
      surfaceTapTimerRef.current = setTimeout(() => {
        surfaceTapTimerRef.current = null;
        if (surfaceTapCountRef.current !== 2) return;
        surfaceTapCountRef.current = 0;
        lastSurfaceTapRef.current = 0;
        onTapReaction("like");
      }, TAP_REACTION_RESOLUTION_MS);
      return;
    }

    resetSurfaceTapSequence();
    showTapReactionAnimation("love", locationX, locationY);
    onTapReaction("love");
  }, [handleVideoPress, onTapReaction, resetSurfaceTapSequence, showTapReactionAnimation]);

  const mediaTap = useTapOnlyPress(handleMediaSurfacePress);

  // This card was a poster until a tap asked for it; the tap is honoured here,
  // now that the player exists to honour it.
  const startOnMountRef = useRef(startOnMount);
  useEffect(() => {
    if (startOnMountRef.current && !player.playing) handleVideoPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleMute = useCallback(() => {
    if (!playerRef.current) return;
    const newMuted = !isMuted;
    playerRef.current.muted = newMuted;
    setIsMuted(newMuted);
    setMutedState(newMuted);
    if (!newMuted) requestAudioFocus(stopPlayback);
    else releaseAudioFocus(stopPlayback);
    
    startHideTimer(); // Reset the timer on paused clips too.
  }, [isMuted, stopPlayback, startHideTimer]);

  // Held-and-dragged on the speaker. The device volume moves everything at
  // once, which is no use when one video is loud and the rest of the phone is
  // fine; this is the video's own level, and it persists the same way the
  // playback rate does.
  const volume = useMediaVolume();
  const [volumeAdjusting, setVolumeAdjusting] = useState(false);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
    try { if (playerRef.current) playerRef.current.volume = volume; } catch {}
  }, [volume, player]);

  const applyVolume = useCallback((next: number) => {
    const level = Math.max(0, Math.min(1, next));
    volumeRef.current = level;
    persistVolume(level);
    if (playerRef.current) playerRef.current.volume = level;

    // Dragging to the bottom is how you mute, and dragging off it is how you
    // come back — otherwise the icon and the level disagree.
    const shouldMute = level === 0;
    if (shouldMute !== isMuted) {
      setIsMuted(shouldMute);
      setMutedState(shouldMute);
      if (playerRef.current) playerRef.current.muted = shouldMute;
      if (shouldMute) releaseAudioFocus(stopPlayback);
      else requestAudioFocus(stopPlayback);
    }
  }, [isMuted, stopPlayback]);

  const volumePanResponder = useMemo(
    () =>
      PanResponder.create(
        feedVolumeResponder({
          onHoldStart: () => {
            clearHideTimer();
            setVolumeAdjusting(true);
            // Muted, the slider is at the bottom whatever the stored level is.
            return isMuted ? 0 : volumeRef.current;
          },
          onVolume: applyVolume,
          onTap: handleToggleMute,
          onEnd: () => {
            setVolumeAdjusting(false);
            startHideTimer();
          },
        }),
      ),
    [applyVolume, handleToggleMute, isMuted, clearHideTimer, startHideTimer],
  );

  const [isLooping, setIsLooping] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(() => getPlaybackRateFor(creator));
  useLayoutEffect(() => {
    if (!ownsVideo) return;
    const playing = player.playing;
    playerRef.current = player;
    playbackAllowedRef.current = playing;
    isPlayingRef.current = playing;
    setIsPlaying(playing);
    setIsMuted(player.muted);
    setPlaybackRate(player.playbackRate);
    setIsLooping(player.loop);
    currentTimeRef.current = player.currentTime;
    setCurrentTime(player.currentTime);
    setVideoDuration(player.duration);
    setVideoReady(player.status === 'readyToPlay');
    if (playing || videoSession.userPaused || player.currentTime > 0) {
      setSourceRequested(true);
      setHasStartedAutoplay(true);
    }
    if (playing) {
      requestFeedVideoFocus(stopPlayback);
      if (!player.muted) requestAudioFocus(stopPlayback);
    }
  }, [ownsVideo, player, videoSession, stopPlayback]);

  const handleToggleLoop = useCallback(() => {
    if (!playerRef.current) return;
    const nextLoop = !isLooping;
    playerRef.current.loop = nextLoop;
    setIsLooping(nextLoop);
    startHideTimer();
  }, [isLooping, startHideTimer]);

  const handleToggleSpeed = useCallback(() => {
    if (!playerRef.current) return;
    const currentSpeed = getPlaybackRateFor(creator);
    let nextSpeed = 1.0;
    if (currentSpeed === 1.0) nextSpeed = 1.5;
    else if (currentSpeed === 1.5) nextSpeed = 2.0;
    else nextSpeed = 1.0;
    playerRef.current.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
    // Remembered against the creator, so this channel opens at this rate next
    // time while the rest of the feed is unaffected.
    persistPlaybackRate(nextSpeed, creator);
    startHideTimer();
  }, [startHideTimer, creator]);

  const handleFullscreen = useCallback(() => {
    // From the ref, not state: state is only live while the controls are up.
    const time = currentTimeRef.current;
    const muted = isMuted;
    preparePostMediaNavigation(videoUrl);
    navigation.navigate(ScreenNames.FullscreenVideo as never, {
      videoUrl, startTime: time, isMuted: muted, thumbnail,
      tokenId, isSignedIn,
    } as never);
  }, [isMuted, videoUrl, thumbnail, tokenId, isSignedIn, stopPlayback, navigation]);

  // Video posts: the player's buttons are bare icons with a soft shadow,
  // mute in the top corner, with subtitles, speed, loop and picture in picture
  // beside fullscreen on the bottom play/countdown row.
  // The post page uses the same phone controls; tablets keep the glass row.
  // Level with the author chip over the picture; on the first post (its chip
  // at the bottom) just under the capsule instead.
  const bareTop = bleed?.controlsTop ?? (bleed ? (bleed.bottomInset ? bleed.topInset : BARE_ROW_TOP_BESIDE_CHIP) : 6);
  // Tell a card with chrome along the bottom when the player bar is up, so
  // that chrome lifts above it only then.
  const setBarUp = bleed?.setBarUp;
  const barUp = !hideControls && showControls;
  useEffect(() => {
    setBarUp?.(barUp);
  }, [setBarUp, barUp]);
  useEffect(() => {
    if (!setBarUp) return;
    return () => setBarUp(false);
  }, [setBarUp]);
  // That chrome takes the bottom-right corner the duration badge sat in.
  const chromeAtBottom = !!bleed?.bottomInset;
  const [captionControls, setCaptionControls] = useState<CaptionControls | null>(null);


  const handleSeek = useCallback(
    (ratio: number) => {
      if (!playerRef.current || videoDuration <= 0) return;
      const time = Math.max(0, Math.min(1, ratio)) * videoDuration;
      playerRef.current.currentTime = time;
      currentTimeRef.current = time;
      setCurrentTime(time);
    },
    [videoDuration]
  );

  const handleSeekCommit = useCallback(
    (ratio: number) => {
      handleSeek(ratio);
      scrubbingRef.current = false;
      startHideTimer();
    },
    [handleSeek, startHideTimer],
  );

  const handleScrubStart = useCallback(() => {
    scrubbingRef.current = true;
    clearHideTimer();
  }, [clearHideTimer]);

  const handleScrub = useCallback((ratio: number) => {
    // Preview locally; seeking the decoder on every move makes buffered
    // position updates fight the finger and repeatedly restarts loading.
    setCurrentTime(ratio * videoDuration);
  }, [videoDuration]);

  const handleScrubCancel = useCallback(() => {
    scrubbingRef.current = false;
    setCurrentTime(currentTimeRef.current);
    startHideTimer();
  }, [startHideTimer]);

  // An RNGH gesture, not a PanResponder: the Home pager's page turn is an RNGH
  // pan and only ever yields to another RNGH handler, so a PanResponder scrub
  // dragged the page sideways instead of seeking. See useScrubGesture.
  const { onLayout: onSeekTrackLayout, gesture: seekGesture, touchGuard: seekTouchGuard } = useScrubGesture({
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleSeekCommit,
    onCancel: handleScrubCancel,
    enabled: videoDuration > 0,
    immediate: true,
  });

  const handleGatedOverlayPress = useCallback(() => {
    if (isPPVLocked) onPPVPress?.();
    else if (isHoldingsLocked) onLockPress?.();
    else if (isBountyLocked) onBountyPress?.();
  }, [isPPVLocked, isHoldingsLocked, isBountyLocked, onPPVPress, onLockPress, onBountyPress]);

  const progressPercent = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  const renderGatedOverlay = () => {
    const icons: { name: string; size: number }[] = [];
    const lines: string[] = [];

    if (isPPVLocked) {
      icons.push({ name: "Ticket", size: 24 });
      lines.push(`Unlock for ${formatCompactNumber(ppvAmount)} ${ppvCurrency}`);
    }
    if (isHoldingsLocked) {
      icons.push({ name: "Lock", size: 24 });
      lines.push(`Must hold ${formatCompactNumber(lockAmount)} ${lockCurrency}`);
    }
    if (isBountyLocked) {
      icons.push({ name: "Gift", size: 24 });
      lines.push(
        bountyAmount > 0
          ? `${formatCompactNumber(bountyAmount)} ${bountyCurrency} bounty`
          : "Earn rewards by engaging",
      );
    }

    if (icons.length === 0) return null;

    return (
      <Pressable onPress={handleGatedOverlayPress} style={[styles.gatedOverlay, BARE_LAYER]}>
        <MediaShade color={GATED_SHADE} />
        <View style={icons.length > 1 ? styles.gatedIconRow : undefined}>
          {icons.map((ic, i) => (
            <View key={i} style={icons.length > 1 ? styles.gatedIconBox : styles.gatedIconBoxLarge}>
              <View style={styles.gatedIconOverlay} />
              <View>
                <Icon name={ic.name as any} size={icons.length > 1 ? 24 : 28} color="#fff" />
              </View>
            </View>
          ))}
        </View>
        {lines.map((line, i) => (
          <Text
            key={i}
            style={i === 0 ? [styles.gatedTitle, icons.length === 1 && { marginTop: 12 }] : styles.gatedSubtitle}
          >
            {line}
          </Text>
        ))}
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          aspectRatio: bleed ? bleedBoxAspect(windowSize, mediaAspect) : mediaAspect,
          // Fills the card when the clip is wide enough; a portrait clip caps
          // at the max media height and shrinks its own width, hugged to the
          // left in the feed and centred on the post page.
          width: bleed ? windowSize.width : mediaBoxWidth(windowSize, isMinimal, mediaAspect, postPage),
          maxWidth: "100%",
          alignSelf: isMinimal || postPage ? "center" : "flex-start",
        },
        (isMinimal || postPage) && MINIMAL_MEDIA,
        (postPage || bleed) && POST_PAGE_MEDIA,
      ]}
    >
      {thumbnail ? (
        // SmartImage (expo-image), not RN Image: RN's has no disk cache and no
        // recycling key, so every time FlatList reused this cell the full-width
        // thumbnail was re-fetched and re-decoded on the way past — the biggest
        // single source of dropped frames while flinging a video feed.
        // `recyclingKey` tells expo-image the view is being reused for a
        // different source, so it drops the old bitmap instead of briefly
        // showing the previous card's thumbnail.
        <SmartImage
          source={{ uri: thumbnail }}
          style={styles.thumbnail}
          contentFit={bleed ? "cover" : "contain"}
          recyclingKey={thumbnail}
          transition={0}
        />
      ) : (
        <View style={[styles.thumbnail, styles.noThumb]}>
          <Icon name="VideoOff" size={40} color="#666" />
        </View>
      )}

      {canPlay && isVisible && sourceRequested && ownsVideo && player && (
        <PersistentVideoView
          ref={videoViewRef}
          player={player}
          focusable={false}
          contentFit={bleed ? "cover" : "contain"}
          nativeControls={false}
          allowsPictureInPicture
          onPictureInPictureStart={() => onPictureInPictureChange?.(true)}
          onPictureInPictureStop={() => onPictureInPictureChange?.(false)}
          startsPictureInPictureAutomatically={isPlaying}
          // Android defaults to a SurfaceView, which renders in its own window
          // layer and can punch through / appear on top of other feed cards
          // while scrolling and recycling. A TextureView renders inside the
          // normal view hierarchy, so it respects z-order and clipping.
          surfaceType="textureView"
          onFirstFrameRender={() => setFirstFrameRendered(true)}
          style={[styles.thumbnail, { opacity: firstFrameRendered && (hideControls
            ? (hasStartedAutoplay && videoReady)
            : (isPlaying || hasStartedAutoplay)
          ) ? 1 : 0 }]}
        />
      )}

      {isProcessing && (
        <View style={styles.statusOverlay}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.statusText}>{t("player.processing")}</Text>
        </View>
      )}

      {isFailed && (
        <View style={styles.statusOverlay}>
          {retryState === "queued" ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.statusText}>{t("player.retryQueued")}</Text>
            </>
          ) : (
            <>
              <Icon name="TriangleAlert" size={28} color="#fff" />
              <Text style={styles.statusText}>{t("player.processingFailed")}</Text>
              {isOwner && (
                <>
                  <Text style={styles.statusHintText}>{t("player.retryHint")}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("player.retry")}
                    onPress={handleRetryTranscode}
                    disabled={retryState === "sending"}
                    style={styles.retryButton}
                  >
                    {retryState === "sending" ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Icon name="RotateCcw" size={14} color="#fff" />
                    )}
                    <Text style={styles.retryButtonText}>
                      {retryState === "sending" ? t("player.retrying") : t("player.retry")}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      )}

      {isContentGated && renderGatedOverlay()}

      {isBounty && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("bounty.detailsLabel")}
          onPress={onBountyPress}
          activeOpacity={0.75}
          style={[styles.bountyPill, edgeToEdge && { left: MINIMAL_EDGE }, bleed && { top: bleed.topInset }]}
        >
          <Image
            source={require("../../assets/web-icons/dehub-coin.png")}
            style={styles.bountyPillCoin}
            resizeMode="contain"
          />
          <Text style={styles.bountyPillText}>
            {formatCompactNumber(bountyAmount)} {bountyCurrency}
          </Text>
        </TouchableOpacity>
      )}

      {!hideControls && !isContentGated && !isProcessing && !isFailed && (
        <>
          {/* The video tap target is a sibling behind the controls. Nesting the
              timeline inside it let a seek bubble into play/pause, and made the
              whole media box too eager to claim vertical feed flicks. */}
          <Pressable {...mediaTap} style={StyleSheet.absoluteFill} />
          {(
            <Animated.View style={[styles.controlsContainer, { opacity: controlsOpacity }]} pointerEvents={showControls ? "box-none" : "none"}>
            {/* The pause button is the size of its glyph and lives above the
                tap surface. It used to be a full-size layer drawn underneath
                that surface, so it could be seen but never pressed. */}
            {!bareControls && isPlaying && !isContentGated && !isProcessing && !isFailed && (
              <Pressable
                onPress={() => {
                  videoSession.userPaused = true;
                  stopPlayback();
                  setShowControls(true);
                  startHideTimer();
                }}
                style={styles.centreButton}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t("audioPost.pause")}
              >
                <View style={styles.glassPlayButton}>
                  <View style={styles.glassOverlay} />
                  <Icon name="Pause" size={24} color="#fff" />
                </View>
              </Pressable>
            )}
            {bareControls ? (
              <View pointerEvents="box-none" style={[styles.bareRow, { top: bareTop }]}>
                {/* Tap to mute, drag up or down to set the volume. */}
                <View>
                  <View
                    style={styles.bareButton}
                    {...volumePanResponder.panHandlers}
                    accessibilityRole="button"
                    accessibilityLabel={t(isMuted ? "common.unmute" : "common.mute")}
                  >
                    <BareIcon name={isMuted ? "VolumeX" : "Volume2"} />
                  </View>
                  {volumeAdjusting && (
                    <View style={[styles.volumeTrack, styles.bareVolumeTrack]} pointerEvents="none">
                      <View style={styles.glassOverlay} />
                      <View style={styles.volumeTrackInner}>
                        <View
                          style={[
                            styles.volumeFill,
                            { height: `${Math.round((isMuted ? 0 : volume) * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                </View>

              </View>
            ) : <View style={[styles.topControls, edgeToEdge && { paddingHorizontal: MINIMAL_EDGE }, bleed && { paddingTop: bleed.topInset }]}>
              <Pressable onPress={handleToggleSpeed} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} accessibilityRole="button" accessibilityLabel={t("player.playbackSpeed")} style={styles.bareSpeed}>
                <MediaControlText style={styles.bareSpeedText}>{playbackRate}x</MediaControlText>
              </Pressable>
              
              <Pressable onPress={handleToggleLoop} style={styles.bareButton}>
                <BareIcon name="Repeat" />
              </Pressable>

              <View>
                <View style={styles.bareButton} {...volumePanResponder.panHandlers}>
                  <BareIcon name={isMuted ? "VolumeX" : "Volume2"} />
                </View>
                {volumeAdjusting && (
                  <View style={styles.volumeTrack} pointerEvents="none">
                    <View style={styles.glassOverlay} />
                    <View style={styles.volumeTrackInner}>
                      <View
                        style={[
                          styles.volumeFill,
                          { height: `${Math.round((isMuted ? 0 : volume) * 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                )}
              </View>
              
              <PictureInPictureButton videoRef={videoViewRef} />
              <Pressable onPress={handleFullscreen} style={styles.bareButton}>
                <BareIcon name="Maximize" />
              </Pressable>
            </View>}

            {bareControls ? (
              // Video posts: play/pause, the time and fullscreen as bare
              // icons, over a thin line along the very bottom of the picture.
              <View pointerEvents="box-none" style={styles.bareBottom}>
                <View pointerEvents="box-none" style={[styles.bareBottomRow, edgeToEdge && { paddingHorizontal: MINIMAL_EDGE - 8 }]}>
                  <Pressable
                    onPress={() => handleVideoPress()}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t(isPlaying ? "audioPost.pause" : "audioPost.play")}
                    style={styles.bareButton}
                  >
                    <BareIcon name={isPlaying ? "Pause" : "Play"} />
                  </Pressable>
                  <MediaControlText style={[styles.timeText, styles.bareTime]}>{formatTime(Math.max(0, Math.ceil(videoDuration - currentTime)))}</MediaControlText>
                  <View style={{ flex: 1 }} />
                {captionControls && (
                  <Pressable
                    onPress={() => { captionControls.toggle(); startHideTimer(); }}
                    onLongPress={captionControls.openLanguages}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t("subtitles.title")}
                    accessibilityState={{ selected: captionControls.enabled }}
                    style={styles.bareButton}
                  >
                    {captionControls.loading ? (
                      <Spinner size={16} />
                    ) : (
                      <BareIcon name="Captions" />
                    )}
                  </Pressable>
                )}
                <Pressable
                  onPress={handleToggleSpeed}
                  hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("player.playbackSpeed")}
                  style={styles.bareSpeed}
                >
                  <MediaControlText style={styles.bareSpeedText}>{playbackRate.toFixed(2)}x</MediaControlText>
                </Pressable>
                <Pressable
                  onPress={handleToggleLoop}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={t("player.toggleLoop")}
                  accessibilityState={{ selected: isLooping }}
                  style={styles.bareButton}
                >
                  <BareIcon name="Repeat" />
                </Pressable>
                {pipSupported() && (
                  <Pressable
                    onPress={() => {
                      videoViewRef.current?.startPictureInPicture().catch(() => toastInfo(t("player.pipUnavailable")));
                    }}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t("player.pictureInPicture")}
                    style={styles.bareButton}
                  >
                    <BareIcon name="PictureInPicture2" />
                  </Pressable>
                )}
                  <Pressable
                    onPress={handleFullscreen}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.fullscreen")}
                    style={styles.bareButton}
                  >
                    <BareIcon name="Maximize" />
                  </Pressable>
                </View>
                {/* Android's seek target lives outside the fading controls. */}
                {Platform.OS === "android" ? (
                  <View pointerEvents="none" style={styles.bareScrubSpacer} />
                ) : (
                <GestureDetector gesture={seekGesture}>
                  <View
                    style={styles.bareScrubTouch}
                    onLayout={onSeekTrackLayout}
                    {...seekTouchGuard}
                    accessibilityRole="adjustable"
                    accessibilityLabel={t("player.progress")}
                  >
                    <View style={styles.bareScrubLine}>
                      <View style={[styles.bareScrubPlayed, { width: `${progressPercent}%` }]} />
                    </View>
                  </View>
                </GestureDetector>
                )}
              </View>
            ) : (
            <View style={[styles.bottomControls, edgeToEdge && { paddingHorizontal: MINIMAL_EDGE }, bleed && { paddingBottom: 8 }]}>
              <View style={styles.progressRow}>
                <View>
                  <MediaControlText style={[styles.timeText, styles.bareTime]}>{formatTime(currentTime)}</MediaControlText>
                </View>
                <GestureDetector gesture={seekGesture}>
                  <View
                    style={styles.progressTrack}
                    onLayout={onSeekTrackLayout}
                    {...seekTouchGuard}
                    accessibilityRole="adjustable"
                    accessibilityLabel={t("player.progress")}
                  >
                    <View style={styles.progressTrackInner}>
                      <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                      <View style={[styles.progressThumb, { left: `${progressPercent}%`, marginLeft: -6 }]} />
                    </View>
                  </View>
                </GestureDetector>

              </View>
            </View>
            )}
          </Animated.View>
          )}
          {Platform.OS === "android" && bareControls && (
            <GestureDetector gesture={seekGesture}>
              <View
                style={styles.androidScrubTouch}
                onLayout={onSeekTrackLayout}
                {...seekTouchGuard}
                accessibilityRole="adjustable"
                accessibilityLabel={t("player.progress")}
              >
                <Animated.View pointerEvents="none" style={{ opacity: controlsOpacity }}>
                  <View style={styles.bareScrubLine}>
                    <View style={[styles.bareScrubPlayed, { width: `${progressPercent}%` }]} />
                  </View>
                </Animated.View>
              </View>
            </GestureDetector>
          )}
        </>
      )}

      {/* Subtitles with a language picker. Outside the controls block so the
          captions stay on screen when the chrome hides. */}
      {!hideControls && tokenId != null && !isContentGated && (
        <CaptionOverlay
          tokenId={tokenId}
          positionMs={captionPosMs}
          controlsVisible={showControls}
          bottomOffset={(showControls ? 56 : 16) + (bleed?.bottomInset ?? 0)}
          player={player}
          isPlaying={isPlaying}
          hideButton={bareControls}
          onControls={bareControls ? setCaptionControls : undefined}
        />
      )}

      {tapAnimReaction && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: tapAnimPos.x,
            top: tapAnimPos.y,
            width: 64,
            height: 64,
            zIndex: 100,
          }}
        >
          <Animated.View
            style={{
              position: "absolute",
              width: 64,
              height: 64,
              alignItems: "center",
              justifyContent: "center",
              opacity: tapAnimProgress.interpolate({
                inputRange: [0, 0.18, 0.68, 1],
                outputRange: [1, 1, 0.96, 0],
              }),
              transform: [
                {
                  translateY: tapAnimProgress.interpolate({
                    inputRange: [0, 0.2, 0.68, 1],
                    outputRange: [6, 0, -2, -12],
                  }),
                },
                {
                  scale: tapAnimProgress.interpolate({
                    inputRange: [0, 0.2, 0.42, 1],
                    outputRange: [0.76, 1.08, 1, 0.92],
                  }),
                },
              ],
            }}
          >
            <Icon
              name={tapAnimReaction === "love" ? "Heart" : "ThumbsUp"}
              size={tapAnimReaction === "love" ? 72 : 64}
              color={tapAnimReaction === "love" ? "#F43F5E" : "#0EA5E9"}
              fill={tapAnimReaction === "love" ? "#F43F5E" : "#0EA5E9"}
            />
          </Animated.View>

          {tapAnimReaction === "love" && LOVE_BLOOM.map((spark, index) => (
            <Animated.View
              key={index}
              style={{
                position: "absolute",
                left: 32 - spark.size / 2,
                top: 32 - spark.size / 2,
                opacity: tapAnimProgress.interpolate({
                  inputRange: [0, 0.16, 0.72, 1],
                  outputRange: [0, 0.9, 0.72, 0],
                }),
                transform: [
                  {
                    translateX: tapAnimProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, spark.x],
                    }),
                  },
                  {
                    translateY: tapAnimProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, spark.y],
                    }),
                  },
                  {
                    scale: tapAnimProgress.interpolate({
                      inputRange: [0, 0.24, 1],
                      outputRange: [0.55, 1, 0.7],
                    }),
                  },
                ],
              }}
            >
              <Icon name="Heart" size={spark.size} color="#FB7185" fill="#FB7185" />
            </Animated.View>
          ))}
        </View>
      )}

      {isBuffering && isPlaying && !isStarting && (
        <View style={styles.bufferingOverlay}>
          <View style={styles.spinnerContainer}>
            <Spinner size={32} />
          </View>
        </View>
      )}

      {/* The length before playback, on the post page only: in the feed the
          scrubber shows it once the video plays. */}
      {postPage && !bareControls && !hideControls && !isContentGated && duration && !isPlaying && (
        <View style={[styles.durationBadge, edgeToEdge && { right: MINIMAL_EDGE }]}>
          <Text style={styles.durationText}>{duration}</Text>
        </View>
      )}

      {!hideControls && !chromeAtBottom && isContentGated && duration && (
        <View style={[styles.durationBadge, edgeToEdge && { right: MINIMAL_EDGE }]}>
          <Text style={styles.durationText}>{duration}</Text>
        </View>
      )}
    </View>
  );
};

// Tints for the layers that cover the whole picture.
const PLAY_SHADE = "rgba(0,0,0,0.2)";
const GATED_SHADE = "rgba(0,0,0,0.3)";

// A layer that covers the whole picture draws its tint from a plain view under
// it, not as the pressable's own fill: the theme pass that styles neutral
// pressables as buttons (libs/jsx/controls.js) would otherwise give it the
// theme's control frame, a rounded border inside the picture in every theme.
const BARE_LAYER = { backgroundColor: "transparent" } as const;

/** Phones, told from tablets by the shorter side (web's 768px breakpoint). */
/** The bare row's top beside the author chip: 32pt buttons centred on the
 *  38pt chip that starts 12pt down. */
const BARE_ROW_TOP_BESIDE_CHIP = 15;

/**
 * A white glyph straight on the picture. The shadow is a dark, heavier copy
 * of the glyph underneath, which reads on bright frames on every platform
 * (Android draws no shadow for a view without a fill); iOS adds a soft one.
 * Nothing here has a fill, so the theme's control paint leaves it alone.
 */
const MediaShade: React.FC<{ color: string }> = ({ color }) => (
  <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
);

// Player chips sit on top of the video: opaque, or the frame behind them
// reads through the icons. expo-blur does not blur on Android at all.
const CONTROL_FILL = "#1D1F21";

// Minimal theme: edge to edge, square, on the page's own black.
const MINIMAL_MEDIA = { borderRadius: 0, backgroundColor: "#000" } as const;
// Post page: the media is the top of the screen, so no gap above it.
const POST_PAGE_MEDIA = { marginTop: 0 } as const;
// Edge-to-edge media puts its controls on the screen edge, where Android's
// back gesture lives. Web pushes them in the same way (index.css, minimal).
const MINIMAL_EDGE = 16;

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#27272a",
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 8,
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  noThumb: {
    backgroundColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
  },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    gap: 8,
    paddingHorizontal: 24,
  },
  statusText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  statusHintText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PLAY_SHADE,
  },
  centreButton: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -28,
    marginLeft: -28,
    width: 56,
    height: 56,
  },
  glassPlayButton: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  glassButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  bareRow: {
    position: "absolute",
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bareButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  bareSpeed: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  bareSpeedText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  bareTime: {
    minWidth: 36,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  bareBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  bareBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
    marginBottom: 0,
  },
  bareScrubTouch: {
    height: 32,
    justifyContent: "flex-end",
  },
  bareScrubSpacer: { height: 48 },
  androidScrubTouch: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    justifyContent: "flex-end",
  },
  bareScrubLine: {
    height: 3,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.65)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  bareScrubPlayed: {
    height: "100%",
    backgroundColor: "#FFFFFF",
  },
  bareVolumeTrack: { left: 0 },
  volumeTrack: {
    position: "absolute",
    top: 36,
    left: 0,
    width: 32,
    height: 104,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  volumeTrackInner: {
    width: 4,
    height: 84,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  volumeFill: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CONTROL_FILL,
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topControls: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    padding: 8,
  },
  bottomControls: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    minWidth: 28,
  },
  progressTrack: {
    flex: 1,
    height: Platform.OS === "android" ? 48 : 32,
    justifyContent: "center",
  },
  progressTrackInner: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    overflow: "visible",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  progressThumb: {
    position: "absolute",
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  spinnerContainer: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 10,
  },
  durationText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  gatedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GATED_SHADE,
    alignItems: "center",
    justifyContent: "center",
  },
  gatedIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  gatedIconBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  gatedIconBoxLarge: {
    width: 64,
    height: 64,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  gatedIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CONTROL_FILL,
  },
  gatedTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  gatedSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  bountyPill: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  bountyPillCoin: {
    width: 16,
    height: 16,
  },
  bountyPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});

const FeedVideoPlayerActive = memo(FeedVideoPlayerComponent);

/**
 * What an off-screen card renders instead of the player.
 *
 * expo-video builds an ExoPlayer inside `useVideoPlayer` whether or not it has
 * a source — `useVideoPlayer(cond ? url : null)` saves the buffers, not the
 * player. A feed keeps a render window of several rows, so every row in it
 * held a player even with autoplay off, and on a mid-range Android that heap
 * is what ran out. Rows the feed has not marked visible now render this: the
 * same box, the same thumbnail, the same duration badge, and no player at all.
 * The full component mounts the moment the row scrolls into view.
 */
const FeedVideoPoster: React.FC<Pick<FeedVideoPlayerProps, "tokenId" | "thumbnail" | "duration" | "hideControls" | "onPress" | "postPage">> = memo(
  ({ tokenId, thumbnail, duration, hideControls, onPress, postPage = false }) => {
    const mediaAspect = useMediaAspect(thumbnail, tokenId, postPage ? THIN_MIN_RATIO : undefined);
    const { isMinimal: minimalTheme } = useAppTheme();
    const bleed = useFeedBleed();
    const isMinimal = minimalTheme || !!bleed;
    const edgeToEdge = isMinimal || postPage;
    const windowSize = useWindowDimensions();
    const bareControls = true;
    const mediaTap = useTapOnlyPress(() => onPress());
    return (
      <View
        style={[
          styles.container,
          {
            aspectRatio: bleed ? bleedBoxAspect(windowSize, mediaAspect) : mediaAspect,
            width: bleed ? windowSize.width : mediaBoxWidth(windowSize, isMinimal, mediaAspect, postPage),
            maxWidth: "100%",
            alignSelf: isMinimal || postPage ? "center" : "flex-start",
          },
          (isMinimal || postPage) && MINIMAL_MEDIA,
          (postPage || bleed) && POST_PAGE_MEDIA,
        ]}
      >
        {thumbnail ? (
          <SmartImage
            source={{ uri: thumbnail }}
            style={styles.thumbnail}
            contentFit={bleed ? "cover" : "contain"}
            recyclingKey={thumbnail}
            transition={0}
          />
        ) : (
          <View style={[styles.thumbnail, styles.noThumb]}>
            <Icon name="VideoOff" size={40} color="#666" />
          </View>
        )}
        {!hideControls && (
          <Pressable {...mediaTap} style={[styles.playOverlay, BARE_LAYER]}>
            {bareControls ? (
              <View style={styles.bareBottom} pointerEvents="none">
                <View style={[styles.bareBottomRow, edgeToEdge && { paddingHorizontal: MINIMAL_EDGE - 8 }]}>
                  <View style={styles.bareButton}>
                    <BareIcon name="Play" />
                  </View>
                </View>
              </View>
            ) : (
              <>
                <MediaShade color={PLAY_SHADE} />
                <View style={styles.glassPlayButton}>
                  <View style={styles.glassOverlay} />
                  <View style={{ marginLeft: 2 }}>
                    <Icon name="Play" size={24} color="#fff" />
                  </View>
                </View>
              </>
            )}
          </Pressable>
        )}
        {postPage && !hideControls && duration ? (
          <View style={[styles.durationBadge, edgeToEdge && { right: MINIMAL_EDGE }]}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        ) : null}
      </View>
    );
  },
);
FeedVideoPoster.displayName = "FeedVideoPoster";

/**
 * One player at a time.
 *
 * The real component is mounted for exactly two cards: the one the scroll has
 * handed autoplay to (and only while autoplay is on and Data Saver is off),
 * and any card the person has tapped play on. Every other card — including
 * the visible ones — is the poster, which holds no ExoPlayer at all. Cards
 * that need the full component for their chrome (gated, processing, failed)
 * still get it, since that chrome lives there.
 */
const FeedVideoPlayer: React.FC<FeedVideoPlayerProps> = (props) => {
  const playbackAllowed = useFeedPlaybackAllowed();
  const callInProgress = useCallInProgress();
  const { autoplay: autoplayEnabled } = useAppPrefs();
  const { liteMode } = useDataSaver();
  // Which post this wrapper is showing. A tap and picture-in-picture belong to
  // one post: handed another, the wrapper forgets both in the same render, or
  // the next post would mount a player and start by itself.
  const postKey = String(props.tokenId ?? props.thumbnail ?? "");
  const [wanted, setWanted] = useCellState(false, [postKey]);
  const [inPictureInPicture, setInPictureInPicture] = useCellState(false, [postKey]);

  const { isVisible, isAutoplayActive = true, isContentGated, transcodingStatus, videoUrl, onPress } = props;
  const needsChrome =
    isContentGated || transcodingStatus === "pending" || transcodingStatus === "on" || transcodingStatus === "failed";
  const visible = (isVisible && playbackAllowed) || (inPictureInPicture && !callInProgress);
  const autoplayHere = visible && isAutoplayActive && autoplayEnabled && !liteMode;
  // Waiting inside the active component is too late: useVideoPlayer(null)
  // still allocates an ExoPlayer. Keep passing cards as posters for the whole
  // dwell window; taps and picture-in-picture bypass that wait.
  const autoplaySettled = useSettledAutoplay(autoplayHere, videoUrl, AUTOPLAY_DELAY);
  const retained = isVisible && hasPostVideoSession(videoUrl);
  const mountPlayer = (visible || retained) && (retained || inPictureInPicture || wanted || autoplaySettled || needsChrome);

  // Off screen, the tap is forgotten: coming back autoplays or shows the
  // poster, the same as any other card.
  useEffect(() => {
    if (!isVisible) setWanted(false);
  }, [isVisible, setWanted]);

  const onPosterPress = useCallback(() => {
    if (!videoUrl) {
      onPress();
      return;
    }
    setWanted(true);
  }, [videoUrl, onPress, setWanted]);

  const markWanted = useCallback(() => setWanted(true), [setWanted]);

  // Keyed on the post, so the player, its view recorder, speed and progress
  // are never carried onto another one. It is only mounted for about two cards
  // at a time, so a fresh one per post costs nothing while scrolling.
  return mountPlayer ? (
    <FeedVideoPlayerActive
      key={postKey}
      {...props}
      isVisible={visible}
      isAutoplayActive={isAutoplayActive || inPictureInPicture}
      onPictureInPictureChange={setInPictureInPicture}
      startOnMount={wanted}
      autoplaySettled={autoplaySettled}
      onUserStarted={markWanted}
    />
  ) : (
    <FeedVideoPoster
      tokenId={props.tokenId}
      thumbnail={props.thumbnail}
      duration={props.duration}
      hideControls={props.hideControls}
      postPage={props.postPage}
      onPress={onPosterPress}
    />
  );
};

export default memo(FeedVideoPlayer);
