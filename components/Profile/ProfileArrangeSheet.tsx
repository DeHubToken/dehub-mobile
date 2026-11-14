import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import GlassModal from "../ui/GlassModal";
import { getUnifiedFeed, type UnifiedFeedItem } from "../../services/feed.unified.service";
import { saveProfileOrder, PROFILE_ORDER_MAX } from "../../services/profile-order.service";
import { buildFeedImageUrls, getImageUrl, resolveThumbnail, DEFAULT_BANNER_SENTINEL } from "../../libs/misc";
import { toastError, toastSuccess } from "../../libs/toast";
import { ReorderItem, useReorder } from "../common/Reorder";

/**
 * Where a creator drags their own posts into the order visitors see first.
 * The app's side of web's `ProfileArrangeSheet`: a grid of the creator's
 * posts, like the profile grid. Hold a post and drag it to its new place, the
 * same hold, lift, haptic and slide as rearranging the menu
 * (components/common/Reorder); the sheet scrolls when the finger nears its edge.
 *
 * Saving sends the whole list. The profile then opens in this order for
 * everyone, with Newest, Oldest, Most viewed and Most liked still in the sort
 * menu.
 */

interface ArrangeRow {
  tokenId: number;
  title: string;
  image: string;
}

const COLUMNS = 3;
const GAP = 6;
const SIDE = 12;
/** Enough for almost every channel; older posts keep their place after these. */
const LOAD_LIMIT = 300;
const PAGE_SIZE = 50;
const THUMB_WIDTH = 320;

const plain = (text: unknown): string => String(text ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function rowOf(item: UnifiedFeedItem): ArrangeRow | null {
  const tokenId = Number((item as any).tokenId);
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) return null;
  const any = item as any;
  let image = "";
  if (Array.isArray(any.imageUrls) && any.imageUrls.length > 0) image = buildFeedImageUrls(any.imageUrls, THUMB_WIDTH)[0] ?? "";
  if (!image) {
    const raw = any.thumbnail || any.stream?.thumbnail || any.thumbnailUrl || any.articleImageUrl || any.imageUrl || "";
    if (raw) image = getImageUrl(raw, THUMB_WIDTH);
    else if (any.postType === "video" || any.postType === "short" || any.postType === "live") {
      const resolved = resolveThumbnail(any, THUMB_WIDTH);
      image = resolved === DEFAULT_BANNER_SENTINEL ? "" : resolved;
    }
  }
  return { tokenId, title: plain(any.title || any.name || any.description), image };
}

/** The creator's posts in the order the profile shows them now. */
async function loadRows(address: string): Promise<ArrangeRow[]> {
  const rows: ArrangeRow[] = [];
  const seen = new Set<number>();
  for (let page = 1; rows.length < LOAD_LIMIT; page += 1) {
    const res = await getUnifiedFeed({ minter: address, sortBy: "custom", page, limit: PAGE_SIZE, status: "all" } as any);
    const items = res?.result || [];
    for (const item of items) {
      const row = rowOf(item);
      if (row && !seen.has(row.tokenId)) { seen.add(row.tokenId); rows.push(row); }
    }
    if (items.length < PAGE_SIZE) break;
  }
  return rows.slice(0, Math.min(LOAD_LIMIT, PROFILE_ORDER_MAX));
}

interface ProfileArrangeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The creator's wallet address. */
  address: string;
  /** Whether a saved order exists already: shows the way back to newest first. */
  hasCustomOrder: boolean;
  /** Called after a save or a reset, with whether an order is now in place. */
  onSaved: (hasCustomOrder: boolean) => void;
  /** Screenshots: show these rows and save nothing. */
  preview?: ArrangeRow[];
}

const ProfileArrangeSheet: React.FC<ProfileArrangeSheetProps> = ({ visible, onClose, address, hasCustomOrder, onSaved, preview }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ArrangeRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [saving, setSaving] = useState(false);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 520) - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  useEffect(() => {
    if (!visible) return;
    if (preview) { setRows(preview); setState("ready"); return; }
    if (!address) return;
    let live = true;
    setState("loading");
    loadRows(address)
      .then((loaded) => { if (live) { setRows(loaded); setState("ready"); } })
      .catch(() => { if (live) setState("failed"); });
    return () => { live = false; };
  }, [visible, address, preview]);

  const ids = useMemo(() => rows.map((row) => String(row.tokenId)), [rows]);
  const byId = useMemo(() => new Map(rows.map((row) => [String(row.tokenId), row])), [rows]);
  const commit = useCallback((next: string[]) => {
    setRows((current) => {
      const map = new Map(current.map((row) => [String(row.tokenId), row]));
      return next.map((id) => map.get(id)).filter((row): row is ArrangeRow => !!row);
    });
  }, []);
  const reorder = useReorder({ ids, onCommit: commit, disabled: saving, liftScale: 1.05 });

  const finish = async (order: number[]) => {
    if (preview) { onClose(); return; }
    setSaving(true);
    try {
      await saveProfileOrder(order);
      onSaved(order.length > 0);
      void queryClient.invalidateQueries({ queryKey: ["infinite-feed"] });
      toastSuccess(order.length
        ? t("profile.arrange.saved", "Your order is saved")
        : t("profile.arrange.resetDone", "Back to newest first"));
      onClose();
    } catch {
      toastError(t("profile.arrange.saveFailed", "Could not save your order. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const untitled = t("profile.post", "Post");
  return (
    <GlassModal surface="theme" visible={visible} onClose={onClose} presentation="bottom" maxHeight="88%">
      <View className="px-3 pb-5 pt-2" style={styles.sheet}>
        <Text className="text-white text-lg font-semibold px-1">{t("profile.arrange.title", "Arrange your posts")}</Text>
        <Text className="text-white/70 text-[13px] px-1 mt-1 mb-3">
          {t("profile.arrange.hint", "Hold a post and drag it to its new place. Visitors see this order first.")}
        </Text>
        <Animated.ScrollView
          ref={reorder.scrollRef}
          onLayout={reorder.onViewportLayout}
          scrollEnabled={!reorder.draggingId}
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          {state === "loading" && <View style={styles.note}><ActivityIndicator color="#FFFFFF" /></View>}
          {state === "failed" && <Text className="text-white/70 text-sm text-center" style={styles.note}>{t("profile.arrange.loadFailed", "Could not load your posts. Close this and try again.")}</Text>}
          {state === "ready" && rows.length === 0 && <Text className="text-white/70 text-sm text-center" style={styles.note}>{t("profile.arrange.empty", "Nothing to arrange yet. Post something first.")}</Text>}
          {state === "ready" && rows.length > 0 && (
            <View style={styles.grid}>
              {reorder.order.map((id, index) => {
                const row = byId.get(id);
                if (!row) return null;
                const label = row.title || untitled;
                const lifted = reorder.draggingId === id;
                return (
                  <ReorderItem key={id} id={id} ctx={reorder.ctx} style={{ width: tile, height: tile }}>
                    <View
                      accessible
                      accessibilityLabel={`${index + 1}. ${label}`}
                      style={[styles.tile, lifted && styles.tileLifted]}
                      className={lifted ? "bg-white/20 border border-white/40" : "bg-white/10 border border-white/10"}
                    >
                      {row.image
                        ? <Image source={{ uri: row.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        : <Text numberOfLines={4} style={styles.tileText} className="text-white text-xs">{label}</Text>}
                      {!!row.image && !!label && (
                        <View style={styles.caption}><Text numberOfLines={1} style={styles.captionText}>{label}</Text></View>
                      )}
                      <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
                    </View>
                  </ReorderItem>
                );
              })}
            </View>
          )}
        </Animated.ScrollView>
        <View style={styles.actions}>
          {hasCustomOrder && (
            <Pressable
              onPress={() => finish([])}
              disabled={saving}
              accessibilityRole="button"
              className="border border-white/15 rounded-2xl items-center justify-center px-4"
              style={[styles.button, saving && styles.disabled]}
            >
              <Text className="text-white text-sm font-semibold" numberOfLines={1}>{t("profile.arrange.reset", "Back to newest first")}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => finish(rows.map((row) => row.tokenId))}
            disabled={saving || state !== "ready" || rows.length === 0}
            accessibilityRole="button"
            className="bg-white/15 border border-white/15 rounded-2xl items-center justify-center px-4"
            style={[styles.button, styles.buttonMain, (saving || state !== "ready" || rows.length === 0) && styles.disabled]}
          >
            <Text className="text-white text-sm font-semibold" numberOfLines={1}>
              {saving ? t("profile.arrange.saving", "Saving...") : t("profile.arrange.save", "Save order")}
            </Text>
          </Pressable>
        </View>
      </View>
    </GlassModal>
  );
};

const styles = StyleSheet.create({
  sheet: { maxHeight: "100%" },
  scroll: { flexGrow: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingTop: 8, paddingBottom: 12 },
  tile: { flex: 1, borderRadius: 14, overflow: "hidden" },
  tileLifted: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  tileText: { position: "absolute", top: 30, left: 8, right: 8, lineHeight: 16 },
  number: { position: "absolute", top: 5, left: 5, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  numberText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 5, backgroundColor: "rgba(0,0,0,0.45)" },
  captionText: { color: "#FFFFFF", fontSize: 11 },
  note: { paddingVertical: 28 },
  actions: { flexDirection: "row", gap: 8, paddingTop: 10 },
  button: { height: 44 },
  buttonMain: { flex: 1 },
  disabled: { opacity: 0.45 },
});

export default ProfileArrangeSheet;
export type { ArrangeRow };
