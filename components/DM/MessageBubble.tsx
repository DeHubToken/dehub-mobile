import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { Message } from "../../store/messages.types";
import { formatChatTimeSmart } from "../../libs/date.util";
import { resolveDisplayUri, downloadToLocal } from "../../libs/dm-media.local";
import { useWebSocket } from "../../context/WebSocketContext";
import { DMSocketEvent } from "../../services/enums/dm-socket-events.enum";
import { dmActions } from "../../store/dm.state";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { buildCdnPath } from "../../libs/misc";

export type MessageBubbleProps = {
  msg: Message;
  isMe: boolean;
  onOpenVideo?: (uri: string) => void;
};

const MessageBubble: React.FC<MessageBubbleProps> = memo(({ msg, isMe, onOpenVideo }) => {
  const [showMeta, setShowMeta] = useState<boolean>(false);
  const bg = isMe ? "bg-blue-600" : "bg-theme-neutrals-800";
  const align = isMe ? "self-end" : "self-start";
  const tsLabel = formatChatTimeSmart(msg.createdAt, 6);
  const statusLabel = isMe
    ? msg.status === "sending"
      ? "Sending…"
      : msg.status === "sent"
      ? "Sent"
      : msg.status === "delivered"
      ? "Delivered"
      : msg.status === "read"
      ? "Read"
      : undefined
    : undefined;
  // if(msg?.mediaUrls?.length > 0 && msg?.mediaUrls[0]?.mimeType === "image/jpeg") console.log({media: msg?.mediaUrls, isD:msg.isDownloaded})

  const onLongPress = useCallback(() => {
    setShowMeta((prev) => !prev);
  }, []);
  const onPressHideMeta = useCallback(() => {
    if (showMeta) setShowMeta(false);
  }, [showMeta]);

  const media = useMemo(() => {
    const anyMsg: any = msg as any;
    const list: Array<{ url: string; type?: string; mimeType?: string }> =
      Array.isArray(anyMsg.mediaUrls)
        ? anyMsg.mediaUrls
        : Array.isArray(anyMsg.attachments)
        ? anyMsg.attachments.map((a: any) => ({
            url: a?.url,
            type: a?.type,
            mimeType: a?.mimeType,
          }))
        : [];
    return list;
  }, [msg]);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [displayUri, setDisplayUri] = useState<string | undefined>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const ws = useWebSocket();
  const navigation = useNavigation<any>();
  // video opening handled by parent via onOpenVideo

  const isDownloaded = (msg as any)?.isDownloaded === true;
  const mediaType: "image" | "video" | undefined = useMemo(() => {
    if (!media || !media.length) {
      const t = String((msg as any)?.msgType || "").toLowerCase();
      if (t === "media" || t === "gif") return "image";
      return undefined;
    }
    const m = media[0];
    if (
      (m.type || "").startsWith("video") ||
      (m.mimeType || "").startsWith("video")
    )
      return "video";
    if (
      (m.type || "").startsWith("image") ||
      (m.mimeType || "").startsWith("image")
    )
      return "image";
    return "image";
  }, [media, msg]);

  const isGif = useMemo(() => {
    const anyMsg: any = msg as any;
    if (anyMsg?.msgType === "gif") return true;
    const m = media?.[0];
    const t = String(m?.type || "").toLowerCase();
    const mt = String(m?.mimeType || "").toLowerCase();
    return t === "gif" || mt === "image/gif";
  }, [msg, media]);

  const dims = useMemo(() => {
    // Slightly larger for images/videos, a bit smaller for GIFs
    if (isGif) return { width: 200, height: 200 };
    if (mediaType === "image") return { width: 240, height: 240 };
    if (mediaType === "video") return { width: 240, height: 240 };
    return { width: 220, height: 220 };
  }, [isGif, mediaType]);

  const firstMediaUrl = media?.[0]?.url;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remoteRaw = firstMediaUrl;
        // Skip placeholder URLs used for pending media uploads
        const isPlaceholder = remoteRaw === "__pending__";
        const remoteCdn = !isPlaceholder
          ? remoteRaw && !/^https?:/i.test(remoteRaw)
            ? buildCdnPath(remoteRaw)
            : remoteRaw
          : undefined;
        const uri = await resolveDisplayUri(
          String((msg as any)?.id || (msg as any)?._id || ""),
          remoteCdn
        );
        if (!cancelled) setDisplayUri(uri);
      } catch {
        if (!cancelled && firstMediaUrl !== "__pending__") setDisplayUri(firstMediaUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [msg?.id, firstMediaUrl]);

  const showDownload = useMemo(() => {
    // Only for non-mine media messages with a remote URL and not yet marked downloaded
    if (isMe) return false;
    if (!mediaType) return false;
    if (isGif) return false; // don't download gifs; use remote URL
    const remote = media?.[0]?.url;
    if (!remote) return false;
    if (isDownloaded) return false;
    // If we already resolved a local URI, no need to show
    if (displayUri && displayUri.startsWith("file")) return false;
    return true;
  }, [isMe, mediaType, media, isDownloaded, displayUri]);

  const isSending = useMemo(() => {
    const st = String((msg as any)?.status || "").toLowerCase();
    return isMe && (st === "sending" || st === "pending");
  }, [msg, isMe]);

  const onDownload = useCallback(async () => {
    if (!mediaType) return;
    if (isGif) return; // no download for gifs
    const remoteRaw = media?.[0]?.url;
    const remote =
      remoteRaw && !/^https?:/i.test(remoteRaw)
        ? buildCdnPath(remoteRaw)
        : remoteRaw;
    if (!remote) return;
    try {
      setDownloading(true);
      setProgress(0);
      const res = await downloadToLocal(
        remote,
        String((msg as any)?.id || (msg as any)?._id || ""),
        mediaType,
        (pct) => setProgress(pct)
      );
      setDisplayUri(res.localUri);
      // Mark downloaded server-side and locally
      try {
        ws.emitAuthed(DMSocketEvent.markAsDownloaded, {
          dmId: (msg as any)?.conversationId || (msg as any)?.conversation,
          messageId: (msg as any)?.id,
        });
      } catch {}
      try {
        const cId = String(
          (msg as any)?.conversationId || (msg as any)?.conversation || ""
        );
        const mId = String((msg as any)?.id || (msg as any)?._id || "");
        if (cId && mId)
          dmActions.upsertMessages(cId, [
            { _id: mId, isDownloaded: true } as any,
          ]);
      } catch {}
    } catch {
      // ignore for now
    } finally {
      setDownloading(false);
    }
  }, [media, mediaType, msg, ws]);

  return (
    <View>
      {showMeta ? (
        <Text
          className={`text-theme-neutrals-500 text-[11px] mb-1 ${
            isMe ? "self-end text-right" : "self-start text-left"
          }`}
        >
          {statusLabel ? `${tsLabel} • ${statusLabel}` : tsLabel}
        </Text>
      ) : null}
      {media && media.length > 0 && media.some((m) => !!m.url) && (
        <View>
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={onLongPress}
            onPress={() => {
              if (isSending || showDownload) {
                onPressHideMeta();
                return;
              }
              if (mediaType === "video") {
                const raw = media?.[0]?.url;
                const uri = displayUri || (raw ? (/^https?:/i.test(raw) ? raw : (buildCdnPath(raw) as string)) : undefined);
                if (uri && onOpenVideo) onOpenVideo(uri);
                onPressHideMeta();
                return;
              }
              // Open image viewer (including GIF)
              const uri = displayUri || media?.[0]?.url;
              if (uri)
                navigation.navigate(ScreenNames.ImageViewer as any, {
                  images: [{ uri }],
                  index: 0,
                  isModal: true,
                });
            }}
            className={`max-w-[82%] ${align}`}
          >
            <View className="rounded-2xl overflow-hidden bg-theme-neutrals-800">
              <View
                style={{ width: dims.width, height: dims.height }}
                className="items-center justify-center"
              >
                {!imgLoaded && (displayUri || (media?.[0]?.url && media[0].url !== "__pending__")) ? (
                  <View className="absolute inset-0 items-center justify-center bg-theme-neutrals-800">
                    <ActivityIndicator size="small" />
                  </View>
                ) : null}
                {displayUri || (media?.[0]?.url && media[0].url !== "__pending__") ? (
                  <Image
                    source={{ uri: displayUri || (media?.[0]?.url as string) }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                    onLoadStart={() => setImgLoaded(false)}
                    onLoadEnd={() => setImgLoaded(true)}
                  />
                ) : (
                  <View className="absolute inset-0 items-center justify-center bg-theme-neutrals-800">
                    <ActivityIndicator size="small" />
                  </View>
                )}
                {/* Top-left icon badge (only when not sending and not needing download) */}
                {!isSending && !showDownload ? (
                  <View className="absolute top-2 left-2">
                    {isGif ? (
                      <View className="bg-black/60 px-2 py-0.5 rounded">
                        <Text className="text-white text-[11px] font-semibold">
                          GIF
                        </Text>
                      </View>
                    ) : mediaType === "image" ? (
                      <Ionicons name="image-outline" size={16} color="#fff" />
                    ) : mediaType === "video" ? (
                      <Ionicons
                        name="videocam-outline"
                        size={16}
                        color="#fff"
                      />
                    ) : null}
                  </View>
                ) : null}
                {isSending ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/35">
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                ) : null}
                {/* Video play overlay when ready */}
                {!isSending && !showDownload && mediaType === "video" ? (
                  <View className="absolute inset-0 items-center justify-center">
                    <Ionicons name="play-circle" size={56} color="#FFFFFF" />
                  </View>
                ) : null}
                {showDownload && !isGif ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/25">
                    <TouchableOpacity
                      onPress={onDownload}
                      disabled={downloading}
                      className="items-center justify-center"
                    >
                      {downloading ? (
                        <Text className="text-white text-xs">{progress}%</Text>
                      ) : (
                        <Ionicons
                          name="arrow-down-circle"
                          size={36}
                          color="#FFFFFF"
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
                {!showDownload &&
                isDownloaded &&
                displayUri &&
                !displayUri.startsWith("file") ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/25">
                    <Ionicons name="alert-circle" size={28} color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              {msg.text ? (
                <View className="px-3 py-2">
                  <Text
                    className={`text-[15px] ${
                      isMe ? "text-white" : "text-theme-neutrals-100"
                    }`}
                  >
                    {msg.text}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
          {/* Video player is rendered at ChatScreen level */}
        </View>
      )}
      {(!media || media.length === 0 || !media.some((m) => !!m.url)) && (
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={onLongPress}
          onPress={onPressHideMeta}
          className={`max-w-[82%] rounded-2xl px-3 py-2 ${bg} ${align}`}
        >
          {msg.text ? (
            <Text
              className={`text-[15px] ${
                isMe ? "text-white" : "text-theme-neutrals-100"
              }`}
            >
              {msg.text}
            </Text>
          ) : null}
        </TouchableOpacity>
      )}
    </View>
  );
});
MessageBubble.displayName = "MessageBubble";
export default MessageBubble;
