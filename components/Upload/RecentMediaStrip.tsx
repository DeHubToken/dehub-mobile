/**
 * The creator's latest photos and videos, in a row above the composer's
 * toolbar. One tap adds one, numbered in the order they were added; a video
 * greys out once photos are in (a post holds photos or one video). "All"
 * opens the full picker.
 *
 * Asks for library access only when the creator taps the row's first tile, so
 * opening the composer never brings up a permission prompt by itself.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";

export interface RecentPick {
  uri: string;
  assetId: string;
  type: "image" | "video";
  width: number;
  height: number;
  fileName: string;
  /** Milliseconds, as ImagePicker reports it. */
  duration?: number;
  mimeType?: string;
}

interface Props {
  /** Asset ids already in the post, in order, for the numbers. */
  pickedIds: string[];
  /** Photos are in: videos can't join them. */
  photosPicked: boolean;
  full: boolean;
  onPick: (pick: RecentPick) => void;
  onOpenAll: () => void;
}

const TILE = 64;

function guessMime(name: string, type: "image" | "video") {
  const ext = name.toLowerCase().split(".").pop();
  if (type === "video") return ext === "mov" ? "video/quicktime" : "video/mp4";
  if (ext === "png") return "image/png";
  if (ext === "heic") return "image/heic";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function RecentMediaStrip({ pickedIds, photosPicked, full, onPick, onOpenAll }: Props) {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<MediaLibrary.Asset[] | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: 30,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setAssets(page.assets);
    } catch {
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    let live = true;
    MediaLibrary.getPermissionsAsync(false, ["photo", "video"])
      .then((p) => {
        if (!live) return;
        const ok = p.granted || p.accessPrivileges === "limited";
        setAllowed(ok);
        if (ok) void load();
      })
      .catch(() => live && setAllowed(false));
    return () => {
      live = false;
    };
  }, [load]);

  const ask = useCallback(async () => {
    try {
      const p = await MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]);
      const ok = p.granted || p.accessPrivileges === "limited";
      setAllowed(ok);
      if (ok) void load();
      else onOpenAll();
    } catch {
      onOpenAll();
    }
  }, [load, onOpenAll]);

  const pick = useCallback(
    async (a: MediaLibrary.Asset) => {
      if (busy) return;
      setBusy(a.id);
      try {
        // iOS hands out ph:// ids; the upload needs a real file.
        const info = await MediaLibrary.getAssetInfoAsync(a, { shouldDownloadFromNetwork: true });
        const uri = info.localUri || a.uri;
        const type = a.mediaType === MediaLibrary.MediaType.video ? "video" : "image";
        onPick({
          uri,
          assetId: a.id,
          type,
          width: a.width,
          height: a.height,
          fileName: a.filename,
          duration: type === "video" ? a.duration * 1000 : undefined,
          mimeType: guessMime(a.filename, type),
        });
      } catch {
        onOpenAll();
      } finally {
        setBusy(null);
      }
    },
    [busy, onPick, onOpenAll],
  );

  if (allowed === null) return null;

  if (!allowed) {
    return (
      <View className="px-4 pt-2">
        <Pressable
          onPress={ask}
          className="flex-row items-center self-start rounded-full px-3 py-1.5 bg-white/10"
          accessibilityRole="button"
        >
          <Icon name="Image" size={16} color="#fff" />
          <Text className="text-white text-xs ml-2">{t("upload.recent.show", { defaultValue: "Show recent photos" })}</Text>
        </Pressable>
      </View>
    );
  }

  if (!assets?.length) return null;

  return (
    <View style={{ height: TILE + 8 }}>
    <FlatList
      horizontal
      style={{ flexGrow: 0 }}
      data={assets}
      keyExtractor={(a) => a.id}
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, gap: 6 }}
      initialNumToRender={8}
      ListHeaderComponent={
        <Pressable
          onPress={onOpenAll}
          style={{ width: TILE, height: TILE, borderRadius: 12 }}
          className="items-center justify-center bg-white/10 mr-1.5"
          accessibilityRole="button"
          accessibilityLabel={t("upload.recent.all", { defaultValue: "All" })}
        >
          <Icon name="Images" size={20} color="#fff" />
          <Text className="text-white text-[11px] mt-1">{t("upload.recent.all", { defaultValue: "All" })}</Text>
        </Pressable>
      }
      renderItem={({ item }) => {
        const isVideo = item.mediaType === MediaLibrary.MediaType.video;
        const order = pickedIds.indexOf(item.id);
        const blocked = order < 0 && (full || (isVideo && photosPicked));
        return (
          <Pressable
            onPress={() => !blocked && order < 0 && void pick(item)}
            disabled={blocked || order >= 0}
            style={{ width: TILE, height: TILE, borderRadius: 12, overflow: "hidden", opacity: blocked ? 0.35 : 1 }}
            accessibilityRole="button"
            accessibilityState={{ selected: order >= 0, disabled: blocked }}
          >
            <Image source={{ uri: item.uri }} style={{ width: TILE, height: TILE }} resizeMethod="resize" />
            {isVideo ? (
              <View className="absolute bottom-1 left-1 rounded px-1 bg-black/60">
                <Text className="text-white text-[10px]">{clock(item.duration)}</Text>
              </View>
            ) : null}
            {order >= 0 ? (
              <View
                className="absolute top-1 right-1 items-center justify-center bg-white"
                style={{ width: 20, height: 20, borderRadius: 10 }}
              >
                <Text className="text-black text-[11px] font-bold">{order + 1}</Text>
              </View>
            ) : (
              <View
                className="absolute top-1 right-1 border border-white/80 bg-black/20"
                style={{ width: 20, height: 20, borderRadius: 10 }}
              />
            )}
            {busy === item.id ? <View className="absolute inset-0 bg-black/40" /> : null}
          </Pressable>
        );
      }}
    />
    </View>
  );
}
