/**
 * Creator packs inside the chat picker: the Stickers tab, and the pack row
 * above the GIF search — the mobile twin of dehubweb's
 * components/app/packs/PackPickerParts.tsx. Picking a sticker or a pack GIF
 * sends it down the same path as a GIPHY GIF (`onPick(url)`), so every chat
 * surface that already takes GIFs takes these with no changes of its own.
 */

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import { usePickerPacks, type CreatorPack, type PackItem, type PackKind } from "../../libs/creator-packs/api";
import { usePackWallet, usePacksNavigation } from "./PackGate";

export function PackCover({ pack, size }: { pack: Pick<CreatorPack, "cover_url" | "name">; size: number }) {
  return pack.cover_url ? (
    <SmartImage
      source={{ uri: pack.cover_url }}
      recyclingKey={pack.cover_url}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  ) : (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Text className="text-[10px] font-semibold text-theme-neutrals-400">{pack.name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

export function PackStrip({
  packs,
  active,
  onChange,
  leading,
  beforeLeave,
}: {
  packs: CreatorPack[];
  active: string | null;
  onChange: (id: string | null) => void;
  /** A first chip for the non-pack source (GIPHY), selected when `active` is null. */
  leading?: string;
  /** Closes the picker before the packs screen opens. */
  beforeLeave?: () => void;
}) {
  const { t } = useTranslation();
  const { openPacks } = usePacksNavigation(beforeLeave);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 4, paddingVertical: 6, alignItems: "center" }}
      style={{ flexGrow: 0 }}
    >
      {leading && (
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === null }}
          className={`h-9 px-3 rounded-lg items-center justify-center ${active === null ? "bg-white/15" : ""}`}
        >
          <Text className={`text-[11px] font-semibold ${active === null ? "text-white" : "text-theme-neutrals-400"}`}>
            {leading}
          </Text>
        </Pressable>
      )}
      {packs.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onChange(p.id)}
          accessibilityRole="tab"
          accessibilityLabel={p.name}
          accessibilityState={{ selected: active === p.id }}
          className={`w-9 h-9 rounded-lg overflow-hidden items-center justify-center ${
            active === p.id ? "bg-white/15 border border-white/40" : ""
          }`}
        >
          <PackCover pack={p} size={30} />
        </Pressable>
      ))}
      <Pressable
        onPress={openPacks}
        accessibilityRole="button"
        accessibilityLabel={t("creatorPacks.manage")}
        className="w-9 h-9 rounded-lg items-center justify-center"
      >
        <Icon name="Plus" size={16} color="#A1A1AA" />
      </Pressable>
    </ScrollView>
  );
}

export function PackGrid({ kind, items, onSelect }: { kind: PackKind; items: PackItem[]; onSelect: (url: string) => void }) {
  const gif = kind === "gif";
  return (
    <View className="flex-row flex-wrap">
      {items.map((it) => (
        <Pressable
          key={it.id}
          onPress={() => onSelect(it.image_url)}
          accessibilityRole="button"
          accessibilityLabel={it.emoji ?? undefined}
          className={gif ? "w-1/2 p-1" : "w-1/4 p-1"}
        >
          <View
            className={`w-full rounded-lg overflow-hidden ${gif ? "bg-theme-neutrals-800" : "p-1"}`}
            style={{ aspectRatio: gif ? 16 / 9 : 1 }}
          >
            <SmartImage
              source={{ uri: it.image_url }}
              recyclingKey={it.image_url}
              style={{ width: "100%", height: "100%" }}
              contentFit={gif ? "cover" : "contain"}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function EmptyPacks({ kind, beforeLeave }: { kind: PackKind; beforeLeave?: () => void }) {
  const { t } = useTranslation();
  const { openPacks } = usePacksNavigation(beforeLeave);
  return (
    <View className="items-center px-4 py-8" style={{ gap: 10 }}>
      <Text className="text-xs text-theme-neutrals-400 text-center">
        {t(kind === "gif" ? "creatorPacks.emptyGifs" : "creatorPacks.emptyStickers")}
      </Text>
      <Pressable
        onPress={openPacks}
        accessibilityRole="button"
        className="h-8 px-3 rounded-lg bg-white items-center justify-center"
      >
        <Text className="text-black text-xs font-semibold">{t("creatorPacks.browseCreate")}</Text>
      </Pressable>
    </View>
  );
}

/** The Stickers tab. */
export function StickerPanel({ onSelect, beforeLeave }: { onSelect: (url: string) => void; beforeLeave?: () => void }) {
  const wallet = usePackWallet();
  const { packs, items, loading } = usePickerPacks(wallet, "sticker");
  const [active, setActive] = useState<string | null>(null);
  const current = active && packs.some((p) => p.id === active) ? active : packs[0]?.id ?? null;

  if (loading) {
    return (
      <View className="py-8 items-center justify-center">
        <ActivityIndicator size="small" color="#F4F4F5" />
      </View>
    );
  }
  if (!packs.length) return <EmptyPacks kind="sticker" beforeLeave={beforeLeave} />;
  return (
    <View className="flex-1">
      <PackStrip packs={packs} active={current} onChange={setActive} beforeLeave={beforeLeave} />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <PackGrid kind="sticker" items={(current && items[current]) || []} onSelect={onSelect} />
      </ScrollView>
    </View>
  );
}

/** GIF packs for the GIF tab: the strip, and the selected pack's items (null = show GIPHY). */
export function useGifPacks() {
  const wallet = usePackWallet();
  const { packs, items } = usePickerPacks(wallet, "gif");
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (active && !packs.some((p) => p.id === active)) setActive(null);
  }, [active, packs]);
  return { packs, items: active ? items[active] ?? [] : null, active, setActive };
}
