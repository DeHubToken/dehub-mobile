/**
 * Bubble content for an end-to-end encrypted attachment.
 *
 * The CDN only holds ciphertext, so the bubble downloads it, opens it with the
 * key from the message's descriptor and shows the plaintext from a cached
 * file. Until then it shows the sender's tiny blurred placeholder; a file
 * that cannot be fetched or opened says so and can be retried.
 *
 * Photos and voice notes open as soon as they are on screen. Videos and
 * documents wait for a tap, since they can be large.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import VoiceNotePlayer from "../Comments/VoiceNotePlayer";
import { toastError } from "../../libs/toast";
import { formatAttachmentSize, getAttachmentLabel } from "../../libs/attachments";
import type { MediaDescriptor } from "../../libs/dm-e2ee/media";
import { cachedPlaintext, deleteQuietly, encryptedMediaUrl, openEncryptedMedia, shareDecryptedFile } from "../../libs/dm-e2ee/media-files";

const MIN_W = 160;
const MAX_H = 320;
const DEFAULT_ASPECT = 4 / 3;

type Status = "idle" | "loading" | "ready" | "error";

function useDecryptedMedia(url: string | null, d: MediaDescriptor, messageId: string, auto: boolean) {
  const [status, setStatus] = useState<Status>("idle");
  const [uri, setUri] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const start = useCallback(async (): Promise<string | null> => {
    if (!url) return null;
    setStatus("loading");
    setProgress(0);
    try {
      const file = await openEncryptedMedia({
        url,
        descriptor: d,
        messageId,
        onProgress: (p) => { if (alive.current) setProgress(p); },
      });
      if (alive.current) {
        setUri(file);
        setStatus("ready");
      }
      return file;
    } catch {
      if (alive.current) setStatus("error");
      return null;
    }
  }, [url, d, messageId]);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    setStatus("idle");
    if (!url) return;
    void cachedPlaintext(url, d).then((hit) => {
      if (cancelled) return;
      if (hit) {
        setUri(hit);
        setStatus("ready");
      } else if (auto) {
        void start();
      }
    });
    return () => { cancelled = true; };
    // `d` is stable per message; keying on its key avoids refetching on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, d.k, auto]);

  // A cached file that will not render is thrown away and opened again, once.
  const rebuilt = useRef(false);
  const rebuild = useCallback(async () => {
    if (rebuilt.current || !uri) {
      setStatus("error");
      setUri(null);
      return;
    }
    rebuilt.current = true;
    await deleteQuietly(uri);
    setUri(null);
    void start();
  }, [uri, start]);

  return { status, uri, progress, start, rebuild };
}

interface Props {
  descriptor: MediaDescriptor;
  /** Raw mediaUrls entry; absent while the server is still storing the upload. */
  rawUrl?: string | null;
  messageId: string;
  isMine: boolean;
  onVideoPress?: (uri: string) => void;
  onLongPress?: () => void;
}

const Percent: React.FC<{ progress: number }> = ({ progress }) => (
  <Text className="text-[11px] text-white/80 mt-1">{Math.round(progress * 100)}%</Text>
);

const EncryptedMediaComponent: React.FC<Props> = ({
  descriptor: d,
  rawUrl,
  messageId,
  isMine,
  onVideoPress,
  onLongPress,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { width: windowWidth } = useWindowDimensions();
  const url = encryptedMediaUrl(rawUrl);
  const auto = d.kind === "image" || d.kind === "audio";
  const { status, uri, progress, start, rebuild } = useDecryptedMedia(url, d, messageId, auto);
  const shown = uri;

  const maxW = Math.round(windowWidth * 0.75 - 24);
  const aspect = d.w && d.h ? d.w / d.h : DEFAULT_ASPECT;
  let boxW = maxW;
  let boxH = boxW / aspect;
  if (boxH > MAX_H) {
    boxH = MAX_H;
    boxW = boxH * aspect;
  }
  boxW = Math.max(Math.round(boxW), MIN_W);
  boxH = Math.round(boxH);

  const openVideo = useCallback(async () => {
    const file = uri || (await start());
    if (file) onVideoPress?.(file);
  }, [uri, start, onVideoPress]);

  const openImage = useCallback(() => {
    if (shown) navigation.navigate("ImageViewer", { images: [shown], initialIndex: 0 });
    else if (status === "error" || status === "idle") void start();
  }, [shown, status, start, navigation]);

  const openFile = useCallback(async () => {
    const file = uri || (await start());
    if (!file) return;
    try {
      await shareDecryptedFile(file, d);
    } catch {
      toastError(t("dm.couldntOpenFile"));
    }
  }, [uri, start, d, t]);

  const overlay = (icon: "Play" | null) => (
    <View className="absolute inset-0 items-center justify-center">
      {status === "loading" ? (
        <View className="dark-surface bg-black/50 rounded-xl px-3 py-2 items-center">
          <ActivityIndicator color="#fff" size="small" />
          {progress > 0 && <Percent progress={progress} />}
        </View>
      ) : status === "error" ? (
        <View className="dark-surface bg-black/60 rounded-xl px-3 py-2 items-center">
          <Icon name="CircleAlert" size={22} color="#F4F4F5" />
          <Text className="text-[11px] text-white/90 mt-1 font-medium">{t("dm.failedToLoad")}</Text>
          <Text className="text-[11px] text-white/60">{t("common.retry")}</Text>
        </View>
      ) : icon ? (
        <View className="dark-surface bg-black/50 rounded-xl p-2">
          <Icon name={icon} size={24} color="#fff" />
        </View>
      ) : !url && !shown ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : null}
    </View>
  );

  const placeholder = d.thumb ? (
    <SmartImage
      source={{ uri: d.thumb }}
      style={{ width: boxW, height: boxH }}
      contentFit="cover"
      cachePolicy="none"
      blurRadius={12}
    />
  ) : null;

  if (d.kind === "image") {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={openImage} onLongPress={onLongPress} delayLongPress={350}>
        <View className="bg-theme-neutrals-700" style={{ width: boxW, height: boxH }}>
          {shown ? (
            <SmartImage
              source={{ uri: shown }}
              recyclingKey={shown}
              style={{ width: boxW, height: boxH }}
              contentFit="cover"
              // Plaintext stays in our own cache file, not expo-image's disk cache.
              cachePolicy="memory"
              onError={() => { void rebuild(); }}
            />
          ) : (
            placeholder
          )}
          {!shown && overlay(null)}
        </View>
      </TouchableOpacity>
    );
  }

  if (d.kind === "video") {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={openVideo} onLongPress={onLongPress} delayLongPress={350}>
        <View className="bg-theme-neutrals-700" style={{ width: boxW, height: boxH }}>
          {placeholder}
          {overlay(status === "loading" || status === "error" ? null : "Play")}
          {(d.dur || d.size) && status !== "loading" ? (
            <View className="absolute bottom-1.5 left-1.5 dark-surface bg-black/60 rounded px-1.5 py-0.5">
              <Text className="text-[11px] text-white font-medium">
                {d.dur ? `${Math.floor(d.dur / 60)}:${String(Math.round(d.dur % 60)).padStart(2, "0")}` : formatAttachmentSize(d.size)}
              </Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  if (d.kind === "audio") {
    if (shown) {
      return (
        <View className="px-2 min-w-[200px]">
          <VoiceNotePlayer audioUrl={shown} duration={d.dur ?? undefined} compact />
        </View>
      );
    }
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => { if (status === "error") void start(); }}
        onLongPress={onLongPress}
        delayLongPress={350}
        className="flex-row items-center px-3 py-2.5 gap-2.5 min-w-[200px]"
      >
        <View className={`w-8 h-8 rounded-xl items-center justify-center ${isMine ? "bg-white/15" : "bg-accent/20"}`}>
          {status === "error" ? (
            <Icon name="CircleAlert" size={16} color={isMine ? "#fff" : "#F4F4F5"} />
          ) : (
            <ActivityIndicator size="small" color={isMine ? "#fff" : "#F4F4F5"} />
          )}
        </View>
        <Text className={`text-[11px] ${isMine ? "text-white/70" : "text-theme-neutrals-500"}`}>
          {status === "error"
            ? `${t("dm.failedToLoad")} · ${t("common.retry")}`
            : d.dur
              ? `${Math.floor(d.dur / 60)}:${String(Math.round(d.dur % 60)).padStart(2, "0")}`
              : t("dm.voiceNote")}
        </Text>
      </TouchableOpacity>
    );
  }

  // Document
  const name = d.name || t("dm.attachment");
  return (
    <TouchableOpacity
      onPress={openFile}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={name}
      className="flex-row items-center px-3 py-2.5"
      style={{ maxWidth: maxW }}
      disabled={!url}
    >
      <View className={`w-9 h-9 rounded-lg items-center justify-center mr-2.5 ${isMine ? "bg-white/15" : "bg-theme-neutrals-700"}`}>
        <Icon name="FileText" size={18} color={isMine ? "#fff" : "#F4F4F5"} />
      </View>
      <View className="flex-1">
        <Text className={`text-[14px] font-medium ${isMine ? "text-white" : "text-theme-neutrals-100"}`} numberOfLines={1}>
          {name}
        </Text>
        <Text className={`text-[11px] mt-0.5 ${isMine ? "text-white/70" : "text-theme-neutrals-500"}`}>
          {status === "error"
            ? `${t("dm.failedToLoad")} · ${t("common.retry")}`
            : status === "loading"
              ? `${Math.round(progress * 100)}%`
              : `${getAttachmentLabel(d.name || "")}${d.size ? ` · ${formatAttachmentSize(d.size)}` : ""}`}
        </Text>
      </View>
      {status === "loading" || !url ? (
        <ActivityIndicator size="small" color={isMine ? "#ffffffaa" : "#8B8D90"} />
      ) : (
        <Icon name="Download" size={16} color={isMine ? "#ffffffaa" : "#8B8D90"} />
      )}
    </TouchableOpacity>
  );
};

export default memo(EncryptedMediaComponent);
