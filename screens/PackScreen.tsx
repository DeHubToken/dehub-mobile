/**
 * PackScreen — dehub.io/packs/:slug
 *
 * Native port of dehubweb's pages/app/PackPage.tsx. The share link for a pack,
 * like Telegram's addstickers links: anyone can look, anyone signed in can
 * add it to their picker. The owner also edits it here — upload or paste
 * items, remove them, rename, delete. Item caps come from the owner's badge
 * tier and are enforced by the creator-packs function.
 */

import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import SmartImage from "../components/common/SmartImage";
import Icon from "../components/ui/Icon";
import { useAuthActions } from "../context/AuthContext";
import type { AppStackParamList } from "../navigation/types";
import { ScreenNames } from "../navigation/ScreenNames";
import { ensureMediaLibraryPermission } from "../libs/permissions.util";
import { localFileSize } from "../libs/storage-upload";
import { toastError, toastSuccess } from "../libs/toast";
import { normaliseShortcode, parseEmojiSource, probeImage } from "../libs/emoji/custom-emoji";
import {
  addPackItems,
  checkPackImage,
  deletePack,
  packImageType,
  removePackItem,
  renamePack,
  savePack,
  unsavePack,
  uploadPackImage,
  useInvalidatePacks,
  usePackBySlug,
  usePackItems,
  usePackStatus,
  useSavedPacks,
  type NewPackItem,
  type PackKind,
  type PickedPackImage,
} from "../libs/creator-packs/api";
import { PackCover } from "../components/packs/PackPickerParts";
import { packErrorMessage, usePackWallet, usePacksNavigation } from "../components/packs/PackGate";

const KIND_LABEL: Record<PackKind, string> = {
  emoji: "creatorPacks.kind.emoji",
  sticker: "creatorPacks.kind.sticker",
  gif: "creatorPacks.kind.gif",
};

/** How many images one pick may upload at once, as on web. */
const MAX_PICK = 50;

function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function PackScreen() {
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.Pack>>();
  const slug = route.params?.slug ?? "";
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // The KeyboardAvoidingView is the screen root and wraps the ScreenHeader, so
  // only the root SafeAreaView's inset sits above it. Adding the header height
  // would count it twice.
  const keyboardOffset = useKeyboardOffset();
  const wallet = usePackWallet();
  const { requireAuth } = useAuthActions();
  const { openPacks } = usePacksNavigation();
  const invalidate = useInvalidatePacks();

  const { data: pack, isLoading } = usePackBySlug(slug);
  const items = usePackItems(pack ? [pack] : undefined);
  const saved = useSavedPacks(wallet);
  const isOwner = !!pack && !!wallet && pack.owner === wallet;
  const status = usePackStatus(isOwner ? wallet : null);
  const isSaved = !!pack && (saved.data ?? []).some((p) => p.id === pack.id);

  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");

  if (isLoading) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("creatorPacks.title")} />
        <ActivityIndicator size="small" color="#71717A" style={{ marginTop: 32 }} />
      </View>
    );
  }
  if (!pack) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("creatorPacks.title")} />
        <View style={{ alignItems: "center", paddingTop: 32, gap: 12, paddingHorizontal: 24 }}>
          <Text style={styles.muted}>{t("creatorPacks.notFound")}</Text>
          <Pressable onPress={openPacks} accessibilityRole="button">
            <Text style={styles.link}>{t("creatorPacks.browse")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const list = items.data?.[pack.id] ?? [];
  const cap = status.data?.limits.items[pack.kind];
  const room = cap === undefined ? Infinity : Math.max(0, cap - list.length);
  const shareUrl = `https://dehub.io/packs/${pack.slug}`;
  const kindLabel = t(KIND_LABEL[pack.kind]);
  const gif = pack.kind === "gif";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error("[creator-packs]", err);
      toastError(packErrorMessage(err, t, pack.kind));
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = () =>
    requireAuth(() => {
      if (!wallet) return;
      void run(async () => {
        if (isSaved) {
          await unsavePack(wallet, pack.id);
          toastSuccess(t("creatorPacks.removedFromPicker"));
        } else {
          await savePack(wallet, pack.id);
          toastSuccess(t("creatorPacks.addedToPicker"));
        }
        await invalidate();
      });
    });

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(shareUrl);
      toastSuccess(t("creatorPacks.linkCopied"));
    } catch {
      toastError(t("creatorPacks.errors.generic"));
    }
  };

  const shareLink = () => {
    void Share.share({ message: shareUrl, url: shareUrl }).catch(() => {});
  };

  const confirmDelete = () => {
    if (!wallet) return;
    Alert.alert(t("creatorPacks.deletePack"), t("creatorPacks.deleteConfirm", { name: pack.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () =>
          void run(async () => {
            await deletePack(wallet, pack.id);
            await invalidate();
            openPacks();
          }),
      },
    ]);
  };

  const nameFor = (raw: string, i: number) =>
    normaliseShortcode(label && i === 0 ? label : raw) || `${normaliseShortcode(pack.name) || "emoji"}_${list.length + i + 1}`;

  const addAndReport = async (entries: NewPackItem[]) => {
    if (!wallet) return;
    const { added, skipped } = await addPackItems(wallet, pack.id, entries);
    await invalidate();
    toastSuccess(t("creatorPacks.itemsAdded", { count: added, skipped }));
    setLink("");
    setLabel("");
  };

  const pickFiles = async () => {
    if (!wallet) return;
    const permission = await ensureMediaLibraryPermission();
    if (!permission.granted) return;
    const limit = Math.min(room, MAX_PICK);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: limit,
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.length) return;
    void run(async () => {
      const chosen: PickedPackImage[] = [];
      for (const a of picked.assets.slice(0, limit)) {
        chosen.push({
          uri: a.uri,
          mimeType: a.mimeType,
          fileName: a.fileName,
          fileSize: a.fileSize ?? (await localFileSize(a.uri)),
        });
      }
      // Refuse the whole pick up front rather than half-upload it.
      chosen.forEach((img) => checkPackImage(img, pack.kind));
      const entries: NewPackItem[] = [];
      for (const [i, img] of chosen.entries()) {
        const imageUrl = await uploadPackImage(img, wallet, pack.kind);
        entries.push({
          imageUrl,
          animated: packImageType(img) === "image/gif",
          shortcode: pack.kind === "emoji" ? nameFor((img.fileName ?? "").replace(/\.\w+$/, ""), i) : undefined,
          emoji: pack.kind === "sticker" ? label.trim() || undefined : undefined,
        });
      }
      await addAndReport(entries);
    });
  };

  const addFromLink = async () => {
    const parsed = parseEmojiSource(link);
    if (!parsed || !(await probeImage(parsed.imageUrl))) return toastError(t("emojiPicker.errors.badImage"));
    await run(() =>
      addAndReport([
        {
          imageUrl: parsed.imageUrl,
          animated: parsed.animated,
          shortcode: pack.kind === "emoji" ? nameFor(parsed.name ?? "", 0) : undefined,
          emoji: pack.kind === "sticker" ? label.trim() || undefined : undefined,
        },
      ]),
    );
  };

  const removeItem = (itemId: string) => {
    if (!wallet) return;
    void run(async () => {
      await removePackItem(wallet, pack.id, itemId);
      await invalidate();
    });
  };

  const saveName = () => {
    if (!wallet || !editingName?.trim()) return;
    void run(async () => {
      await renamePack(wallet, pack.id, editingName.trim());
      setEditingName(null);
      await invalidate();
    });
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
      <ScreenHeader title={t("creatorPacks.title")} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: insets.bottom + 24, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.panel, styles.headerCard]}>
          <View style={styles.cover}>
            <PackCover pack={pack} size={56} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {editingName !== null ? (
              <View style={styles.row}>
                <TextInput
                  autoFocus
                  value={editingName}
                  onChangeText={(v) => setEditingName(v.slice(0, 64))}
                  onSubmitEditing={saveName}
                  style={[styles.input, { flex: 1 }]}
                  placeholderTextColor="#71717A"
                />
                <Pressable
                  onPress={saveName}
                  disabled={busy || !editingName.trim()}
                  accessibilityRole="button"
                  accessibilityLabel={t("creatorPacks.save")}
                  style={styles.iconBtn}
                >
                  <Icon name="Check" size={16} color="#FFFFFF" />
                </Pressable>
                <Pressable
                  onPress={() => setEditingName(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.cancel")}
                  style={styles.iconBtn}
                >
                  <Icon name="X" size={16} color="#A1A1AA" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.row}>
                <Text numberOfLines={1} style={styles.title}>{pack.name}</Text>
                {isOwner && (
                  <Pressable
                    onPress={() => setEditingName(pack.name)}
                    accessibilityRole="button"
                    accessibilityLabel={t("creatorPacks.rename")}
                    hitSlop={8}
                  >
                    <Icon name="Pencil" size={14} color="#71717A" />
                  </Pressable>
                )}
              </View>
            )}
            <Text style={styles.meta}>
              {kindLabel} · {t("creatorPacks.itemCount", { count: pack.item_count })} ·{" "}
              {t("creatorPacks.saveCount", { count: pack.save_count })}
            </Text>
            <Text style={styles.metaSmall}>{t("creatorPacks.by", { owner: shortAddress(pack.owner) })}</Text>
          </View>
        </View>

        <View style={[styles.row, { flexWrap: "wrap" }]}>
          {!isOwner && (
            <Pressable
              disabled={busy}
              onPress={toggleSave}
              accessibilityRole="button"
              style={[isSaved ? styles.outlineBtn : styles.primaryBtn, busy && { opacity: 0.4 }]}
            >
              <Text style={isSaved ? styles.outlineText : styles.primaryText}>
                {wallet
                  ? isSaved
                    ? t("creatorPacks.removeFromPicker")
                    : t("creatorPacks.addToPicker")
                  : t("creatorPacks.signInToAdd")}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={copyLink} accessibilityRole="button" style={styles.outlineBtn}>
            <Icon name="Link2" size={16} color="#FFFFFF" />
            <Text style={styles.outlineText}>{t("creatorPacks.copyLink")}</Text>
          </Pressable>
          <Pressable onPress={shareLink} accessibilityRole="button" style={styles.outlineBtn}>
            <Icon name="Share2" size={16} color="#FFFFFF" />
            <Text style={styles.outlineText}>{t("postOptions.share")}</Text>
          </Pressable>
          {isOwner && (
            <Pressable disabled={busy} onPress={confirmDelete} accessibilityRole="button" style={styles.dangerBtn}>
              <Icon name="Trash2" size={16} color="#F87171" />
              <Text style={styles.dangerText}>{t("creatorPacks.deletePack")}</Text>
            </Pressable>
          )}
        </View>

        {isOwner && (
          <View style={[styles.panel, { padding: 12, gap: 8 }]}>
            <Text style={styles.sectionTitle}>
              {t("creatorPacks.addItems")}
              {cap !== undefined ? <Text style={styles.sectionMuted}> · {list.length}/{cap}</Text> : null}
            </Text>
            {room === 0 ? (
              <Text style={styles.warn}>{t("creatorPacks.errors.itemLimit")}</Text>
            ) : (
              <>
                {pack.kind !== "gif" && (
                  <TextInput
                    value={label}
                    onChangeText={(v) => setLabel(pack.kind === "emoji" ? normaliseShortcode(v) : v.slice(0, 16))}
                    placeholder={t(pack.kind === "emoji" ? "creatorPacks.shortcodePlaceholder" : "creatorPacks.stickerEmojiPlaceholder")}
                    placeholderTextColor="#71717A"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                )}
                <View style={styles.row}>
                  <TextInput
                    value={link}
                    onChangeText={setLink}
                    placeholder={t("creatorPacks.linkPlaceholder")}
                    placeholderTextColor="#71717A"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[styles.input, { flex: 1 }]}
                  />
                  <Pressable
                    disabled={busy || !link.trim()}
                    onPress={addFromLink}
                    accessibilityRole="button"
                    accessibilityLabel={t("creatorPacks.addFromLink")}
                    style={[styles.addBtn, (busy || !link.trim()) && { opacity: 0.4 }]}
                  >
                    <Icon name="Plus" size={16} color="#000000" />
                  </Pressable>
                </View>
                <Pressable
                  disabled={busy}
                  onPress={pickFiles}
                  accessibilityRole="button"
                  style={[styles.outlineBtn, { justifyContent: "center" }, busy && { opacity: 0.4 }]}
                >
                  {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="Upload" size={16} color="#FFFFFF" />}
                  <Text style={styles.outlineText}>{t("creatorPacks.uploadFiles")}</Text>
                </Pressable>
                <Text style={styles.hint}>{t(gif ? "creatorPacks.uploadHintGif" : "creatorPacks.uploadHint")}</Text>
              </>
            )}
          </View>
        )}

        {items.isLoading ? (
          <ActivityIndicator size="small" color="#71717A" />
        ) : list.length ? (
          <View style={styles.grid}>
            {list.map((it) => (
              <View key={it.id} style={{ width: gif ? "50%" : "25%", padding: 4 }}>
                <View style={[styles.tile, { aspectRatio: gif ? 16 / 9 : 1, padding: gif ? 0 : 6 }]}>
                  <SmartImage
                    source={{ uri: it.image_url }}
                    recyclingKey={it.image_url}
                    style={{ width: "100%", height: "100%" }}
                    contentFit={gif ? "cover" : "contain"}
                  />
                  {isOwner && (
                    <Pressable
                      disabled={busy}
                      onPress={() => removeItem(it.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t("creatorPacks.removeItem")}
                      hitSlop={6}
                      style={styles.removeBtn}
                    >
                      <Icon name="X" size={12} color="#FFFFFF" />
                    </Pressable>
                  )}
                </View>
                {(it.shortcode || it.emoji) && (
                  <Text numberOfLines={1} style={styles.itemLabel}>
                    {it.shortcode ? `:${it.shortcode}:` : it.emoji}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.muted, { textAlign: "center", paddingVertical: 24 }]}>{t("creatorPacks.packEmpty")}</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  headerCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  cover: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", flexShrink: 1 },
  meta: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },
  metaSmall: { color: "#71717A", fontSize: 11, marginTop: 2 },
  muted: { color: "#A1A1AA", fontSize: 13 },
  link: { color: "#FFFFFF", fontSize: 14, textDecorationLine: "underline" },
  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  sectionMuted: { color: "#71717A", fontWeight: "400" },
  warn: { color: "#FBBF24", fontSize: 12 },
  hint: { color: "#71717A", fontSize: 11, lineHeight: 16 },
  input: {
    height: 38,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#FFFFFF",
    fontSize: 14,
  },
  iconBtn: { padding: 8, borderRadius: 8 },
  primaryBtn: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#000000", fontSize: 14, fontWeight: "600" },
  outlineBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  outlineText: { color: "#FFFFFF", fontSize: 14 },
  dangerBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dangerText: { color: "#F87171", fontSize: 14 },
  addBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  tile: { width: "100%", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", overflow: "hidden" },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  itemLabel: { color: "#A1A1AA", fontSize: 10, textAlign: "center", marginTop: 3 },
});
