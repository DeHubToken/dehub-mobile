/**
 * The badge gate and pack chooser shared by every "add to a pack" form — the
 * mobile twin of dehubweb's components/app/packs/PackGate.tsx.
 *
 * The server decides — the `creator-packs` function reads the caller's badge
 * and refuses past the tier's caps. What lives here only mirrors that so the
 * form can say "you need a badge" or "this pack is full" before a round trip.
 */

import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { DIGITAL_PURCHASES_ENABLED } from "../../config/storefront";
import {
  MAX_PACK_UPLOAD_BYTES,
  PackError,
  createPack,
  useInvalidatePacks,
  useOwnedPacks,
  usePackStatus,
  type CreatorPack,
  type PackKind,
} from "../../libs/creator-packs/api";

/** The signed-in wallet, lowercased, or null. */
export function usePackWallet(): string | null {
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const wallet = user?.walletAddress || user?.address || null;
  return wallet ? wallet.toLowerCase() : null;
}

/**
 * Routes into the packs screens and the staking tab. `beforeLeave` closes
 * whatever sheet or modal the caller lives in, so the new screen is not
 * hidden behind it.
 */
export function usePacksNavigation(beforeLeave?: () => void) {
  const navigation = useNavigation<any>();
  const go = useCallback(
    (name: ScreenNames, params?: Record<string, unknown>) => {
      beforeLeave?.();
      navigation.navigate(name, params);
    },
    [beforeLeave, navigation],
  );
  return {
    openPacks: useCallback(() => go(ScreenNames.Packs), [go]),
    openPack: useCallback((slug: string) => go(ScreenNames.Pack, { slug }), [go]),
    openStaking: useCallback(() => go(ScreenNames.Dpay, { initialTab: "stake" }), [go]),
  };
}

/** A user-facing message for anything the packs API throws. */
export function packErrorMessage(err: unknown, t: TFunction, kind: PackKind = "emoji"): string {
  const code = err instanceof PackError ? err.code : undefined;
  switch (code) {
    case "NO_BADGE":
      return t("creatorPacks.errors.noBadge");
    case "PACK_LIMIT":
      return t("creatorPacks.errors.packLimit");
    case "ITEM_LIMIT":
      return t("creatorPacks.errors.itemLimit");
    case "FILE_TYPE":
      return t("creatorPacks.errors.fileType");
    case "FILE_SIZE":
      return t("creatorPacks.errors.fileSize", { mb: MAX_PACK_UPLOAD_BYTES[kind] / (1024 * 1024) });
    default:
      return t("creatorPacks.errors.generic");
  }
}

export function PackLocked({ compact, beforeLeave }: { compact?: boolean; beforeLeave?: () => void }) {
  const { t } = useTranslation();
  const { openPacks, openStaking } = usePacksNavigation(beforeLeave);
  return (
    <View className={`items-center ${compact ? "px-3 py-5" : "px-6 py-8"}`} style={{ gap: 8 }}>
      <Icon name="Lock" size={20} color="#A1A1AA" />
      <Text className="text-sm font-medium text-white text-center">{t("creatorPacks.lockedTitle")}</Text>
      <Text className="text-xs leading-4 text-theme-neutrals-400 text-center" style={{ maxWidth: 300 }}>
        {t("creatorPacks.lockedBody")}
      </Text>
      <View className="flex-row mt-1" style={{ gap: 8 }}>
        {DIGITAL_PURCHASES_ENABLED && (
          <Pressable
            onPress={openStaking}
            accessibilityRole="button"
            className="h-8 px-3 rounded-lg bg-white items-center justify-center"
          >
            <Text className="text-black text-xs font-semibold">{t("creatorPacks.getBadge")}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={openPacks}
          accessibilityRole="button"
          className="h-8 px-3 rounded-lg border border-white/15 items-center justify-center"
        >
          <Text className="text-white text-xs">{t("creatorPacks.browse")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const NEW = "__new__";

/**
 * Which of your packs of `kind` the form adds to, or a new one by name.
 * `ensurePack` creates the new one on submit, so an abandoned form never
 * leaves an empty pack behind.
 */
export function usePackTarget(wallet: string | null | undefined, kind: PackKind) {
  const status = usePackStatus(wallet);
  const owned = useOwnedPacks(wallet);
  const invalidate = useInvalidatePacks();
  const packs = (owned.data ?? []).filter((p) => p.kind === kind);
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const limits = status.data?.limits;
  const canCreate = !!limits && packs.length < limits.packs;
  const selected = choice === NEW ? null : packs.find((p) => p.id === choice) ?? (choice ? null : packs[0] ?? null);
  const creating = choice === NEW || (!selected && canCreate);
  const room = limits ? (selected ? Math.max(0, limits.items[kind] - selected.item_count) : limits.items[kind]) : 0;

  const ensurePack = async (): Promise<CreatorPack> => {
    if (selected) return selected;
    if (!wallet) throw new PackError("Not signed in", "AUTH");
    const pack = await createPack(wallet, kind, newName.trim());
    setChoice(pack.id);
    setNewName("");
    await invalidate();
    return pack;
  };

  return {
    loading: status.isLoading || owned.isLoading,
    locked: !!status.data && status.data.limits.packs === 0,
    limits,
    packs,
    selected,
    creating,
    canCreate,
    room,
    newName,
    setNewName,
    choice: creating ? NEW : selected?.id ?? "",
    setChoice,
    ready: creating ? !!newName.trim() : !!selected && room > 0,
    ensurePack,
    invalidate,
  };
}

export type PackTarget = ReturnType<typeof usePackTarget>;

const INPUT_CLASS = "h-9 px-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-[13px]";

/** Your packs as chips, plus "+ New pack" while the tier has room for another. */
export function PackTargetField({ target, kind }: { target: PackTarget; kind: PackKind }) {
  const { t } = useTranslation();
  const chip = (key: string, label: string) => {
    const active = target.choice === key;
    return (
      <Pressable
        key={key}
        onPress={() => target.setChoice(key)}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        className={`h-8 px-3 rounded-lg items-center justify-center border ${
          active ? "bg-white/15 border-white/30" : "bg-white/5 border-white/10"
        }`}
      >
        <Text numberOfLines={1} className={`text-xs ${active ? "text-white" : "text-theme-neutrals-400"}`}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      <Text className="text-[11px] text-theme-neutrals-500">{t("creatorPacks.pack")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {target.packs.map((p) => chip(p.id, `${p.name} (${p.item_count}/${target.limits?.items[kind] ?? "–"})`))}
        {target.canCreate && chip(NEW, t("creatorPacks.newPackOption"))}
      </ScrollView>
      {target.creating && (
        <TextInput
          value={target.newName}
          onChangeText={(v) => target.setNewName(v.slice(0, 64))}
          placeholder={t("creatorPacks.packNamePlaceholder")}
          placeholderTextColor="#71717A"
          className={INPUT_CLASS}
          style={{ paddingVertical: 0 }}
        />
      )}
      {!target.creating && target.selected && target.room === 0 && (
        <Text className="text-[11px] leading-4 text-amber-400">{t("creatorPacks.errors.itemLimit")}</Text>
      )}
    </View>
  );
}
