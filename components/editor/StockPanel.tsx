import React, { useRef, useState } from "react";
import { Image, Linking, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { importStockItem, searchStock, type StockItem, type StockKind } from "../../libs/editor/stock";
import type { MediaMeta } from "../../libs/editor/storage";
import DeHubLoader from "../DeHubLoader";

export default function StockPanel({ onAdd }: { onAdd: (media: MediaMeta) => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<StockKind>("video");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const request = useRef(0);
  const search = async () => {
    if (!query.trim() || busy) return;
    const token = ++request.current;
    setBusy(true); setStatus(null); setItems([]);
    try {
      const found = await searchStock(query.trim(), "all", kind);
      if (token !== request.current) return;
      setItems(found);
      if (!found.length) setStatus(t("common.noResults"));
    } catch { if (token === request.current) setStatus(t("common.failedToLoad")); }
    finally { if (token === request.current) setBusy(false); }
  };
  const add = async (item: StockItem) => {
    if (importing) return;
    setImporting(item.downloadUrl); setStatus(null);
    try {
      const media = await importStockItem(item, kind);
      if (media) onAdd(media);
      else setStatus(t("common.failedToLoad"));
    } finally { setImporting(null); }
  };
  return <View style={{ gap: 12 }}>
    <View className="flex-row" style={{ gap: 8 }}>
      {(["photo", "video", "audio"] as StockKind[]).map(k => <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: k === kind }}
        onPress={() => { request.current++; setKind(k); setItems([]); setStatus(null); setBusy(false); }}
        disabled={!!importing} className={`rounded-full px-4 py-2 ${kind === k ? "bg-white" : "bg-white/10"}`}>
        <Text className={kind === k ? "text-black" : "text-white"}>{t(k === "photo" ? "editor.app.photo" : k === "video" ? "editor.video.video" : "editor.video.sound")}</Text>
      </Pressable>)}
    </View>
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <TextInput value={query} onChangeText={setQuery} placeholder={t("common.search")} placeholderTextColor="#888"
        accessibilityLabel={t("common.search")} returnKeyType="search" onSubmitEditing={() => { void search(); }}
        className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-white" />
      <Pressable accessibilityRole="button" onPress={() => { void search(); }} disabled={busy || !query.trim()} className="rounded-xl bg-white px-4 py-2">
        <Text className="text-black">{t("common.search")}</Text>
      </Pressable>
    </View>
    {busy && <DeHubLoader size={28} />}
    {status && <Text className="text-theme-neutrals-400">{status}</Text>}
    {items.map(item => <View key={item.downloadUrl} className="rounded-xl border border-white/10 p-3" style={{ gap: 6 }}>
      {item.thumbnailUrl && kind !== "audio" && <Image source={{ uri: item.thumbnailUrl }} style={{ width: "100%", height: 110, borderRadius: 8 }} resizeMode="cover" />}
      <Text className="text-white" numberOfLines={2}>{item.title}</Text>
      <Pressable accessibilityRole="link" disabled={!item.landingUrl} onPress={() => { if (item.landingUrl) void Linking.openURL(item.landingUrl); }}>
        <Text className="text-theme-neutrals-400 text-xs">{[item.creator, item.source, item.license].filter(Boolean).join(" · ")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!!importing} onPress={() => { void add(item); }} className="self-start rounded-lg bg-white px-4 py-2">
        <Text className="text-black">{t(importing === item.downloadUrl ? "common.loading" : "common.select")}</Text>
      </Pressable>
    </View>)}
  </View>;
}
