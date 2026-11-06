import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import BlurSafeImage from "../common/BlurSafeImage";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { useAuthActions, useUser } from "../../context/AuthContext";
import { AuthService } from "../../services/auth.service";
import { getAccount } from "../../services/user.service";
import { toastError } from "../../libs/toast";
import { createLogger } from "../../libs/logger";
import { mergeArticleTile, parseArticleTile, type ArticleTileLook } from "../../libs/articleTile";

const logger = createLogger("ArticleTile");
const SERIF = "Georgia";

// ---- which look a profile shows -------------------------------------------------

const overrides = new Map<string, ArticleTileLook>();
const listeners = new Set<() => void>();
let version = 0;
function setArticleTileOverride(address: string, look: ArticleTileLook) {
  overrides.set(address.toLowerCase(), look);
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => version;

/** The look for one profile: a fresh save wins, else the account's customs. */
export function useResolvedArticleTile(address: string | undefined, customs: Record<string, unknown> | null | undefined): ArticleTileLook {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const key = address?.toLowerCase();
  if (key && overrides.has(key)) return overrides.get(key)!;
  return parseArticleTile(customs);
}

export const ProfileArticleTileContext = createContext<ArticleTileLook>("cover");
export const useProfileArticleTile = () => useContext(ProfileArticleTileContext);

// ---- drawing ---------------------------------------------------------------------

export interface ArticleTileSample {
  cover?: string;
  title: string;
  minutes: number;
  views?: string;
}

/**
 * The inside of an article tile, same as web (ProfileMixedGrid). Cover: the
 * cover fills the tile and a glass bar holds the title, reading time and
 * views, like a video tile's meta row. Drop cap: a big serif first letter and
 * the title over a soft cover. `scale` grows it for the picker.
 */
export function ArticleTileFace({ look, cover, title, minutes, views, scale = 1 }: ArticleTileSample & { look: ArticleTileLook; scale?: number }) {
  const { t } = useTranslation();
  const { theme, isLight } = useAppTheme();
  const osaka = theme === "osaka";
  const light = isLight && !osaka;
  const read = t("profile.articleMinRead", "{{count}} min read", { count: minutes });
  const s = (n: number) => n * scale;

  if (look === "dropcap") {
    const ink = light ? "#15141A" : "#FFFFFF";
    const tint = osaka
      ? ["rgba(26,12,22,0.3)", "rgba(26,12,22,0.65)", "rgba(26,12,22,0.92)"]
      : light
        ? ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.75)", "rgba(255,255,255,0.95)"]
        : ["rgba(8,8,12,0.3)", "rgba(8,8,12,0.62)", "rgba(8,8,12,0.92)"];
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: osaka ? "rgba(17,14,28,0.82)" : light ? "#F2F2F4" : "#141416" }]}>
        {!!cover && <BlurSafeImage source={{ uri: cover }} style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.12 }] }]} contentFit="cover" blurRadius={3} transition={0} />}
        <LinearGradient colors={tint as [string, string, string]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1, paddingHorizontal: s(8), paddingTop: s(7), paddingBottom: s(8) }}>
          <Text style={{ fontFamily: SERIF, fontSize: s(44), lineHeight: s(46), fontWeight: "700", color: osaka ? "#FF6FB5" : ink }}>{title.charAt(0)}</Text>
          <Text numberOfLines={4} style={{ marginTop: s(2), fontFamily: SERIF, fontSize: s(12.5), lineHeight: s(14.5), fontWeight: "700", color: ink }}>{title}</Text>
          <View style={{ marginTop: "auto", width: s(18), height: 2, borderRadius: 2, backgroundColor: ink, opacity: 0.5 }} />
          <View style={{ marginTop: s(5), flexDirection: "row", alignItems: "center", gap: s(4), opacity: 0.75 }}>
            <Icon name="Blog" size={s(11)} color={ink} />
            <Text style={{ fontSize: s(9.5), fontWeight: "700", color: ink }}>{read}</Text>
          </View>
        </View>
      </View>
    );
  }

  const ink = light ? "#15141A" : "#FFFFFF";
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: osaka ? "rgba(17,14,28,0.82)" : light ? "#F2F2F4" : "#141416" }]}>
      {cover ? (
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", paddingTop: "28%" }]}>
          <Icon name="Blog" size={s(26)} color={light ? "rgba(21,20,26,0.4)" : "rgba(255,255,255,0.4)"} />
        </View>
      )}
      <View
        style={{
          position: "absolute", left: s(4), right: s(4), bottom: s(4), borderRadius: s(8), paddingHorizontal: s(7), paddingTop: s(6), paddingBottom: s(6), gap: s(4),
          backgroundColor: osaka ? "rgba(17,14,28,0.72)" : light ? "rgba(255,255,255,0.84)" : "rgba(10,10,14,0.62)",
          borderWidth: StyleSheet.hairlineWidth, borderColor: osaka ? "rgba(255,111,181,0.4)" : light ? "rgba(13,13,18,0.1)" : "rgba(255,255,255,0.22)",
        }}
      >
        <Text numberOfLines={3} style={{ fontSize: s(11.5), lineHeight: s(14), fontWeight: "800", color: ink }}>{title}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: s(4), opacity: 0.68 }}>
          <Text numberOfLines={1} style={{ fontSize: s(9), fontWeight: "700", color: ink }}>{read}</Text>
          {!!views && <Text numberOfLines={1} style={{ fontSize: s(9), fontWeight: "700", color: ink }}>{t("profile.articleViews", "{{views}} views", { views })}</Text>}
        </View>
      </View>
    </View>
  );
}

// ---- picker ----------------------------------------------------------------------

let request: ArticleTileSample | null = null;
let tick = 0;
const subs = new Set<() => void>();
const sub = (l: () => void) => { subs.add(l); return () => subs.delete(l); };
const snap = () => tick;

/** Holding one of your own articles opens this. */
export function openArticleTilePicker(sample: ArticleTileSample) {
  request = sample;
  tick++;
  try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* not supported */ }
  subs.forEach((l) => l());
}
function closeArticleTilePicker() {
  request = null;
  tick++;
  subs.forEach((l) => l());
}

/** Mounted once in App.tsx, next to the post background picker. */
export default function ArticleTilePickerHost() {
  useSyncExternalStore(sub, snap, snap);
  if (!request) return null;
  return <ArticleTilePicker sample={request} />;
}

function ArticleTilePicker({ sample }: { sample: ArticleTileSample }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Two tiles side by side, drawn exactly like a grid tile (about 130 pt wide
  // on a phone) scaled up, so the preview is what the grid shows.
  const tileW = Math.min(220, (width - 32 - 14) / 2);
  const scale = tileW / 130;
  const user = useUser() as any;
  const { patchUser } = useAuthActions();
  const address: string = user?.walletAddress || user?.address || "";
  const current = useResolvedArticleTile(address, user?.customs);
  const [sel, setSel] = useState<ArticleTileLook>(current);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSel(current); }, [current]);

  const save = async () => {
    if (current === sel) { closeArticleTilePicker(); return; }
    setSaving(true);
    try {
      // Merge into the account's latest customs, so a setting saved on
      // another device is never written back over.
      let base: Record<string, unknown> = user?.customs ?? {};
      try {
        const res: any = await getAccount(user?.username || address);
        const core = res?.data?.result || res?.result;
        if (core?.customs && typeof core.customs === "object") base = core.customs;
      } catch { /* use the cached copy */ }
      const merged = mergeArticleTile(base, sel);
      await AuthService.updateProfile({ customs: JSON.stringify(merged) });
      if (address) setArticleTileOverride(address, sel);
      patchUser({ customs: merged as Record<string, string> } as any).catch(() => {});
      closeArticleTilePicker();
    } catch (error) {
      logger.error("Article tile save failed", error);
      toastError(error, t("articleTile.saveFailed", "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const option = (look: ArticleTileLook, label: string) => {
    const on = sel === look;
    return (
      <Pressable
        key={look}
        onPress={() => { setSel(look); try { void Haptics.selectionAsync(); } catch { /* not supported */ } }}
        style={styles.option}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
      >
        <View style={[styles.tile, { width: tileW + 6, height: (tileW * 4) / 3 + 6 }, on && styles.tileOn]}>
          <View style={styles.tileClip}>
            <ArticleTileFace look={look} {...sample} scale={scale} />
          </View>
        </View>
        <Text style={[styles.optionText, on && styles.optionTextOn]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeArticleTilePicker} statusBarTranslucent>
      <View className="dark-surface" style={[styles.panel, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.top}>
          <Pressable onPress={closeArticleTilePicker} hitSlop={10} style={styles.topBtn} accessibilityRole="button">
            <Text style={styles.topText}>{t("common.cancel", "Cancel")}</Text>
          </Pressable>
          <Text style={styles.title}>{t("articleTile.title", "Article tiles")}</Text>
          <Pressable onPress={save} disabled={saving} hitSlop={10} style={[styles.topBtn, styles.done]} accessibilityRole="button">
            {saving ? <ActivityIndicator size="small" color="#0b0b0f" /> : <Text style={styles.doneText}>{t("common.done", "Done")}</Text>}
          </Pressable>
        </View>
        <View style={styles.stage} accessibilityRole="radiogroup">
          {option("cover", t("articleTile.cover", "Cover"))}
          {option("dropcap", t("articleTile.dropcap", "Drop cap"))}
        </View>
        <Text style={styles.hint}>{t("articleTile.hint", "How your articles look on your profile grid. Only you can change this.")}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: "#0b0b0f", paddingHorizontal: 16, gap: 14 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, minWidth: 64, alignItems: "center" },
  topText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  done: { backgroundColor: "#FFFFFF" },
  doneText: { color: "#0b0b0f", fontSize: 15, fontWeight: "800" },
  stage: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  option: { alignItems: "center", gap: 10 },
  tile: { borderRadius: 12, borderWidth: 3, borderColor: "transparent" },
  tileOn: { borderColor: "#FFFFFF" },
  tileClip: { flex: 1, borderRadius: 9, overflow: "hidden" },
  optionText: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "800" },
  optionTextOn: { color: "#FFFFFF" },
  hint: { color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center" },
});
