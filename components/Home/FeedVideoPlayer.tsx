import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  GestureResponderEvent,
  Animated,
  Easing,
} from "react-native";
import { VideoView, useVideoPlayer, VideoPlayer } from "expo-video";
import PictureInPictureButton from "../common/PictureInPictureButton";
import { configureForBackgroundPlayback, releaseBackgroundPlayback } from "../../libs/audioSession";
import { FEED_BUFFER_OPTIONS } from "../../libs/videoBuffering";
import { getPlaybackRateFor, setPlaybackRate as persistPlaybackRate } from "../../libs/video-preferences";
import SmartImage from "../common/SmartImage";
import Spinner from "../common/Spinner";
import { BlurView } from "expo-blur";
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
import { useAppPrefs } from "../../hooks/useAppPrefs";
import { useVideoSegments, segmentAt } from "../../hooks/useVideoSegments";
import { useMediaAspect } from "../../hooks/useMediaAspect";
import { SEGMENT_LABELS } from "../../services/video-segments.service";
import { toastInfo } from "../../libs";
import { movedBeyondMediaTapSlop } from "../../libs/media-gesture";
import {
  continuesTapGesture,
  TAP_GESTURE_WINDOW_MS,
  TAP_LIKE_ANIMATION_MS,
  TAP_LOVE_ANIMATION_MS,
  TAP_REACTION_RESOLUTION_MS,
} from "../../libs/tap-gesture";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/** Card content width — mirrors FeedCard, which lays this player out. */
const CARD_WIDTH = SCREEN_WIDTH - 40;

/**
 * Tallest the media may get. A portrait clip stops growing here and narrows
 * its own width instead, so a vertical video takes about a screen rather than
 * scrolling for three.
 */
const MAX_MEDIA_HEIGHT = Math.round(Math.min(600, SCREEN_HEIGHT * 0.6));

interface FeedVideoPlayerProps {
  thumbnail: string;
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
  onUserStarted,
  onPictureInPictureChange,
}) => {
  const navigation = useNavigation<any>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(() => getCachedMuted());
  const [currentTime, setCurrentTime] = useState(0);
  // `currentTime` only reaches the screen through the scrubber, which exists
  // only while `showControls` is true. With `timeUpdateEventInterval = 0.5` the
  // old unconditional setState re-rendered the autoplaying card twice a second
  // for nothing — right through every fling. The ref carries the real value for
  // seek/fullscreen; state is only committed while something is watching it.
  const currentTimeRef = useRef(0);
  const showControlsRef = useRef(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [hasStartedAutoplay, setHasStartedAutoplay] = useState(false);
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
  const progressTrackWidthRef = useRef(0);
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
  const canPlay = !isContentGated && !!videoUrl && !isProcessing && !isFailed;

  // True once something has actually asked for media: the autoplay settle
  // timer, or a tap. Visibility alone used to attach the source, which created
  // (and then released) a native player + network prepare for every video card
  // the viewport passed over — most of the cost of scrolling a video feed, and
  // it downloaded video for Data Saver users who autoplay would never serve.
  const [sourceRequested, setSourceRequested] = useState(false);
  // A play intent waiting for the deferred source to reach readyToPlay.
  const pendingPlayRef = useRef(false);

  // Only attach the media source while the card is visible AND intent exists.
  // Off-screen cards keep an empty player, so their ExoPlayer buffers are
  // released — with FlatList's render window this is the difference between 1
  // and 10+ live players and was causing OutOfMemoryError on Android.
  const player = useVideoPlayer(canPlay && isVisible && sourceRequested ? videoUrl : null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.loop = true;
    p.muted = getCachedMuted();
    p.timeUpdateEventInterval = 0.5;
    // A rate pinned to this creator applies from the first frame; everyone
    // else plays at whatever rate was last used generally.
    p.playbackRate = getPlaybackRateFor(creator);
    p.bufferOptions = FEED_BUFFER_OPTIONS;
  });

  useEffect(() => {
    playerRef.current = player;
    // New player instance = new source; the previous first frame no longer counts.
    setFirstFrameRendered(false);
    return () => {
      // expo-video's Android time-update clock re-posts itself on the main
      // looper and release() never zeroes it, so every player this card ever
      // created kept a 2 Hz native timer ticking in the background. Stop the
      // clock before the instance is released.
      try {
        player.timeUpdateEventInterval = 0;
      } catch {}
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
      toastInfo(`${SEGMENT_LABELS[segment.category]} skipped`, {
        actionLabel: "Undo",
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
  const mediaAspect = useMediaAspect(thumbnail);

  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirrors showControls for the timeUpdate listener (which is subscribed once
  // per player and must not re-subscribe when the controls toggle). Revealing
  // the controls seeds the scrubber from the ref so it starts at the real
  // position rather than at whatever it held when it was last hidden.
  useEffect(() => {
    showControlsRef.current = showControls;
    if (showControls) setCurrentTime(currentTimeRef.current);
  }, [showControls]);

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
    }, 1500);
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

  const stopPlayback = useCallback(() => {
    try { playerRef.current?.pause(); } catch {}
    isPlayingRef.current = false;
    userStartedRef.current = false;
    setIsPlaying(false);
    endStarting();
    releaseFeedVideoFocus(stopPlayback);
    releaseAudioFocus(stopPlayback);
  }, [endStarting]);

  const startPlayback = useCallback(() => {
    if (!playerRef.current || !canPlay) return;
    try { stopActivePreview(); } catch {}
    requestFeedVideoFocus(stopPlayback);
    // The player is a native shared object that expo-video releases when the
    // card scrolls off-screen. A deferred call (autoplay timer) can land after
    // release and throw "Cannot use shared object that was already released".
    try {
      playerRef.current.play();
    } catch {
      return;
    }
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, [canPlay, stopPlayback]);

  /**
   * Honour a queued play intent once the source is actually playable.
   *
   * Normally the readyToPlay statusChange delivers this. But a card whose
   * source never detached — it stayed on screen, or it left and came back
   * inside one render pass — is ALREADY readyToPlay, so no status change ever
   * fires and the intent sits there forever. That is the "and then even after
   * scrolling it still won't play" half of the bug. Every path that sets the
   * intent calls this straight after, and the effect below catches the race
   * arriving from the other direction.
   */
  const flushPendingPlay = useCallback(() => {
    if (!pendingPlayRef.current) return;
    const p = playerRef.current;
    if (!p) return;
    let ready = false;
    // Reading status on a released shared object throws, same as play() does.
    try { ready = p.status === "readyToPlay"; } catch { return; }
    if (!ready) return;
    pendingPlayRef.current = false;
    // Seed mute from the shared cache the same way the old direct path did.
    try {
      const m = getCachedMuted();
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
          isPlayingRef.current = playing;
          setIsPlaying(playing);
        })
      );
    } catch {}
    try {
      subs.push(
        player.addListener("statusChange", ({ status }) => {
          setIsBuffering(status === "loading");
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
          currentTimeRef.current = ct ?? 0;
          if (showControlsRef.current) setCurrentTime(ct ?? 0);
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
  }, [player, flushPendingPlay, maybeSkipSegment]);

  // The other side of the same race: readiness landing before the intent, or a
  // source that was already attached when the intent was queued.
  useEffect(() => {
    if (videoReady) flushPendingPlay();
  }, [videoReady, sourceRequested, flushPendingPlay]);

  useEffect(() => {
    if (!canPlay || !isVisible) {
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
    // Visible, but the scroll position gave autoplay to another card. This one
    // stays mounted and tappable; it just does not start itself.
    if (!isAutoplayActive) return;
    // Data Saver: skip autoplay entirely, same as web's VideoCard lite-mode
    // guard. The card stays tappable — this only suppresses *auto* playback.
    if (liteMode) return;
    // Settings → Appearance → Auto-play videos, mirroring web's AutoplayContext
    // gate in VideoCard. Same as Data Saver, this only suppresses *auto* play.
    if (!autoplayEnabled) return;
    // The card survived the settle delay, so this is a real stop, not a fling
    // passing through. Attach the source now; statusChange plays it on ready.
    // The timer only ever fires with no source attached — a tap in the window
    // sets hasStartedAutoplay, which re-runs this effect and clears the timer.
    autoplayTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current || !canPlay) return;
      pendingPlayRef.current = true;
      setHasStartedAutoplay(true);
      setShowControls(false); // Controls hidden on autoplay
      // Same treatment for autoplay: the card the feed settled on shows it is
      // loading instead of a play button that is about to vanish on its own.
      beginStarting();
      setSourceRequested(true);
      // The source may already be attached and ready — sourceRequested never
      // went false — in which case nothing else will carry this intent.
      flushPendingPlay();
    }, AUTOPLAY_DELAY);
    return () => { if (autoplayTimerRef.current) { clearTimeout(autoplayTimerRef.current); autoplayTimerRef.current = null; } };
  }, [canPlay, isVisible, isAutoplayActive, hasStartedAutoplay, liteMode, autoplayEnabled, flushPendingPlay, clearHideTimer, beginStarting, endStarting]);

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

    // Toggle play state and manage controls visibility
    if (isPlayingRef.current) {
      stopPlayback();
      setShowControls(true);
      clearHideTimer(); // Stay visible while paused
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
    // One path for both cases. On a card that never got a source (Data Saver,
    // autoplay off, not the autoplay target, or the tap beat the settle timer)
    // this attaches it and plays on readyToPlay, with the buffering spinner
    // covering the gap. On one already loaded, flushPendingPlay starts it in
    // this same tick.
    pendingPlayRef.current = true;
    setHasStartedAutoplay(true);
    setSourceRequested(true);
    flushPendingPlay();
    setShowControls(true);
    startHideTimer(); // Auto-hide after 1.5s when playing
  }, [canPlay, onPress, stopPlayback, flushPendingPlay, clearHideTimer, startHideTimer, onUserStarted, beginStarting, videoReady, firstFrameRendered]);

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
    if (startOnMountRef.current) handleVideoPress();
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
    
    if (isPlayingRef.current) {
      startHideTimer(); // Reset hide timer when interacting
    }
  }, [isMuted, stopPlayback, startHideTimer]);

  const [isLooping, setIsLooping] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(() => getPlaybackRateFor(creator));

  const handleToggleLoop = useCallback(() => {
    if (!playerRef.current) return;
    const nextLoop = !isLooping;
    playerRef.current.loop = nextLoop;
    setIsLooping(nextLoop);
    if (isPlayingRef.current) startHideTimer();
  }, [isLooping, startHideTimer]);

  const handleToggleSpeed = useCallback(() => {
    if (!playerRef.current) return;
    const currentSpeed = playerRef.current.playbackRate;
    let nextSpeed = 1.0;
    if (currentSpeed === 1.0) nextSpeed = 1.5;
    else if (currentSpeed === 1.5) nextSpeed = 2.0;
    else nextSpeed = 1.0;
    playerRef.current.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
    // Remembered against the creator, so this channel opens at this rate next
    // time while the rest of the feed is unaffected.
    persistPlaybackRate(nextSpeed, creator);
    if (isPlayingRef.current) startHideTimer();
  }, [startHideTimer, creator]);

  const handleFullscreen = useCallback(() => {
    // From the ref, not state: state is only live while the controls are up.
    const time = currentTimeRef.current;
    const muted = isMuted;
    stopPlayback();
    navigation.navigate(ScreenNames.FullscreenVideo as never, {
      videoUrl, startTime: time, isMuted: muted, thumbnail,
      tokenId, isSignedIn,
    } as never);
  }, [isMuted, videoUrl, thumbnail, tokenId, isSignedIn, stopPlayback, navigation]);


  const handleSeek = useCallback(
    (locationX: number) => {
      if (!playerRef.current || videoDuration <= 0 || progressTrackWidthRef.current <= 0) return;
      const ratio = Math.max(0, Math.min(1, locationX / progressTrackWidthRef.current));
      playerRef.current.currentTime = ratio * videoDuration;
      currentTimeRef.current = ratio * videoDuration;
      setCurrentTime(ratio * videoDuration);
    },
    [videoDuration]
  );

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
      <Pressable onPress={handleGatedOverlayPress} style={styles.gatedOverlay}>
        <View style={icons.length > 1 ? styles.gatedIconRow : undefined}>
          {icons.map((ic, i) => (
            <View key={i} style={icons.length > 1 ? styles.gatedIconBox : styles.gatedIconBoxLarge}>
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.gatedIconOverlay} />
              <Icon name={ic.name as any} size={icons.length > 1 ? 24 : 28} color="#fff" />
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
          aspectRatio: mediaAspect,
          // Fills the card when the clip is wide enough; a portrait clip caps
          // at MAX_MEDIA_HEIGHT and shrinks its own width, hugged to the left.
          width: Math.min(CARD_WIDTH, Math.round(MAX_MEDIA_HEIGHT * mediaAspect)),
          maxWidth: "100%",
          alignSelf: "flex-start",
        },
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
          contentFit="contain"
          recyclingKey={thumbnail}
          transition={0}
        />
      ) : (
        <View style={[styles.thumbnail, styles.noThumb]}>
          <Icon name="VideoOff" size={40} color="#666" />
        </View>
      )}

      {canPlay && isVisible && sourceRequested && player && (
        <VideoView
          ref={videoViewRef}
          player={player}
          focusable={false}
          contentFit="contain"
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
          <Text style={styles.statusText}>Processing video…</Text>
        </View>
      )}

      {isFailed && (
        <View style={styles.statusOverlay}>
          <Icon name="TriangleAlert" size={28} color="#fff" />
          <Text style={styles.statusText}>Failed to process video</Text>
          {isOwner && (
            <Text style={styles.statusHintText}>
              Replace it with a standard MP4 via Edit in the ⋮ menu, top right of the post.
            </Text>
          )}
        </View>
      )}

      {isContentGated && renderGatedOverlay()}

      {isBounty && (
        <TouchableOpacity
          onPress={onBountyPress}
          activeOpacity={0.75}
          style={styles.bountyPill}
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

      {!hideControls && !isContentGated && !isPlaying && !isProcessing && !isFailed && (
        <Pressable {...mediaTap} style={styles.playOverlay}>
          <View style={styles.glassPlayButton}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.glassOverlay} />
            {isStarting ? (
              // The glyph is replaced in place rather than the button being
              // swapped out, so the tap target does not move or resize between
              // press and playback.
              <Spinner size={24} />
            ) : (
              <View style={{ marginLeft: 2 }}>
                <Icon name="Play" size={24} color="#fff" />
              </View>
            )}
          </View>
        </Pressable>
      )}

      {!hideControls && (isPlaying || showControls) && (
        <>
          {/* The video tap target is a sibling behind the controls. Nesting the
              timeline inside it let a seek bubble into play/pause, and made the
              whole media box too eager to claim vertical feed flicks. */}
          <Pressable {...mediaTap} style={StyleSheet.absoluteFill} />
          {showControls && (
            <View style={styles.controlsContainer} pointerEvents="box-none">
            <View style={styles.topControls}>
              <Pressable onPress={handleToggleSpeed} style={styles.glassButton}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.glassOverlay} />
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "bold" }}>{playbackRate}x</Text>
              </Pressable>
              
              <Pressable onPress={handleToggleLoop} style={styles.glassButton}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.glassOverlay} />
                <Icon name={isLooping ? "Repeat" : "ArrowRight"} size={14} color={isLooping ? "#fff" : "#9CA3AF"} />
              </Pressable>

              <Pressable onPress={handleToggleMute} style={styles.glassButton}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.glassOverlay} />
                <Icon name={isMuted ? "VolumeX" : "Volume2"} size={16} color="#fff" />
              </Pressable>
              
              <PictureInPictureButton videoRef={videoViewRef} />
              <Pressable onPress={handleFullscreen} style={styles.glassButton}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.glassOverlay} />
                <Icon name="Maximize" size={16} color="#fff" />
              </Pressable>
            </View>

            <View style={styles.bottomControls}>
              <View style={styles.progressRow}>
                <View style={styles.timePill}>
                  <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                </View>
                <Pressable
                  style={styles.progressTrack}
                  onPress={(e) => handleSeek(e.nativeEvent.locationX)}
                  onLayout={(e) => { progressTrackWidthRef.current = e.nativeEvent.layout.width; }}
                >
                  <View style={styles.progressTrackInner}>
                    <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                    <View style={[styles.progressThumb, { left: `${progressPercent}%`, marginLeft: -6 }]} />
                  </View>
                </Pressable>
                <View style={styles.timePill}>
                  <Text style={styles.timeText}>{formatTime(videoDuration)}</Text>
                </View>
              </View>
            </View>
          </View>
          )}
        </>
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

      {!hideControls && !isContentGated && duration && !isPlaying && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{duration}</Text>
        </View>
      )}

      {!hideControls && isContentGated && duration && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{duration}</Text>
        </View>
      )}
    </View>
  );
};

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
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
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
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
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
  timePill: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
    height: 20,
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
    backgroundColor: "rgba(0,0,0,0.3)",
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
    backgroundColor: "rgba(0,0,0,0.4)",
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
const FeedVideoPoster: React.FC<Pick<FeedVideoPlayerProps, "thumbnail" | "duration" | "hideControls" | "onPress">> = memo(
  ({ thumbnail, duration, hideControls, onPress }) => {
    const mediaAspect = useMediaAspect(thumbnail);
    const mediaTap = useTapOnlyPress(() => onPress());
    return (
      <View
        style={[
          styles.container,
          {
            aspectRatio: mediaAspect,
            width: Math.min(CARD_WIDTH, Math.round(MAX_MEDIA_HEIGHT * mediaAspect)),
            maxWidth: "100%",
            alignSelf: "flex-start",
          },
        ]}
      >
        {thumbnail ? (
          <SmartImage
            source={{ uri: thumbnail }}
            style={styles.thumbnail}
            contentFit="contain"
            recyclingKey={thumbnail}
            transition={0}
          />
        ) : (
          <View style={[styles.thumbnail, styles.noThumb]}>
            <Icon name="VideoOff" size={40} color="#666" />
          </View>
        )}
        {!hideControls && (
          <Pressable {...mediaTap} style={styles.playOverlay}>
            <View style={styles.glassPlayButton}>
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.glassOverlay} />
              <View style={{ marginLeft: 2 }}>
                <Icon name="Play" size={24} color="#fff" />
              </View>
            </View>
          </Pressable>
        )}
        {!hideControls && duration ? (
          <View style={styles.durationBadge}>
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
  const { autoplay: autoplayEnabled } = useAppPrefs();
  const { liteMode } = useDataSaver();
  const [wanted, setWanted] = useState(false);
  const [inPictureInPicture, setInPictureInPicture] = useState(false);

  const { isVisible, isAutoplayActive = true, isContentGated, transcodingStatus, videoUrl, onPress } = props;
  const needsChrome =
    isContentGated || transcodingStatus === "pending" || transcodingStatus === "on" || transcodingStatus === "failed";
  const autoplayHere = isVisible && isAutoplayActive && autoplayEnabled && !liteMode;
  const mountPlayer = inPictureInPicture || (isVisible && (wanted || autoplayHere || needsChrome));

  // Off screen, the tap is forgotten: coming back autoplays or shows the
  // poster, the same as any other card.
  useEffect(() => {
    if (!isVisible) setWanted(false);
  }, [isVisible]);

  const onPosterPress = useCallback(() => {
    if (!videoUrl) {
      onPress();
      return;
    }
    setWanted(true);
  }, [videoUrl, onPress]);

  const markWanted = useCallback(() => setWanted(true), []);

  return mountPlayer ? (
    <FeedVideoPlayerActive
      {...props}
      isVisible={isVisible || inPictureInPicture}
      isAutoplayActive={isAutoplayActive || inPictureInPicture}
      onPictureInPictureChange={setInPictureInPicture}
      startOnMount={wanted && !autoplayHere}
      onUserStarted={markWanted}
    />
  ) : (
    <FeedVideoPoster
      thumbnail={props.thumbnail}
      duration={props.duration}
      hideControls={props.hideControls}
      onPress={onPosterPress}
    />
  );
};

export default memo(FeedVideoPlayer);
