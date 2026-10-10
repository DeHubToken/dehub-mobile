import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
/**
 * Add custom emoji, inside the picker — the mobile twin of dehubweb's
 * components/app/emoji/AddCustomEmojiPanel.tsx.
 *
 * Two ways in:
 *   One emoji — pick an image from the library, or paste anything that points
 *     at one: a Discord `<:name:id>`, a Discord/7TV/BTTV/FFZ link, or any image
 *     link (emoji.gg, Slackmojis, a Slack export). The name is prefilled from
 *     the source when it carries one.
 *   A pack — a Mastodon/Pleroma/Akkoma or Misskey instance, or any JSON emoji
 *     list; every name not already taken is added in one go, up to the room
 *     left in the pack.
 *
 * Either way the emoji land in one of your emoji packs. Packs are a badge
 * holder perk and the tier sets how many packs and how many emoji each — the
 * creator-packs function enforces that, this form only mirrors it.
 */

import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { ensureMediaLibraryPermission } from "../../libs/permissions.util";
import { toastError, toastSuccess } from "../../libs/toast";
import {
  EMOJI_UPLOAD_TYPES,
  MAX_EMOJI_UPLOAD_BYTES,
  checkShortcode,
  emojiImageType,
  fetchEmojiPack,
  getCustomEmoji,
  normaliseShortcode,
  parseEmojiSource,
  probeImage,
  type EmojiSource,
  type PickedEmojiImage,
} from "../../libs/emoji/custom-emoji";
import { loadShortcodes } from "../../libs/emoji/shortcodes";
import { localFileSize } from "../../libs/storage-upload";
import { addPackItems, uploadPackImage } from "../../libs/creator-packs/api";
import { PackLocked, PackTargetField, packErrorMessage, usePackTarget, usePackWallet } from "../packs/PackGate";

const MAX_PACK = 500;

const PROBLEM_KEY = { invalid: "invalid", standard: "shortcodeStandard", taken: "shortcodeTaken" } as const;

const INPUT_CLASS = "h-9 px-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-[13px]";

export default function AddCustomEmojiPanel({ onDone, onLeave }: { onDone: () => void; onLeave?: () => void }) {
  const { t } = useTranslation();
  const walletAddress = usePackWallet();
  const [mode, setMode] = useState<"single" | "pack">("single");
  const [link, setLink] = useSurfaceDraft("components/common/AddCustomEmojiPanel.tsx:link", "");
  const [file, setFile] = useState<PickedEmojiImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [source, setSource] = useState<EmojiSource | null>(null);
  const [name, setName] = useSurfaceDraft("components/common/AddCustomEmojiPanel.tsx:name", "");
  const [pack, setPack] = useSurfaceDraft("components/common/AddCustomEmojiPanel.tsx:pack", "");
  const [busy, setBusy] = useState(false);
  const target = usePackTarget(walletAddress, "emoji");

  const onLink = (value: string) => {
    setLink(value);
    setFile(null);
    const parsed = parseEmojiSource(value);
    setSource(parsed);
    setPreview(parsed?.imageUrl ?? null);
    if (parsed?.name && !name) setName(normaliseShortcode(parsed.name));
  };

  const pickFile = async () => {
    const permission = await ensureMediaLibraryPermission();
    if (!permission.granted) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset) return;
    const image: PickedEmojiImage = {
      uri: asset.uri,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      fileSize: asset.fileSize ?? (await localFileSize(asset.uri)),
    };
    if (!EMOJI_UPLOAD_TYPES.includes(emojiImageType(image))) return toastError(t("emojiPicker.errors.fileType"));
    if (image.fileSize != null && image.fileSize > MAX_EMOJI_UPLOAD_BYTES) return toastError(t("emojiPicker.errors.fileSize"));
    setFile(image);
    setLink("");
    setSource(null);
    setPreview(image.uri);
    if (!name && image.fileName) setName(normaliseShortcode(image.fileName.replace(/\.\w+$/, "")));
  };

  const submitSingle = async () => {
    if (!walletAddress) return toastError(t("emojiPicker.errors.signIn"));
    const code = normaliseShortcode(name);
    const problem = await checkShortcode(code);
    if (problem) return toastError(t(`emojiPicker.errors.${PROBLEM_KEY[problem]}`, { name: `:${code}:` }));
    if (!target.ready) return;
    setBusy(true);
    try {
      let imageUrl: string;
      let animated: boolean;
      let src = "upload";
      if (file) {
        imageUrl = await uploadPackImage(file, walletAddress, "emoji");
        animated = emojiImageType(file) === "image/gif";
      } else if (source) {
        if (!(await probeImage(source.imageUrl))) {
          toastError(t("emojiPicker.errors.badImage"));
          return;
        }
        ({ imageUrl, animated, source: src } = source);
      } else {
        return;
      }
      const packRow = await target.ensurePack();
      const { added } = await addPackItems(walletAddress, packRow.id, [{ shortcode: code, imageUrl, animated }], src);
      await target.invalidate();
      if (!added) {
        toastError(t("emojiPicker.errors.shortcodeTaken", { name: `:${code}:` }));
        return;
      }
      toastSuccess(t("emojiPicker.addedName", { name: `:${code}:` }));
      onDone();
    } catch (err) {
      console.error("[custom-emoji] add failed", err);
      toastError(packErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const submitPack = async () => {
    if (!walletAddress) return toastError(t("emojiPicker.errors.signIn"));
    if (!target.ready) return;
    setBusy(true);
    try {
      const [items, idx] = await Promise.all([fetchEmojiPack(pack), loadShortcodes().catch(() => null)]);
      if (!items.length) {
        toastError(t("emojiPicker.errors.packEmpty"));
        return;
      }
      const seen = new Set<string>();
      const fresh = items
        .filter((i) => {
          if (seen.has(i.shortcode) || getCustomEmoji(i.shortcode) || (idx && i.shortcode in idx)) return false;
          seen.add(i.shortcode);
          return true;
        })
        .slice(0, Math.min(MAX_PACK, target.room));
      const packSource = /\/api\/emojis/.test(pack) ? "misskey" : "mastodon";
      const packRow = await target.ensurePack();
      // Taken names are skipped server-side, so one batch is enough.
      const { added } = await addPackItems(
        walletAddress,
        packRow.id,
        fresh.map((it) => ({ shortcode: it.shortcode, imageUrl: it.imageUrl, animated: it.animated })),
        packSource,
      );
      await target.invalidate();
      toastSuccess(t("emojiPicker.packAdded", { count: added, skipped: items.length - added }));
      if (added) onDone();
    } catch (err) {
      console.error("[custom-emoji] pack failed", err);
      toastError(packErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled =
    busy || !target.ready || (mode === "single" ? !name || (!file && !source) : !pack.trim());

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel={t("emojiPicker.back")}
          hitSlop={6}
          className="p-1 rounded-lg"
        >
          <Icon name="ArrowLeft" size={18} color="#D4D4D8" />
        </Pressable>
        <View className="flex-1 min-w-0 flex-row rounded-lg bg-white/5 p-0.5">
          {(["single", "pack"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              className={`flex-1 min-w-0 items-center px-2 py-1.5 rounded-md ${mode === m ? "bg-white/15" : ""}`}
            >
              <Text numberOfLines={1} className={`text-xs ${mode === m ? "text-white" : "text-theme-neutrals-400"}`}>
                {t(m === "single" ? "emojiPicker.modeSingle" : "emojiPicker.modePack")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {target.loading ? (
        <View className="py-6 items-center justify-center">
          <ActivityIndicator color="#71717A" size="small" />
        </View>
      ) : target.locked ? (
        <PackLocked compact beforeLeave={onLeave} />
      ) : (
        <>
          <PackTargetField target={target} kind="emoji" />
          {mode === "single" ? (
            <>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <Pressable
                  onPress={pickFile}
                  accessibilityRole="button"
                  accessibilityLabel={t("emojiPicker.upload")}
                  className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 items-center justify-center overflow-hidden"
                >
                  {preview ? (
                    <Image source={{ uri: preview }} resizeMode="contain" style={{ width: 44, height: 44 }} />
                  ) : (
                    <Icon name="Upload" size={16} color="#71717A" />
                  )}
                </Pressable>
                <Pressable
                  onPress={pickFile}
                  accessibilityRole="button"
                  className="flex-1 h-9 rounded-lg border border-white/10 bg-white/5 items-center justify-center"
                >
                  <Text className="text-white text-xs">{t("emojiPicker.upload")}</Text>
                </Pressable>
              </View>
              <TextInput
                value={link}
                onChangeText={onLink}
                placeholder={t("emojiPicker.linkPlaceholder")}
                placeholderTextColor="#71717A"
                autoCapitalize="none"
                autoCorrect={false}
                className={INPUT_CLASS}
                style={{ paddingVertical: 0 }}
              />
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Text className="text-theme-neutrals-500">:</Text>
                <TextInput
                  value={name}
                  onChangeText={(v) => setName(normaliseShortcode(v))}
                  placeholder={t("emojiPicker.namePlaceholder")}
                  placeholderTextColor="#71717A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className={`flex-1 min-w-0 ${INPUT_CLASS}`}
                  style={{ paddingVertical: 0 }}
                />
                <Text className="text-theme-neutrals-500">:</Text>
              </View>
              <Text className="text-[11px] leading-4 text-theme-neutrals-500">{t("emojiPicker.singleHint")}</Text>
            </>
          ) : (
            <>
              <TextInput
                value={pack}
                onChangeText={setPack}
                placeholder={t("emojiPicker.packPlaceholder")}
                placeholderTextColor="#71717A"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                className={INPUT_CLASS}
                style={{ paddingVertical: 0 }}
              />
              <Text className="text-[11px] leading-4 text-theme-neutrals-500">{t("emojiPicker.packHint")}</Text>
            </>
          )}

          <Pressable
            disabled={submitDisabled}
            onPress={mode === "single" ? submitSingle : submitPack}
            accessibilityRole="button"
            className="h-9 rounded-lg bg-white items-center justify-center"
            style={{ opacity: submitDisabled ? 0.4 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text className="text-black font-semibold text-[13px]">
                {t(mode === "single" ? "emojiPicker.add" : "emojiPicker.importPack")}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
