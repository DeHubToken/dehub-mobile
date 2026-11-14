import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import GlassModal from "../ui/GlassModal";
import { getUnifiedFeed, type UnifiedFeedItem } from "../../services/feed.unified.service";
import { saveProfileOrder, PROFILE_ORDER_MAX } from "../../services/profile-order.service";
import { buildFeedImageUrls, getImageUrl, resolveThumbnail, DEFAULT_BANNER_SENTINEL } from "../../libs/misc";
import { toastError, toastSuccess } from "../../libs/toast";
import { dragTargetIndex, moveItem } from "../../libs/arrange-order";

/**
 * Where a creator drags their own posts into the order visitors see first.
 * The app's side of web's `ProfileArrangeSheet`: one row per post with a grip
 * to drag by, the post's picture and words, and a "to top" shortcut.
 *
 * Saving sends the whole list. The profile then opens in this order for
 * everyone, with Newest, Oldest, Most viewed and Most liked still in the sort
 * menu.
 *
 * Rows are one fixed height so a drag needs no measuring (libs/arrange-order).
 */

interface ArrangeRow {
  tokenId: number;
  title: string;
  image: string;
}

const ROW_HEIGHT = 60;
const ROW_GAP = 6;
const ROW_STEP = ROW_HEIGHT + ROW_GAP;
/** Enough for almost every channel; older posts keep their place after these. */
const LOAD_LIMIT = 300;
const PAGE_SIZE = 50;
const THUMB_WIDTH = 160;

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

interface RowProps {
  row: ArrangeRow;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onTop: (index: number) => void;
  onDragChange: (dragging: boolean) => void;
  dragLabel: string;
  topLabel: string;
  untitled: string;
}

const ArrangeItem: React.FC<RowProps> = ({ row, index, count, onMove, onTop, onDragChange, dragLabel, topLabel, untitled }) => {
  const offset = useRef(new Animated.Value(0)).current;
  const [lifted, setLifted] = useState(false);
  // The gesture outlives renders: where the drag began and where the row is
  // now are read through refs so one responder serves the whole drag.
  const live = useRef({ index, count, start: 0, onMove, onDragChange });
  live.current.index = index;
  live.current.count = count;
  live.current.onMove = onMove;
  live.current.onDragChange = onDragChange;

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      live.current.start = live.current.index;
      setLifted(true);
      live.current.onDragChange(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const { start, index: now, count: total } = live.current;
      const target = dragTargetIndex(start, gesture.dy, ROW_STEP, total);
      if (target !== now) {
        live.current.index = target;
        live.current.onMove(now, target);
      }
      // The list has already moved the row to `target`; the rest of the
      // finger's travel is drawn on top so the row stays under the finger.
      offset.setValue(gesture.dy - (target - start) * ROW_STEP);
    },
    onPanResponderRelease: () => finish(),
    onPanResponderTerminate: () => finish(),
  })).current;

  function finish() {
    setLifted(false);
    live.current.onDragChange(false);
    Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 20 }).start();
  }

  return (
    <Animated.View
      style={[styles.row, lifted && styles.rowLifted, { transform: [{ translateY: offset }, { scale: lifted ? 1.02 : 1 }] }]}
      className={lifted ? "bg-white/20 border border-white/25" : "bg-white/[0.07] border border-white/10"}
    >
      <View {...responder.panHandlers} style={styles.grip} accessibilityRole="adjustable" accessibilityLabel={dragLabel}>
        <Icon name="Grip" size={20} color="rgba(255,255,255,0.6)" />
      </View>
      <Text style={styles.number} className="text-white/50">{index + 1}</Text>
      {row.image
        ? <Image source={{ uri: row.image }} style={styles.thumb} contentFit="cover" />
        : <View style={[styles.thumb, styles.thumbText]} className="bg-white/10"><Text className="text-white/70 font-bold text-[15px]">Aa</Text></View>}
      <Text numberOfLines={2} style={styles.title} className="text-white text-sm">{row.title || untitled}</Text>
      {index > 0 && (
        <Pressable onPress={() => onTop(index)} hitSlop={6} accessibilityRole="button" accessibilityLabel={topLabel} style={styles.top}>
          <Icon name="ArrowUpToLine" size={17} color="rgba(255,255,255,0.6)" />
        </Pressable>
      )}
    </Animated.View>
  );
};

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
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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

  const move = useCallback((from: number, to: number) => setRows((current) => moveItem(current, from, to)), []);
  const toTop = useCallback((index: number) => {
    setRows((current) => moveItem(current, index, 0));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

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
          {t("profile.arrange.hint", "Drag your posts into the order you want. Visitors see this order first.")}
        </Text>
        <ScrollView ref={scrollRef} style={styles.scroll} scrollEnabled={!dragging} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {state === "loading" && <View style={styles.note}><ActivityIndicator color="#FFFFFF" /></View>}
          {state === "failed" && <Text className="text-white/70 text-sm text-center" style={styles.note}>{t("profile.arrange.loadFailed", "Could not load your posts. Close this and try again.")}</Text>}
          {state === "ready" && rows.length === 0 && <Text className="text-white/70 text-sm text-center" style={styles.note}>{t("profile.arrange.empty", "Nothing to arrange yet. Post something first.")}</Text>}
          {state === "ready" && rows.map((row, index) => (
            <ArrangeItem
              key={row.tokenId}
              row={row}
              index={index}
              count={rows.length}
              onMove={move}
              onTop={toTop}
              onDragChange={setDragging}
              dragLabel={t("profile.arrange.drag", "Drag to move")}
              topLabel={t("profile.arrange.toTop", "Move to top")}
              untitled={untitled}
            />
          ))}
        </ScrollView>
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
  row: { flexDirection: "row", alignItems: "center", height: ROW_HEIGHT, marginBottom: ROW_GAP, borderRadius: 16, paddingRight: 8, gap: 10 },
  rowLifted: { zIndex: 2, elevation: 6 },
  grip: { width: 40, height: ROW_HEIGHT, alignItems: "center", justifyContent: "center" },
  number: { width: 22, textAlign: "right", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  thumb: { width: 72, height: 44, borderRadius: 10 },
  thumbText: { alignItems: "center", justifyContent: "center" },
  title: { flex: 1, minWidth: 0 },
  top: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  note: { paddingVertical: 28 },
  actions: { flexDirection: "row", gap: 8, paddingTop: 10 },
  button: { height: 44 },
  buttonMain: { flex: 1 },
  disabled: { opacity: 0.45 },
});

export default ProfileArrangeSheet;
export type { ArrangeRow };
