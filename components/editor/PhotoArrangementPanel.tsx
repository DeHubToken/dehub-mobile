import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { arrangeDesignPhotos, designPagePhotos, photoSourceOrder } from "../../libs/editor/photoArrangement";
import type { ReplacementMedia } from "../../libs/editor/replaceMedia";
import { getMedia } from "../../libs/editor/storage";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function PhotoArrangementPanel({ project, time, selectedId, current, commit }: { project: ProjectSnapshot; time: number; selectedId: string | null; current: () => ProjectSnapshot | null; commit: (project: ProjectSnapshot) => void }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<"page" | "group">("page"), [from, setFrom] = useState(""), [to, setTo] = useState(""), [error, setError] = useState("");
  const [picking, setPicking] = useState<"from" | "to">("from"), [offset, setOffset] = useState(0), [busy, setBusy] = useState(false);
  const working = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const groupId = project.clips.find(clip => clip.id === selectedId)?.groupId;
  const photos = scope === "group" && !groupId ? [] : designPagePhotos(project, time, scope === "group" ? groupId : undefined), ids = photos.map(clip => clip.id);
  const first = ids.includes(from) ? from : ids.includes(selectedId ?? "") ? selectedId! : ids[0] ?? "", second = ids.includes(to) && to !== first ? to : ids.find(id => id !== first) ?? "";
  const page = Math.min(offset, Math.max(0, Math.floor((photos.length - 1) / 12) * 12));
  const label = (id: string) => { const clip = photos.find(clip => clip.id === id); return clip?.label || project.tracks.find(track => track.id === clip?.trackId)?.name || t("editor.photos.number", { defaultValue: "Photo {{number}}", number: ids.indexOf(id) + 1 }); };
  const button = (label: string, press: () => void, disabled = false, active = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, selected: active }} disabled={disabled || busy} onPress={press} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`} style={{ opacity: disabled || busy ? 0.35 : 1 }}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  const apply = async (action: "swap" | "rotate" | "shuffle") => {
    if (working.current) return; working.current = true; setBusy(true);
    try {
      const before = current(); if (!before || before.id !== project.id) return;
      const chosen = action === "swap" ? [first, second] : ids;
      if (chosen.length < 2 || chosen.length > 100) throw new Error("Choose 2–100 photo frames to rearrange");
      const sourceIds = [...new Set(chosen.flatMap(id => { const clip = before.clips.find(clip => clip.id === id); return clip?.kind === "image" ? [clip.mediaId] : []; }))], metadata = new Map<string, ReplacementMedia>();
      for (let index = 0; index < sourceIds.length; index += 16) {
        const entries = await Promise.all(sourceIds.slice(index, index + 16).map(id => getMedia(id)));
        if (!mounted.current) return;
        if (current() !== before) throw new Error("The design changed while loading photos. Try rearranging them again");
        for (const entry of entries) if (entry) metadata.set(entry.id, entry);
      }
      if (!mounted.current || current() !== before) return;
      const next = arrangeDesignPhotos(before, chosen, action === "swap" ? [1, 0] : photoSourceOrder(chosen.length, action), metadata);
      if (next !== before) commit(next); setError("");
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Could not rearrange these photos"); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 10 }}><Text className="text-xs font-semibold text-white/80">{t("editor.photos.arrange", { defaultValue: "Rearrange photos" })}</Text><View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["page", "group"] as const).map(value => button(t(`editor.photos.scope.${value}`, { defaultValue: value === "page" ? "Current page" : "Selected group" }), () => { setScope(value); setOffset(0); }, value === "group" && !groupId, scope === value))}</View>
    {photos.length >= 2 ? <><View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(`${t("editor.photos.first", { defaultValue: "First photo frame" })}: ${ids.indexOf(first) + 1}`, () => setPicking("from"), false, picking === "from")}{button(`${t("editor.photos.second", { defaultValue: "Second photo frame" })}: ${ids.indexOf(second) + 1}`, () => setPicking("to"), false, picking === "to")}</View><View className="flex-row flex-wrap" style={{ gap: 6 }}>{photos.slice(page, page + 12).map(photo => button(`${ids.indexOf(photo.id) + 1}. ${label(photo.id).slice(0, 36)}`, () => (picking === "from" ? setFrom : setTo)(photo.id), false, (picking === "from" ? first : second) === photo.id))}</View>{photos.length > 12 && <View className="flex-row items-center justify-between" style={{ gap: 8 }}>{button(t("common.previous", { defaultValue: "Previous" }), () => setOffset(page - 12), !page)}<Text className="text-xs text-white/45">{Math.floor(page / 12) + 1} / {Math.ceil(photos.length / 12)}</Text>{button(t("common.next", { defaultValue: "Next" }), () => setOffset(page + 12), page + 12 >= photos.length)}</View>}<View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(t("editor.photos.swap", { defaultValue: "Swap photos" }), () => { void apply("swap"); })}{button(t("editor.photos.rotate", { defaultValue: "Rotate photo order" }), () => { void apply("rotate"); }, photos.length > 100)}{button(t("editor.photos.shuffle", { defaultValue: "Shuffle photos" }), () => { void apply("shuffle"); }, photos.length > 100)}</View></> : <Text className="text-xs text-white/45">{t("editor.photos.needFrames", { defaultValue: "Add at least two unlocked photos on this page to rearrange them." })}</Text>}
    <Text className="text-xs text-white/45">{t("editor.photos.arrangeHint", { defaultValue: "Frames, positions, styling, and groups stay in place. Photo focal points follow their sources. Backgrounds and photos spanning several pages are excluded." })}</Text>{busy && <Text accessibilityLiveRegion="polite" className="text-xs text-white/55">{t("editor.photos.preparing", { defaultValue: "Preparing photo dimensions…" })}</Text>}{error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
