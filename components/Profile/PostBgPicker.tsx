import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useAuthActions, useUser } from "../../context/AuthContext";
import { AuthService } from "../../services/auth.service";
import { getAccount } from "../../services/user.service";
import { toastError } from "../../libs/toast";
import { getAvatarUrl } from "../../libs/misc";
import { createLogger } from "../../libs/logger";
import { POST_BACKGROUNDS, mergePostBg, postBgById, type PostBg } from "../../libs/postBackgrounds";
import Avatar from "../common/Avatar";
import { POST_BG_INK, PostBgLayer, setPostBgOverride, useResolvedPostBg } from "./PostBackground";

const logger = createLogger("PostBgPicker");

/**
 * Profile post background picker (B "Live Preview Strip"): a full-screen
 * preview of your newest text post on the chosen backdrop, its name, and one
 * swipeable strip of all 20. Whatever sits in the middle is applied live; Done
 * saves to customs.postBg. Opened by holding your own profile header, or from
 * Edit profile. Mounted once in App.tsx.
 */

type OpenRequest = { sampleText?: string } | null;
let request: OpenRequest = null;
let tick = 0;
const subs = new Set<() => void>();
const sub = (l: () => void) => { subs.add(l); return () => subs.delete(l); };
const snap = () => tick;

export function openPostBgPicker(sampleText?: string) {
  request = { sampleText };
  tick++;
  try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* not supported */ }
  subs.forEach((l) => l());
}
function closePostBgPicker() {
  request = null;
  tick++;
  subs.forEach((l) => l());
}

/** Wraps a press target on your own profile so holding it opens the picker. */
export function usePostBgHoldProps(enabled: boolean, sampleText?: string) {
  return useMemo(
    () => (enabled ? { onLongPress: () => openPostBgPicker(sampleText), delayLongPress: 450 } : {}),
    [enabled, sampleText],
  );
}

const ORDER: (PostBg | null)[] = [null, ...POST_BACKGROUNDS];
const TILE = 56;
const GAP = 10;
const STEP = TILE + GAP;

export default function PostBgPickerHost() {
  useSyncExternalStore(sub, snap, snap);
  const open = !!request;
  if (!open) return null;
  return <PostBgPicker sampleText={request?.sampleText} />;
}

function PostBgPicker({ sampleText }: { sampleText?: string }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const user = useUser() as any;
  const { patchUser } = useAuthActions();
  const address: string = user?.walletAddress || user?.address || "";
  const current = useResolvedPostBg(address, user?.customs);
  const [sel, setSel] = useState<string | null>(current?.id ?? null);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<FlatList<PostBg | null>>(null);
  const startIndex = Math.max(0, ORDER.findIndex((b) => (b?.id ?? null) === (current?.id ?? null)));

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToOffset({ offset: startIndex * STEP, animated: false }), 0);
    return () => clearTimeout(id);
  }, [startIndex]);

  const settle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(ORDER.length - 1, Math.round(e.nativeEvent.contentOffset.x / STEP)));
    const id = ORDER[i]?.id ?? null;
    setSel((cur) => {
      if (cur !== id) { try { void Haptics.selectionAsync(); } catch { /* not supported */ } }
      return id;
    });
  }, []);

  const pick = (i: number) => {
    setSel(ORDER[i]?.id ?? null);
    listRef.current?.scrollToOffset({ offset: i * STEP, animated: true });
  };

  const save = async () => {
    if ((current?.id ?? null) === sel) { closePostBgPicker(); return; }
    setSaving(true);
    try {
      // Merge into the account's latest customs, not a cached copy, so a
      // setting saved on another device is never written back over.
      let base: Record<string, unknown> = user?.customs ?? {};
      try {
        const res: any = await getAccount(user?.username || address);
        const core = res?.data?.result || res?.result;
        if (core?.customs && typeof core.customs === "object") base = core.customs;
      } catch { /* use the cached copy */ }
      const merged = mergePostBg(base, sel);
      await AuthService.updateProfile({ customs: JSON.stringify(merged) });
      if (address) setPostBgOverride(address, sel);
      patchUser({ customs: merged as Record<string, string> } as any).catch(() => {});
      closePostBgPicker();
    } catch (error) {
      logger.error("Post background save failed", error);
      toastError(error, t("postBg.saveFailed", "Couldn't save your background. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const bg = postBgById(sel);
  const ink = bg ? POST_BG_INK[bg.tone] : POST_BG_INK.dark;
  const pos = bg ? POST_BACKGROUNDS.indexOf(bg) + 1 : 0;
  const pad = width / 2 - TILE / 2;
  const avatar = user?.avatarImageUrl ? getAvatarUrl(user.avatarImageUrl, 72) : undefined;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closePostBgPicker} statusBarTranslucent>
      <View className="dark-surface" style={[styles.panel, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.top}>
          <Pressable onPress={closePostBgPicker} hitSlop={10} style={styles.topBtn} accessibilityRole="button">
            <Text style={styles.topText}>{t("common.cancel", "Cancel")}</Text>
          </Pressable>
          <Text style={styles.title}>{t("postBg.title", "Post background")}</Text>
          <Pressable onPress={save} disabled={saving} hitSlop={10} style={[styles.topBtn, styles.done]} accessibilityRole="button">
            {saving ? <ActivityIndicator size="small" color="#0b0b0f" /> : <Text style={styles.doneText}>{t("common.done", "Done")}</Text>}
          </Pressable>
        </View>

        <View style={styles.stage}>
          <View style={[styles.preview, !bg && styles.previewPlain]}>
            <PostBgLayer bg={bg} />
            <View style={styles.who}>
              <Avatar uri={avatar} name={user?.displayName || user?.username} size={36} radius={18} />
              <View>
                <Text style={[styles.name, { color: ink.ink }]}>{user?.displayName || user?.username || ""}</Text>
                {!!user?.username && <Text style={[styles.handle, { color: ink.sub }]}>@{user.username}</Text>}
              </View>
            </View>
            <Text numberOfLines={6} style={[styles.words, { color: ink.ink }]}>
              {sampleText?.trim() || t("postBg.sample", "This is how your text posts look on your profile.")}
            </Text>
          </View>
        </View>

        <View style={styles.label} accessibilityLiveRegion="polite">
          <Text style={styles.labelName}>{bg ? t(`postBg.names.${bg.id}`, bg.name) : t("postBg.none", "None")}</Text>
          <Text style={styles.labelSub}>
            {bg
              ? `${bg.kind === "moving" ? t("postBg.moving", "Moving") : t("postBg.still", "Still")} · ${t("postBg.position", "{{n}} of {{total}}", { n: pos, total: POST_BACKGROUNDS.length })}`
              : t("postBg.plain", "Plain posts")}
          </Text>
        </View>

        <FlatList
          ref={listRef}
          horizontal
          data={ORDER}
          keyExtractor={(b) => b?.id ?? "none"}
          showsHorizontalScrollIndicator={false}
          snapToInterval={STEP}
          decelerationRate="fast"
          style={styles.strip}
          contentContainerStyle={{ paddingHorizontal: pad, gap: GAP }}
          getItemLayout={(_, i) => ({ length: STEP, offset: STEP * i, index: i })}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={settle}
          initialNumToRender={ORDER.length}
          renderItem={({ item, index }) => {
            const on = (item?.id ?? null) === sel;
            return (
              <Pressable onPress={() => pick(index)} style={styles.tile} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <View style={[styles.swatch, !item && styles.swatchNone, on && styles.swatchOn]}>
                  <PostBgLayer bg={item} active={on} />
                </View>
                <Text numberOfLines={1} style={styles.tileText}>{item ? t(`postBg.names.${item.id}`, item.name) : t("postBg.none", "None")}</Text>
              </Pressable>
            );
          }}
        />
        <Text style={styles.hint}>{t("postBg.hint", "Swipe the strip. Your post changes as you go. Only you can change this.")}</Text>
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
  stage: { flex: 1, justifyContent: "center" },
  preview: { borderRadius: 18, overflow: "hidden", padding: 16, gap: 12, minHeight: 200 },
  previewPlain: { borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  who: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontSize: 14, fontWeight: "800" },
  handle: { fontSize: 12.5 },
  words: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  label: { alignItems: "center", gap: 2 },
  labelName: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  labelSub: { color: "rgba(255,255,255,0.62)", fontSize: 12 },
  strip: { flexGrow: 0 },
  tile: { width: TILE, alignItems: "center", gap: 4 },
  swatch: { width: TILE, height: TILE, borderRadius: 14, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  swatchNone: { borderStyle: "dashed", borderColor: "rgba(255,255,255,0.5)" },
  swatchOn: { borderColor: "#8b7cff" },
  tileText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "700", maxWidth: 64 },
  hint: { color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center" },
});
