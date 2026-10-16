import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { detachPhotoBackground, setPhotoBackground } from "../../libs/editor/photoBackground";
import { newId } from "../../libs/editor/project";
import { getMedia } from "../../libs/editor/storage";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function PhotoBackgroundControls({ project, selectedId, time, current, commit, select }: {
  project: ProjectSnapshot; selectedId: string | null; time: number; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void;
}) {
  const { t } = useTranslation();
  const photo = project.clips.find(clip => clip.id === selectedId && clip.kind === "image");
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => { request.current++; setPending(false); setError(""); return () => { request.current++; }; }, [project.id, selectedId, time]);
  const apply = async () => {
    const token = ++request.current;
    const before = current(), original = before?.clips.find(clip => clip.id === selectedId);
    if (!before || before.id !== project.id || original?.kind !== "image") return;
    setPending(true); setError("");
    try {
      const source = original.isPageBackground ? null : await getMedia(original.mediaId);
      const latest = current();
      if (request.current !== token || !latest || latest.id !== project.id || latest.clips.find(clip => clip.id === original.id) !== original) return;
      const result = original.isPageBackground ? detachPhotoBackground(latest, original.id, () => newId(10)) : setPhotoBackground(latest, time, original.id, source ?? null, () => newId(10));
      if (result) { commit(result.project); select(result.id); }
      else setError(t("editor.photoBackground.unavailable", { defaultValue: "The photo could not be changed. Check locked backgrounds and the design’s layer limit." }));
    } catch (value) { if (request.current === token) setError(value instanceof Error ? value.message : "Could not change this background"); }
    finally { if (request.current === token) setPending(false); }
  };
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}>
    <Text className="text-xs text-white/60">{t("editor.photoBackground.mobileHint", { defaultValue: "Select a photo to use behind this page. Double-tap the background to reframe it, or detach it as a movable layer." })}</Text>
    <Pressable accessibilityRole="button" disabled={!photo || photo.locked || pending} onPress={() => { void apply(); }} className="min-h-[40px] items-center justify-center rounded-lg border border-white/20 px-3" style={{ opacity: !photo || photo.locked || pending ? 0.35 : 1 }}><Text className="text-xs text-white">{t(photo?.isPageBackground ? "editor.photoBackground.detach" : "editor.photoBackground.use", { defaultValue: photo?.isPageBackground ? "Detach background as photo" : "Use selected photo as background" })}</Text></Pressable>
    {error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
