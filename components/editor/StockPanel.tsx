import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { importStockLibraryItem, searchStockPage, type StockItem, type StockLibraryKind, type StockOrientation } from "../../libs/editor/stock";
import { appendStockResults, createStockSearchSession } from "../../libs/editor/stockBrowser";
import { projectTask } from "../../libs/editor/projectTask";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";
import type { MediaMeta } from "../../libs/editor/storage";
import DeHubLoader from "../DeHubLoader";
import StockMediaPreview from "./StockMediaPreview";

const KINDS: Array<[StockLibraryKind, string]> = [["photo", "editor.app.photo"], ["video", "editor.video.video"], ["animation", "editor.motion.title"], ["graphic", "editor.rail.elements"], ["gif", "creatorPacks.tab.gif"], ["audio", "editor.video.sound"]];
const SHAPES: Array<[StockOrientation, string]> = [["all", "filters.any"], ["landscape", "editor.app.aspectWide"], ["portrait", "editor.app.aspectStory"], ["square", "editor.app.aspectSquare"]];

export default function StockPanel({ onAdd, at, scope, subscribe, onStart }: { onAdd: (media: MediaMeta, start: number) => void; at: number; scope: number; subscribe: (changed: () => void) => () => void; onStart: () => ProjectEditLease | null }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<StockLibraryKind>("video");
  const [orientation, setOrientation] = useState<StockOrientation>("all");
  const [query, setQuery] = useSurfaceDraft("components/editor/StockPanel.tsx:query", "");
  const [items, setItems] = useState<StockItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [preview, setPreview] = useState<StockItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const session = useRef(createStockSearchSession());
  const mounted = useRef(true), currentScope = useRef(scope); currentScope.current = scope;
  const importingTask = useRef<ReturnType<typeof projectTask>>(null);
  const invalidate = () => { session.current.cancel(); setItems([]); setPage(0); setHasMore(false); setBusy(false); setStatus(null); setPreview(null); };
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribe(() => { if (importingTask.current && !importingTask.current.isCurrent()) { importingTask.current.release(); importingTask.current = null; if (mounted.current) setImporting(null); } });
    return () => { mounted.current = false; session.current.cancel(); importingTask.current?.release(); importingTask.current = null; unsubscribe(); };
  }, [subscribe]);
  useEffect(() => { if (importingTask.current && !importingTask.current.isCurrent()) { importingTask.current.release(); importingTask.current = null; setImporting(null); } }, [scope]);
  const search = async (append = false) => {
    if (busy || importing || (append && !hasMore)) return;
    const ticket = session.current.begin();
    const nextPage = append ? page + 1 : 1;
    setBusy(true); setStatus(null); setPreview(null);
    if (!append) setItems([]);
    try {
      const result = await searchStockPage(query.trim(), orientation, kind, nextPage, ticket.signal);
      if (!ticket.current()) return;
      setItems(current => appendStockResults(append ? current : [], result.items));
      setPage(nextPage); setHasMore(result.hasMore);
      if (!result.items.length && !append) setStatus(t("common.noResults"));
    } catch { if (ticket.current()) setStatus(t("common.failedToLoad")); }
    finally { if (ticket.current()) setBusy(false); }
  };
  const add = async (item: StockItem) => {
    if (importingTask.current) return;
    const capturedScope = scope, start = at;
    const task = projectTask(onStart(), () => mounted.current && currentScope.current === capturedScope);
    if (!task) return;
    importingTask.current = task;
    setImporting(item.downloadUrl); setStatus(null);
    try {
      const media = await importStockLibraryItem(item, kind);
      if (!task.isCurrent()) return;
      if (media) onAdd(media, start);
      else setStatus(t("common.failedToLoad"));
    } finally {
      task.release();
      if (importingTask.current === task) { importingTask.current = null; if (mounted.current) setImporting(null); }
    }
  };
  return <View style={{ gap: 12 }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {KINDS.map(([k, label]) => <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: k === kind }}
        onPress={() => { if (k !== kind) { invalidate(); setKind(k); setOrientation("all"); } }}
        disabled={!!importing} className={`rounded-full px-4 py-2 ${kind === k ? "bg-white" : "bg-white/10"}`}>
        <Text className={kind === k ? "text-black" : "text-white"}>{t(label)}</Text>
      </Pressable>)}
    </ScrollView>
    {kind !== "audio" && <View className="flex-row" style={{ gap: 8 }}>
      {SHAPES.map(([shape, label]) => <Pressable key={shape} accessibilityRole="button" accessibilityState={{ selected: shape === orientation }} disabled={!!importing}
        onPress={() => { if (shape !== orientation) { invalidate(); setOrientation(shape); } }} className={`rounded-lg px-3 py-1 ${shape === orientation ? "bg-white/20" : "bg-white/5"}`}><Text className="text-white text-xs">{t(label)}</Text></Pressable>)}
    </View>}
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <TextInput value={query} onChangeText={value => { invalidate(); setQuery(value); }} editable={!importing} placeholder={t("common.search")} placeholderTextColor="#888"
        accessibilityLabel={t("common.search")} returnKeyType="search" onSubmitEditing={() => { void search(); }}
        className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-white" />
      <Pressable accessibilityRole="button" onPress={() => { void search(); }} disabled={busy || !!importing} className="rounded-xl bg-white px-4 py-2">
        <Text className="text-black">{t("common.search")}</Text>
      </Pressable>
    </View>
    {busy && <DeHubLoader size={28} />}
    {status && <Text className="text-theme-neutrals-400">{status}</Text>}
    {preview && <StockMediaPreview key={preview.downloadUrl} item={preview} onClose={() => setPreview(null)} />}
    {items.map(item => <View key={item.downloadUrl} className="rounded-xl border border-white/10 p-3" style={{ gap: 6 }}>
      {item.thumbnailUrl && kind !== "audio" && <Image source={{ uri: item.thumbnailUrl }} style={{ width: "100%", height: 110, borderRadius: 8 }} contentFit="cover" />}
      <Text className="text-white" numberOfLines={2}>{item.title}</Text>
      <Pressable accessibilityRole="link" disabled={!item.landingUrl} onPress={() => { if (item.landingUrl) void Linking.openURL(item.landingUrl); }}>
        <Text className="text-theme-neutrals-400 text-xs">{[item.creator, item.source, item.license].filter(Boolean).join(" · ")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t("editor.shots.preview")} ${item.title}`} onPress={() => setPreview(preview?.downloadUrl === item.downloadUrl ? null : item)} className="self-start rounded-lg bg-white/10 px-4 py-2">
        <Text className="text-white">{t("editor.shots.preview")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!!importing} onPress={() => { void add(item); }} className="self-start rounded-lg bg-white px-4 py-2">
        <Text className="text-black">{t(importing === item.downloadUrl ? "common.loading" : "common.select")}</Text>
      </Pressable>
    </View>)}
    {hasMore && <Pressable accessibilityRole="button" disabled={busy || !!importing} onPress={() => { void search(true); }} className="rounded-xl bg-white/10 px-4 py-2">
      <Text className="text-white">{t("notifications.loadMore")}</Text>
    </Pressable>}
  </View>;
}
