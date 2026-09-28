import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon, { type IconName } from "../ui/Icon";
import {
  DEHUB_PICKS,
  SKIN_TONE_SWATCHES,
  animatedUrl,
  getEmojiData,
  getEnglishKeywords,
  loadLocalKeywords,
  maxEmojiVersion,
  pushRecent,
  readRecents,
  readSkinTone,
  searchEmoji,
  withTone,
  writeSkinTone,
  type EmojiEntry,
  type EmojiGroup,
  type EmojiKeywords,
  type SkinTone,
} from "../../libs/emoji";
import {
  customEmojisLoaded,
  getCustomEmojis,
  loadCustomEmojis,
  subscribeCustomEmojis,
  type CustomEmoji,
} from "../../libs/emoji/custom-emoji";
import { isKidsBlockedEmoji } from "../../libs/emoji/kids-safe";
import { useKidsModeLock } from "../../hooks/useKidsModeLock";
import { EmojiImage } from "../common/EmojiText";
import AddCustomEmojiPanel from "../common/AddCustomEmojiPanel";

interface EmojiSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  /** Emoji to mark as already chosen (a message's existing reactions). */
  selected?: readonly string[];
}

type SectionKey = "recent" | "dehub" | "custom" | EmojiGroup;

const SECTION_ICONS: Record<SectionKey, IconName> = {
  recent: "Clock",
  dehub: "Sparkles",
  custom: "ImagePlus",
  smileys: "Smile",
  people: "Hand",
  animals: "PawPrint",
  food: "Apple",
  travel: "Plane",
  activities: "Gamepad2",
  objects: "Lightbulb",
  symbols: "Heart",
  flags: "Flag",
};

const TONE_KEYS = ["default", "light", "mediumLight", "medium", "mediumDark", "dark"] as const;

const COLS = 8;
const HEADER_H = 30;
const ROW_H = 46;

type Row =
  | { kind: "header"; key: string; section: SectionKey; title?: string }
  | { kind: "emoji"; key: string; section: SectionKey; items: EmojiEntry[] }
  | { kind: "custom"; key: string; section: SectionKey; items: CustomEmoji[]; withAdd: boolean };

function toRows(section: SectionKey, items: EmojiEntry[], withHeader: boolean): Row[] {
  const rows: Row[] = withHeader ? [{ kind: "header", key: `h-${section}`, section }] : [];
  for (let i = 0; i < items.length; i += COLS) {
    rows.push({ kind: "emoji", key: `${section}-${i}`, section, items: items.slice(i, i + COLS) });
  }
  return rows;
}

/** Custom emoji rows; the section's own grid leads with a "+" tile that opens the add form. */
function toCustomRows(prefix: string, items: CustomEmoji[], withAdd: boolean): Row[] {
  const rows: Row[] = [];
  const first = withAdd ? COLS - 1 : COLS;
  rows.push({ kind: "custom", key: `${prefix}-0`, section: "custom", items: items.slice(0, first), withAdd });
  for (let i = first; i < items.length; i += COLS) {
    rows.push({ kind: "custom", key: `${prefix}-${i}`, section: "custom", items: items.slice(i, i + COLS), withAdd: false });
  }
  return rows;
}

/**
 * The full Unicode emoji set for the post composer, comments and chat
 * reactions — the same picker as dehubweb's EmojiPanel: search in the
 * viewer's language, a DeHub picks row, recents, a remembered skin tone and,
 * on long-press, Google's animated version of the emoji with its name.
 */
export default function EmojiSheet({ visible, onClose, onSelect, selected }: EmojiSheetProps) {
  const { t, i18n } = useTranslation();
  const maxV = useMemo(() => maxEmojiVersion(), []);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<SkinTone>(() => readSkinTone());
  const [toneOpen, setToneOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const [active, setActive] = useState<SectionKey>("dehub");
  const [local, setLocal] = useState<EmojiKeywords | null>(null);
  const [preview, setPreview] = useState<EmojiEntry | null>(null);
  // Custom emoji (the shared :shortcode: image set) and the inline add form.
  // Kids Mode: no rude emoji, and no custom ones — those are unreviewed uploads.
  const kids = useKidsModeLock();
  const allCustom = useSyncExternalStore(subscribeCustomEmojis, getCustomEmojis, getCustomEmojis);
  const custom = useMemo(() => (kids ? [] : allCustom), [kids, allCustom]);
  const [adding, setAdding] = useState(false);
  const jumpAfterAdd = useRef(false);
  const listRef = useRef<FlatList<Row>>(null);
  // A fixed height, so the list has a bounded box to virtualise inside and
  // the sheet does not jump as search narrows the rows.
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.62);

  // Parse the dataset the first time the sheet opens, not at app boot.
  useEffect(() => {
    if (visible && !ready) setReady(true);
    if (visible && !customEmojisLoaded()) void loadCustomEmojis();
    if (!visible) {
      setQuery("");
      setAdding(false);
      setToneOpen(false);
      setPreview(null);
    }
  }, [visible, ready]);

  const data = ready ? getEmojiData() : null;
  const english = ready ? getEnglishKeywords() : null;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    loadLocalKeywords(i18n.language || "en").then((k) => alive && setLocal(k));
    return () => {
      alive = false;
    };
  }, [ready, i18n.language]);

  const sections = useMemo(() => {
    if (!data) return [] as Array<{ key: SectionKey; items: EmojiEntry[] }>;
    const pick = (chars: string[]) =>
      chars
        .map((c) => data.byChar.get(c))
        .filter((e): e is EmojiEntry => !!e && e.v <= maxV && !(kids && isKidsBlockedEmoji(e.char)));
    const out: Array<{ key: SectionKey; items: EmojiEntry[] }> = [];
    const recentItems = pick(recents);
    if (recentItems.length) out.push({ key: "recent", items: recentItems });
    out.push({ key: "dehub", items: pick(DEHUB_PICKS) });
    // Rendered from `custom`, not `items` — these are images, not characters.
    if (!kids) out.push({ key: "custom", items: [] });
    const byGroup = new Map<EmojiGroup, EmojiEntry[]>();
    for (const e of data.entries) {
      if (e.v > maxV || (kids && isKidsBlockedEmoji(e.char))) continue;
      const list = byGroup.get(e.group) ?? [];
      list.push(e);
      byGroup.set(e.group, list);
    }
    for (const g of data.groups) {
      const items = byGroup.get(g);
      if (items?.length) out.push({ key: g, items });
    }
    return out;
  }, [data, recents, maxV, kids]);

  const visibleEntries = useMemo(
    () => (data ? data.entries.filter((e) => e.v <= maxV && !(kids && isKidsBlockedEmoji(e.char))) : []),
    [data, maxV, kids],
  );

  const results = useMemo(
    () => (query.trim() ? searchEmoji(query, visibleEntries, [local, english]) : null),
    [query, visibleEntries, local, english],
  );

  const customMatches = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^:|:$/g, "");
    return q ? custom.filter((c) => c.shortcode.includes(q)) : [];
  }, [custom, query]);

  const rows = useMemo<Row[]>(() => {
    if (results) {
      const out: Row[] = [];
      if (customMatches.length) {
        out.push({ kind: "header", key: "h-custom-results", section: "custom" });
        out.push(...toCustomRows("cr", customMatches, false));
      }
      if (results.length) {
        out.push({ kind: "header", key: "h-results", section: "smileys", title: t("emojiPicker.searchResults") });
        out.push(...toRows("smileys", results, false));
      }
      return out;
    }
    return sections.flatMap((s): Row[] =>
      s.key === "custom"
        ? [{ kind: "header", key: "h-custom", section: "custom" }, ...toCustomRows("c", custom, true)]
        : toRows(s.key, s.items, true),
    );
  }, [sections, results, custom, customMatches, t]);

  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const r of rows) {
      out.push(y);
      y += r.kind === "header" ? HEADER_H : ROW_H;
    }
    return out;
  }, [rows]);

  const getItemLayout = useCallback(
    (_: ArrayLike<Row> | null | undefined, index: number) => ({
      length: rows[index]?.kind === "header" ? HEADER_H : ROW_H,
      offset: offsets[index] ?? 0,
      index,
    }),
    [rows, offsets],
  );

  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);

  const labelFor = useCallback(
    (e: EmojiEntry) => local?.labels[e.i] || english?.labels[e.i] || "",
    [local, english],
  );

  const choose = useCallback(
    (e: EmojiEntry) => {
      setRecents(pushRecent(e.char));
      onSelect(withTone(e, tone, maxV));
      onClose();
    },
    [onSelect, onClose, tone, maxV],
  );

  // A custom emoji is inserted as `:shortcode:`, which every text surface
  // renders back as the image (see EmojiText).
  const chooseCustom = useCallback(
    (c: CustomEmoji) => {
      onSelect(`:${c.shortcode}:`);
      onClose();
    },
    [onSelect, onClose],
  );

  const jumpTo = (key: SectionKey) => {
    setQuery("");
    setAdding(false);
    setActive(key);
    const index = sections.length ? rows.findIndex((r) => r.kind === "header" && r.section === key) : -1;
    if (index >= 0) listRef.current?.scrollToOffset({ offset: offsets[index], animated: true });
  };

  // Back from the add form: the list remounts, then lands on the custom section.
  useEffect(() => {
    if (adding || !jumpAfterAdd.current) return;
    jumpAfterAdd.current = false;
    const index = rows.findIndex((r) => r.kind === "header" && r.section === "custom");
    if (index < 0) return;
    const id = requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: offsets[index], animated: false }));
    return () => cancelAnimationFrame(id);
  }, [adding, rows, offsets]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => {
    const first = viewableItems[0]?.item;
    if (first) setActive(first.section);
  }).current;

  const renderRow: ListRenderItem<Row> = ({ item }) => {
    if (item.kind === "header") {
      return (
        <View style={styles.header}>
          <Text style={styles.headerText}>{item.title ?? t(`emojiPicker.group.${item.section}`)}</Text>
        </View>
      );
    }
    if (item.kind === "custom") {
      return (
        <View style={styles.row}>
          {item.withAdd && (
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel={t("emojiPicker.addCustom")}
              style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
            >
              <View style={styles.addTile}>
                <Icon name="Plus" size={16} color="#a1a1aa" />
              </View>
            </Pressable>
          )}
          {item.items.map((c) => {
            const value = `:${c.shortcode}:`;
            return (
              <Pressable
                key={c.id}
                onPress={() => chooseCustom(c)}
                accessibilityLabel={value}
                style={({ pressed }) => [styles.cell, selectedSet.has(value) && styles.cellOn, pressed && styles.cellPressed]}
              >
                <EmojiImage src={c.image_url} name={c.shortcode} size={30} />
              </Pressable>
            );
          })}
          {item.withAdd && item.items.length === 0 && (
            <Text style={styles.customEmpty} numberOfLines={3}>
              {t("emojiPicker.customEmpty")}
            </Text>
          )}
        </View>
      );
    }
    return (
      <View style={styles.row}>
        {item.items.map((e) => {
          const ch = withTone(e, tone, maxV);
          const on = selectedSet.has(ch) || selectedSet.has(e.char);
          return (
            <Pressable
              key={e.i}
              onPress={() => choose(e)}
              onLongPress={() => setPreview(e)}
              onPressOut={() => setPreview(null)}
              delayLongPress={250}
              accessibilityLabel={labelFor(e) || ch}
              style={({ pressed }) => [styles.cell, on && styles.cellOn, pressed && styles.cellPressed]}
            >
              <Text style={styles.emoji}>{ch}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const previewChar = preview ? withTone(preview, tone, maxV) : null;
  const previewAnimated = !!preview?.anim && (!tone || !preview.skins);

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="70%" blurIntensity={40}>
      <View style={[styles.wrap, { height: sheetHeight }]}>
        {/* Search + skin tone */}
        <View style={styles.topBar}>
          <View style={styles.search}>
            <Icon name="Search" size={16} color="#71717a" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("emojiPicker.searchEmoji")}
              placeholderTextColor="#71717a"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => results?.[0] && choose(results[0])}
            />
            {!!query && (
              <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel={t("common.close")}>
                <Icon name="X" size={14} color="#a1a1aa" />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setToneOpen((o) => !o)}
            style={styles.toneBtn}
            accessibilityLabel={t("emojiPicker.skinTone")}
          >
            <Text style={styles.toneText}>{SKIN_TONE_SWATCHES[tone]}</Text>
          </Pressable>
        </View>

        {toneOpen && (
          <View style={styles.toneRow}>
            {SKIN_TONE_SWATCHES.map((swatch, i) => (
              <Pressable
                key={swatch}
                onPress={() => {
                  const next = i as SkinTone;
                  setTone(next);
                  writeSkinTone(next);
                  setToneOpen(false);
                }}
                accessibilityLabel={t(`emojiPicker.tone.${TONE_KEYS[i]}`)}
                style={[styles.toneBtn, tone === i && styles.cellOn]}
              >
                <Text style={styles.toneText}>{swatch}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Categories */}
        <View style={styles.cats}>
          {sections.map((s) => {
            const on = !results && active === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => jumpTo(s.key)}
                accessibilityLabel={t(`emojiPicker.group.${s.key}`)}
                style={[styles.cat, on && styles.catOn]}
              >
                <Icon name={SECTION_ICONS[s.key]} size={17} color={on ? "#ffffff" : "#71717a"} />
              </Pressable>
            );
          })}
        </View>

        {adding ? (
          <View style={styles.addWrap}>
            <AddCustomEmojiPanel
              onLeave={onClose}
              onDone={() => {
                jumpAfterAdd.current = true;
                setActive("custom");
                setAdding(false);
              }}
            />
          </View>
        ) : results && !results.length && !customMatches.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>{t("emojiPicker.noEmoji")}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.key}
            renderItem={renderRow}
            getItemLayout={getItemLayout}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
            contentContainerStyle={styles.listContent}
          />
        )}

        {!adding && preview && previewChar && (
          <View pointerEvents="none" style={styles.previewWrap}>
            <View style={styles.preview}>
              {previewAnimated ? (
                <Image source={{ uri: animatedUrl(preview.anim!) }} style={styles.previewImg} contentFit="contain" autoplay />
              ) : (
                <Text style={styles.previewEmoji}>{previewChar}</Text>
              )}
              <Text style={styles.previewLabel} numberOfLines={2}>
                {labelFor(preview) || previewChar}
              </Text>
            </View>
          </View>
        )}
      </View>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 12 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: { flex: 1, color: "#ffffff", fontSize: 15, paddingVertical: 0 },
  toneBtn: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  toneText: { fontSize: 22 },
  toneRow: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 12, paddingBottom: 8 },
  cats: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 4,
  },
  cat: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  catOn: { borderBottomColor: "#ffffff" },
  listContent: { paddingHorizontal: 6, paddingBottom: 24 },
  header: { height: HEADER_H, justifyContent: "center", paddingHorizontal: 8 },
  headerText: { color: "#a1a1aa", fontSize: 12, fontWeight: "500" },
  row: { height: ROW_H, flexDirection: "row" },
  cell: { width: `${100 / COLS}%`, height: ROW_H, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  cellOn: { backgroundColor: "rgba(255,255,255,0.15)" },
  cellPressed: { backgroundColor: "rgba(255,255,255,0.1)" },
  emoji: { fontSize: 27 },
  addTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  customEmpty: { flex: 1, alignSelf: "center", paddingHorizontal: 6, color: "#71717a", fontSize: 11, lineHeight: 14 },
  addWrap: { flex: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 6 },
  emptyIcon: { fontSize: 30, opacity: 0.5 },
  emptyText: { color: "#71717a", fontSize: 14 },
  previewWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  preview: {
    width: 180,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 24,
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(24,24,27,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  previewImg: { width: 96, height: 96 },
  previewEmoji: { fontSize: 80 },
  previewLabel: { color: "#ffffff", fontSize: 14, textAlign: "center" },
});
