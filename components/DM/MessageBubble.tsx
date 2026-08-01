import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";
import * as VideoThumbnails from "expo-video-thumbnails";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import GlassIndicator from "../ui/GlassIndicator";
import VoiceNotePlayer from "../Comments/VoiceNotePlayer";
import PaymentBadge from "./PaymentBadge";
import { getAvatarUrl, buildCdnPath } from "../../libs/misc";
import type { DmMessage, DmMsgType, DmMediaUrl, ReplyPreview } from "../../services/dm/dm.types";
import { getSenderUser } from "../../services/dm/dm.types";
import type { MessageLayout } from "./MessageContextMenu";
import { ScreenNames } from "../../navigation/ScreenNames";
import SharedPostPreview from "./SharedPostPreview";

/** Extract a shared post's tokenId from a dehub post URL (…/post/<id>). */
const POST_URL_RE = /\/post\/([^\s/?#]+)/i;


const resolveUrl = (path: string): string => {
  if (
    path.startsWith("file://") ||
    path.startsWith("/") ||
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }
  return buildCdnPath(path) ?? path;
};

const formatTime = (date?: string): string => {
  if (!date) return "";
  const d = new Date(date);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

const isImageMime = (mime?: string): boolean =>
  !!mime && (mime.startsWith("image/") || /jpe?g|png|webp|heic|gif/i.test(mime));

const isVideoMime = (mime?: string): boolean =>
  !!mime && (mime.startsWith("video/") || /mp4|mov|quicktime|webm/i.test(mime));


const SCREEN_WIDTH = Dimensions.get("window").width;
/** Max bubble is ~75% screen. Allow image to fill that minus padding. */
const MAX_IMAGE_WIDTH = Math.round(SCREEN_WIDTH * 0.75 - 24);
const MIN_IMAGE_WIDTH = 160;
const MAX_IMAGE_HEIGHT = 320;
const DEFAULT_ASPECT = 4 / 3;

interface AutoImageProps {
  uri: string;
  isGif?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

/**
 * Renders an image that sizes itself to its natural aspect ratio,
 * constrained within MAX_IMAGE_WIDTH × MAX_IMAGE_HEIGHT.
 * Shows skeleton while loading, fallback icon on error.
 */
const AutoImage: React.FC<AutoImageProps> = memo(({ uri, isGif, onPress, onLongPress }) => {
  const [aspect, setAspect] = useState<number>(DEFAULT_ASPECT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled) return;
        if (w && h) setAspect(w / h);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setLoading(false);
      },
    );
    return () => { cancelled = true; };
  }, [uri]);

  // Calculate display dimensions
  let displayW = MAX_IMAGE_WIDTH;
  let displayH = displayW / aspect;
  if (displayH > MAX_IMAGE_HEIGHT) {
    displayH = MAX_IMAGE_HEIGHT;
    displayW = displayH * aspect;
  }
  displayW = Math.max(Math.round(displayW), MIN_IMAGE_WIDTH);
  displayH = Math.round(displayH);

  if (error) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
      >
        <View
          className="bg-theme-neutrals-700 items-center justify-center"
          style={{ width: displayW, height: displayH }}
        >
          <Icon name="Image" size={32} color="#555" />
          <Text className="text-theme-neutrals-500 text-[11px] mt-1">
            Failed to load
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <View style={{ width: displayW, height: displayH }}>
        {loading && (
          <View
            className="absolute inset-0 bg-theme-neutrals-700 items-center justify-center"
            style={{ width: displayW, height: displayH }}
          >
            <ActivityIndicator size="small" color="#555" />
          </View>
        )}
        <Image
          source={{ uri }}
          style={{ width: displayW, height: displayH }}
          resizeMode="cover"
          className="bg-theme-neutrals-700"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
        />
        {isGif && (
          <View className="absolute bottom-1.5 left-1.5 bg-black/60 rounded px-1.5 py-0.5">
            <Text className="text-[10px] text-white font-bold">GIF</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});


interface VideoThumbProps {
  uri: string;
  width: number;
  height: number;
  onPress?: () => void;
  onLongPress?: () => void;
}

const VideoThumb: React.FC<VideoThumbProps> = memo(({ uri, width, height, onPress, onLongPress }) => {
  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setThumb(null);
    setFailed(false);
    VideoThumbnails.getThumbnailAsync(uri, { time: 500 })
      .then((res) => { if (active) setThumb(res.uri); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [uri]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <View className="bg-theme-neutrals-700" style={{ width, height }}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={{ width, height }}
            resizeMode="cover"
          />
        ) : failed ? (
          <View className="flex-1 items-center justify-center">
            <Icon name="Video" size={32} color="#555" />
          </View>
        ) : (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color="#555" />
          </View>
        )}
        <View className="absolute inset-0 items-center justify-center">
          <View className="bg-black/50 rounded-full p-2">
            <Icon name="Play" size={24} color="#fff" />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});


interface MessageBubbleProps {
  message: DmMessage;
  isMine: boolean;
  showAvatar?: boolean;
  onLongPress?: (
    message: DmMessage,
    layout: MessageLayout,
    isMine: boolean,
  ) => void;
  onImagePress?: (url: string) => void;
  onVideoPress?: (url: string) => void;
  /** Local URI override for optimistic media (pre-upload). */
  localMediaUri?: string;
  /** Called when the user swipes to reply. */
  onSwipeToReply?: (message: DmMessage) => void;
  /** Called when the reply preview is tapped — scrolls to the original message. */
  onReplyPress?: (messageId: string) => void;
  /** Whether this bubble is highlighted (flash animation after scroll). */
  highlighted?: boolean;
}


const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  isMine,
  showAvatar = false,
  onLongPress,
  onImagePress,
  onVideoPress,
  localMediaUri,
  onSwipeToReply,
  onReplyPress,
  highlighted = false,
}) => {
  const navigation = useNavigation<any>();
  const containerRef = useRef<View>(null);

  const isTipMsg = (message.msgType as DmMsgType) === "tip";

  // Highlight animation for scroll-to-reply
  const highlightOpacity = useSharedValue(0);

  useEffect(() => {
    if (highlighted) {
      highlightOpacity.value = withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0.4, { duration: 350 }),
        withTiming(1, { duration: 350 }),
        withTiming(0.4, { duration: 350 }),
        withTiming(1, { duration: 350 }),
        withDelay(600, withTiming(0, { duration: 500 })),
      );
    } else {
      highlightOpacity.value = 0;
    }
  }, [highlighted, highlightOpacity]);

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
  }));

  const isCallMsg = message.msgType === "msg" && /^[📞📹📵]/.test(message.content || "");

  if (isCallMsg) {
    return (
      <View className="items-center py-2 px-4">
        <View className="flex-row items-center bg-theme-neutrals-800/60 rounded-full px-3 py-1.5 gap-1.5">
          <Text className="text-[13px]">📞</Text>
          <Text className="text-theme-neutrals-300 text-[12px] font-medium">
            {message.content}
          </Text>
        </View>
        <Text className="text-theme-neutrals-600 text-[10px] mt-1">
          {formatTime(message.createdAt)}
        </Text>
      </View>
    );
  }

  if (isTipMsg) {
    const amountLabel = message.tipAmount
      ? `${Number(message.tipAmount).toLocaleString()} ${message.tipSymbol || "DHB"}`
      : "DHB";
    const isPending = message.paymentStatus === "pending";
    const label = isMine
      ? `You tipped ${amountLabel}`
      : `Tipped you ${amountLabel}`;

    return (
      <View className="items-center py-2 px-4">
        <View className="flex-row items-center bg-theme-neutrals-800/60 rounded-full px-3 py-1.5 gap-1.5">
          <Text className="text-[13px]">💎</Text>
          <Text className="text-theme-neutrals-300 text-[12px] font-medium">
            {label}
          </Text>
          {isPending && (
            <ActivityIndicator size={10} color="#A6A9AC" style={{ marginLeft: 2 }} />
          )}
        </View>
        {isPending && (
          <Text className="text-theme-neutrals-500 text-[10px] mt-1">
            Confirming on-chain…
          </Text>
        )}
      </View>
    );
  }

  const REPLY_THRESHOLD = 60;
  const translateX = useSharedValue(0);

  const fireSwipeReply = useCallback(() => {
    onSwipeToReply?.(message);
  }, [message, onSwipeToReply]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(20)
        .failOffsetY([-15, 15])
        .onUpdate((e) => {
          translateX.value = Math.min(Math.max(e.translationX, 0), 80);
        })
        .onEnd(() => {
          if (translateX.value >= REPLY_THRESHOLD) {
            runOnJS(fireSwipeReply)();
          }
          translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        }),
    [fireSwipeReply],
  );

  const swipeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, REPLY_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          translateX.value,
          [0, REPLY_THRESHOLD],
          [0.5, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const senderUser = getSenderUser(message);
  const avatarUrl = getAvatarUrl(senderUser?.avatarImageUrl);

  const msgType: DmMsgType = (message.msgType as DmMsgType) || "msg";
  const isVoice = msgType === "voice";
  const isGif = msgType === "gif";
  const isMedia = msgType === "media";
  const hasText = !!message.content?.trim() && !isGif;
  const isUploading = message.uploadStatus === "pending";
  const isUploadFailed = message.uploadStatus === "failed";


  const mediaItems = useMemo(() => {
    // GIF: prefer URL from mediaUrls, fall back to content for legacy messages
    if (isGif) {
      const gifMedia = message.mediaUrls?.find(
        (mu) => typeof mu === "object" && /gif/i.test(mu.mimeType || mu.type || ""),
      );
      const gifRaw = gifMedia
        ? (typeof gifMedia === "string" ? gifMedia : gifMedia.url)
        : (message.content?.startsWith("http") ? message.content : null);
      if (!gifRaw) return [];
      const gifUrl = resolveUrl(gifRaw);
      return [{ url: gifUrl, kind: "gif" as const }];
    }
    if (!message.mediaUrls?.length) {
      if (localMediaUri) return [{ url: localMediaUri, kind: "image" as const }];
      return [];
    }

    const items = message.mediaUrls.map((mu) => {
      const raw = typeof mu === "string" ? mu : mu.url;
      const mime = typeof mu === "object" ? mu.mimeType || mu.type : undefined;
      const url = localMediaUri || resolveUrl(raw);
      // localMediaUri is always a preview-ready asset (thumbnail jpg for video, original for image)
      const kind: "image" | "video" | "gif" = localMediaUri
        ? "image"
        : isVideoMime(mime) ? "video" : "image";
      return { url, kind };
    });

    return items;
  }, [message.mediaUrls, message.content, isGif, isMedia, msgType, message._id, localMediaUri]);


  // A shared post arrives as text containing a …/post/<tokenId> link (optionally
  // with a title on the line above it). Detect it so we can render a tappable
  // card that opens the post instead of showing a dead URL.
  const sharedPost = useMemo(() => {
    if (isVoice || isGif || mediaItems.length > 0) return null;
    const content = message.content ?? "";
    const match = content.match(POST_URL_RE);
    if (!match) return null;
    const tokenId = match[1];
    // Everything except the URL itself is treated as the post's title/caption.
    const title = content.replace(match[0], "").replace(/https?:\/\/\S+/gi, "").trim();
    return { tokenId, title };
  }, [message.content, isVoice, isGif, mediaItems.length]);

  const handleOpenSharedPost = useCallback(() => {
    if (!sharedPost) return;
    navigation.navigate(ScreenNames.FeedDetail as never, {
      tokenId: sharedPost.tokenId,
    } as never);
  }, [navigation, sharedPost]);

  const handleLongPress = useCallback(() => {
    containerRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress?.(message, { x, y, width, height }, isMine);
    });
  }, [message, isMine, onLongPress]);

  const handleImageTap = useCallback(
    (url: string, index: number = 0) => {
      if (onImagePress) {
        onImagePress(url);
        return;
      }
      const imageUrls = mediaItems
        .filter((m) => m.kind !== "video")
        .map((m) => m.url);
      navigation.navigate("ImageViewer", {
        images: imageUrls.length > 0 ? imageUrls : [url],
        initialIndex: index,
      });
    },
    [navigation, onImagePress, mediaItems],
  );

  const handleVideoTap = useCallback(
    (url: string) => {
      onVideoPress?.(url);
    },
    [onVideoPress],
  );


  const timeStr = formatTime(message.createdAt);

  // Whether this message was sent with an on-chain payment (per-message fee or voluntary tip)
  const isPaidMsg = !!(message.paymentTxHash || message.paymentStatus || message.tipAmount);

  // Determine payment amount for the badge:
  // - Per-message fee: tipAmount is set on optimistic from dmFee.fee, confirmed via feeConfirmed event
  // - Tipped message: tipAmount is populated once confirmed
  const paymentAmount = message.tipAmount ?? null;
  const paymentSymbol = message.tipSymbol ?? "DHB";

  // Failed = upload failed on a paid message (tx reverted, e.g. STF error)
  const isFailed = isPaidMsg && message.uploadStatus === "failed";

  const StatusRow = useCallback(() => (
    <View
      className={`flex-row items-center gap-1 mt-0.5 ${
        isMine ? "justify-end" : "justify-start"
      }`}
    >
      <Text
        className={`text-[10px] ${
          isMine ? "text-white/50" : "text-theme-neutrals-500"
        }`}
      >
        {timeStr}
      </Text>
      {message.isEdited && (
        <Text
          className={`text-[10px] ${
            isMine ? "text-white/40" : "text-theme-neutrals-600"
          }`}
        >
          · edited
        </Text>
      )}
      {isMine && (
        <Icon
          name={message.isRead ? "CheckCheck" : "Check"}
          size={12}
          color={message.isRead ? "#F4F4F5" : "rgba(255,255,255,0.4)"}
        />
      )}
    </View>
  ), [timeStr, isMine, message.isEdited, message.isRead]);


  const bubbleBg = isMine
    ? "rounded-xl rounded-br-sm"
    : "bg-theme-neutrals-800 rounded-xl rounded-bl-sm";

  const isMediaOnly = mediaItems.length > 0 && !hasText && !isVoice;
  // Media-only paid msgs need a background for PaymentBadge; plain media-only don't
  const activeBubbleBg = isMediaOnly
    ? (isPaidMsg
        ? bubbleBg + " overflow-hidden"  // full bubble bg for payment badge area
        : (isMine ? "rounded-xl rounded-br-sm overflow-hidden" : "rounded-xl rounded-bl-sm overflow-hidden"))
    : bubbleBg;

  return (
    <View>
      {/* Reply arrow icon — sits behind the message */}
      <Animated.View
        style={[
          replyIconStyle,
          {
            position: "absolute",
            left: 8,
            top: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <View className="w-8 h-8 rounded-full bg-theme-neutrals-800 items-center justify-center">
          <Icon name="Undo2" size={18} color="#F4F4F5" />
        </View>
      </Animated.View>

      <GestureDetector gesture={onSwipeToReply ? panGesture : Gesture.Tap()}>
        <Animated.View style={swipeAnimStyle}>
          <Pressable
            onLongPress={handleLongPress}
            delayLongPress={350}
          >
        <View
          ref={containerRef}
          className={`flex-row items-end gap-2 px-3 py-0.5 ${
            isMine ? "justify-end" : "justify-start"
          }`}
        >
          {/* Highlight overlay for scroll-to-reply */}
          <Animated.View
            style={[
              {
                position: "absolute",
                top: -2,
                left: 0,
                right: 0,
                bottom: -2,
                backgroundColor: "rgba(255,255,255, 0.12)",
                borderRadius: 12,
              },
              highlightStyle,
            ]}
            pointerEvents="none"
          />
          {/* Avatar (other user, first in a group) */}
          {!isMine && showAvatar && (
            <Avatar
              uri={
                avatarUrl && avatarUrl !== "default-avatar"
                  ? avatarUrl
                  : undefined
              }
              size={28}
              name={senderUser?.displayName || senderUser?.username}
            />
          )}

          {/* Bubble */}
          <View
            className={`max-w-[75%] ${activeBubbleBg} overflow-hidden`}
            style={isMine ? { backgroundColor: "rgba(20,20,20,0.65)" } : undefined}
          >
            {isMine && <GlassIndicator borderRadius={16} />}
            {/* Forwarded tag */}
            {message.isForwarded && (
              <View className="flex-row items-center gap-1 px-3 pt-1.5">
                <Icon name="Forward" size={10} color={isMine ? "rgba(255,255,255,0.5)" : "#A6A9AC"} />
                <Text className={`text-[10px] italic ${isMine ? "text-white/50" : "text-theme-neutrals-400"}`}>
                  Forwarded
                </Text>
              </View>
            )}

            {/* Reply-to preview */}
            {message.replyTo && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => message.replyTo?._id && onReplyPress?.(message.replyTo._id)}
                className={`mx-2 mt-2 rounded-lg overflow-hidden border-l-2 ${
                  isMine ? "bg-white/10 border-white/30" : "bg-theme-neutrals-700 border-accent"
                }`}
              >
                <View className="px-2.5 py-2">
                  <Text
                    className={`text-[11px] font-medium mb-0.5 ${
                      isMine ? "text-white/70" : "text-accent"
                    }`}
                    numberOfLines={1}
                  >
                    {message.replyTo.sender?.displayName ||
                      message.replyTo.sender?.username ||
                      "Unknown"}
                  </Text>
                  {message.replyTo.msgType === "voice" ? (
                    <View className="flex-row items-center gap-1">
                      <Icon
                        name="Mic"
                        size={12}
                        color={isMine ? "rgba(255,255,255,0.5)" : "#A6A9AC"}
                      />
                      <Text
                        className={`text-[12px] ${
                          isMine ? "text-white/50" : "text-theme-neutrals-400"
                        }`}
                      >
                        Voice note
                        {message.replyTo.voiceDuration
                          ? ` ${Math.floor(message.replyTo.voiceDuration / 60)}:${String(
                              Math.round(message.replyTo.voiceDuration % 60),
                            ).padStart(2, "0")}`
                          : ""}
                      </Text>
                    </View>
                  ) : message.replyTo.msgType === "gif" ? (
                    <View className="flex-row items-center gap-1">
                      <Text
                        className={`text-[12px] ${
                          isMine ? "text-white/50" : "text-theme-neutrals-400"
                        }`}
                      >
                        GIF
                      </Text>
                    </View>
                  ) : message.replyTo.mediaUrls?.length ? (
                    <View className="flex-row items-center gap-1.5">
                      <Image
                        source={{ uri: resolveUrl(message.replyTo.mediaUrls[0]?.url) }}
                        style={{ width: 32, height: 32, borderRadius: 4 }}
                        resizeMode="cover"
                      />
                      <Text
                        className={`text-[12px] flex-1 ${
                          isMine ? "text-white/50" : "text-theme-neutrals-400"
                        }`}
                        numberOfLines={1}
                      >
                        {message.replyTo.content || "Photo"}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      className={`text-[12px] ${
                        isMine ? "text-white/50" : "text-theme-neutrals-400"
                      }`}
                      numberOfLines={2}
                    >
                      {message.replyTo.content || ""}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}

            {/* Media (images / video / GIF) */}
            {mediaItems.length > 0 && !isVoice && (
              <View>
                {mediaItems.map((item, idx) =>
                  item.kind === "video" ? (
                    <VideoThumb
                      key={idx}
                      uri={item.url}
                      width={MAX_IMAGE_WIDTH}
                      height={Math.round(MAX_IMAGE_WIDTH / DEFAULT_ASPECT)}
                      onPress={() => handleVideoTap(item.url)}
                      onLongPress={handleLongPress}
                    />
                  ) : (
                    <AutoImage
                      key={idx}
                      uri={item.url}
                      isGif={item.kind === "gif"}
                      onPress={() => handleImageTap(item.url, idx)}
                      onLongPress={handleLongPress}
                    />
                  ),
                )}
                {/* Upload progress / failure overlay */}
                {isUploading && (
                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                    <ActivityIndicator color="#fff" size="small" />
                    <Text className="text-[10px] text-white/80 mt-1">
                      Sending…
                    </Text>
                  </View>
                )}
                {isUploadFailed && (
                  <View className="absolute inset-0 items-center justify-center bg-black/50">
                    <Icon name="CircleAlert" size={28} color="#EF4444" />
                    <Text className="text-[11px] text-red-400 mt-1 font-medium">
                      Failed to send
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Voice note */}
            {isVoice && (() => {
              const raw = message.mediaUrls?.[0];
              const voiceUrl = raw
                ? resolveUrl(typeof raw === "string" ? raw : raw.url)
                : undefined;
              return voiceUrl ? (
                <View className="px-2 min-w-[200px]">
                  <VoiceNotePlayer
                    audioUrl={voiceUrl}
                    duration={message.voiceDuration ?? undefined}
                    compact
                  />
                </View>
              ) : (
                <View className="flex-row items-center px-3 py-2.5 gap-2.5 min-w-[160px]">
                  <View
                    className={`w-8 h-8 rounded-full items-center justify-center ${
                      isMine ? "bg-white/15" : "bg-accent/20"
                    }`}
                  >
                    <Icon name="Mic" size={16} color={isMine ? "#fff" : "#F4F4F5"} />
                  </View>
                  <Text
                    className={`text-[11px] ${
                      isMine ? "text-white/70" : "text-theme-neutrals-500"
                    }`}
                  >
                    {message.voiceDuration
                      ? `${Math.floor(message.voiceDuration / 60)}:${String(
                          Math.round(message.voiceDuration % 60),
                        ).padStart(2, "0")}`
                      : "0:00"}
                  </Text>
                </View>
              );
            })()}

            {/* Shared post — rich preview card that opens the post on tap */}
            {sharedPost ? (
              <SharedPostPreview
                tokenId={sharedPost.tokenId}
                isMine={isMine}
                fallbackTitle={sharedPost.title || undefined}
                onPress={handleOpenSharedPost}
                onLongPress={handleLongPress}
              />
            ) : (
              hasText && (
                <Text
                  className={`px-3 ${
                    mediaItems.length > 0 ? "pt-1.5 pb-0.5" : "pt-2.5 pb-0.5"
                  } text-[15px] leading-5 ${
                    isMine ? "text-white" : "text-theme-neutrals-100"
                  }`}
                >
                  {message.content}
                </Text>
              )
            )}

            {/* Payment badge — "Sent with X DHB" for paid / tipped messages */}
            {isPaidMsg && !isMediaOnly && (
              <View className="px-3">
                <PaymentBadge
                  amount={paymentAmount}
                  symbol={paymentSymbol}
                  status={message.paymentStatus}
                  isMine={isMine}
                  failed={isFailed}
                />
              </View>
            )}

            {/* Inline timestamp + status */}
            {isMediaOnly ? (
              <>
                {/* Payment badge overlay for media-only paid messages */}
                {isPaidMsg && (
                  <View className="px-2 pb-0.5">
                    <PaymentBadge
                      amount={paymentAmount}
                      symbol={paymentSymbol}
                      status={message.paymentStatus}
                      isMine={isMine}
                      failed={isFailed}
                    />
                  </View>
                )}
                <View className={`${isPaidMsg ? "px-2 pb-1.5" : "absolute bottom-1.5 right-2"} flex-row items-center gap-1 ${isPaidMsg ? "justify-end" : "bg-black/50 rounded-full px-1.5 py-0.5"}`}>
                  <Text className="text-[10px] text-white/80">{timeStr}</Text>
                  {message.isEdited && (
                    <Text className="text-[10px] text-white/50">· edited</Text>
                  )}
                  {isMine && (
                    <Icon
                      name={message.isRead ? "CheckCheck" : "Check"}
                      size={12}
                      color={message.isRead ? "#F4F4F5" : "rgba(255,255,255,0.6)"}
                    />
                  )}
                </View>
              </>
            ) : (
              <View className="px-3 pb-1.5">
                <StatusRow />
              </View>
            )}
          </View>
        </View>
      </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

export default memo(MessageBubbleComponent);
