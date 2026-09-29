/**
 * PacksScreen — dehub.io/packs
 *
 * Native port of dehubweb's pages/app/PacksPage.tsx. Your emoji, sticker and
 * GIF packs, the ones you added from other people, and the most-added packs
 * to find new ones. Creating is for badge holders; the tier table here is the
 * same one the creator-packs function enforces.
 */

import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import Icon from "../components/ui/Icon";
import { useAuthActions, useAuthState } from "../context/AuthContext";
import { toastError } from "../libs/toast";
import {
  createPack,
  useInvalidatePacks,
  useOwnedPacks,
  usePackStatus,
  usePopularPacks,
  useSavedPacks,
  type CreatorPack,
  type PackKind,
} from "../libs/creator-packs/api";
import { PACK_KINDS, PACK_TIER_ORDER, packLimitsFor } from "../libs/creator-packs/limits";
import { PackCover } from "../components/packs/PackPickerParts";
import { PackLocked, packErrorMessage, usePackWallet, usePacksNavigation } from "../components/packs/PackGate";

const KIND_TAB: Record<PackKind, string> = {
  emoji: "creatorPacks.tab.emoji",
  sticker: "creatorPacks.tab.sticker",
  gif: "creatorPacks.tab.gif",
};

function PackCard({ pack }: { pack: CreatorPack }) {
  const { t } = useTranslation();
  const { openPack } = usePacksNavigation();
  return (
    <Pressable
      onPress={() => openPack(pack.slug)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cover}>
        <PackCover pack={pack} size={40} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.cardTitle}>{pack.name}</Text>
        <Text style={styles.cardMeta}>
          {t("creatorPacks.itemCount", { count: pack.item_count })} · {t("creatorPacks.saveCount", { count: pack.save_count })}
        </Text>
      </View>
    </Pressable>
  );
}

function TierTable() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const cols = ["packs", "emoji", "stickers", "gifs"] as const;
  return (
    <View style={styles.panel}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.tierToggle}
      >
        <Text style={styles.panelText}>{t("creatorPacks.tierTable")}</Text>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Icon name="ChevronDown" size={16} color="#A1A1AA" />
        </View>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <View style={styles.tierRow}>
            <Text style={[styles.tierHead, styles.tierName]}>{t("creatorPacks.col.tier")}</Text>
            {cols.map((c) => (
              <Text key={c} style={[styles.tierHead, styles.tierNum]}>{t(`creatorPacks.col.${c}`)}</Text>
            ))}
          </View>
          {PACK_TIER_ORDER.map((tier) => {
            const l = packLimitsFor(tier);
            return (
              <View key={tier} style={[styles.tierRow, styles.tierBorder]}>
                <Text numberOfLines={1} style={[styles.tierCell, styles.tierName]}>{tier}</Text>
                {[l.packs, l.items.emoji, l.items.sticker, l.items.gif].map((n, i) => (
                  <Text key={cols[i]} style={[styles.tierCell, styles.tierNum]}>{n}</Text>
                ))}
              </View>
            );
          })}
          <Text style={styles.hint}>{t("creatorPacks.tierTableHint")}</Text>
        </View>
      )}
    </View>
  );
}

export default function PacksScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // The KeyboardAvoidingView is the screen root and wraps the ScreenHeader, so
  // only the root SafeAreaView's inset sits above it. Adding the header height
  // would count it twice.
  const keyboardOffset = useKeyboardOffset();
  const wallet = usePackWallet();
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const { openPack } = usePacksNavigation();
  const [kind, setKind] = useState<PackKind>("emoji");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const status = usePackStatus(wallet);
  const owned = useOwnedPacks(wallet);
  const saved = useSavedPacks(wallet);
  const popular = usePopularPacks(kind);
  const invalidate = useInvalidatePacks();

  const signedIn = isSignedIn && !!wallet;
  const mine = (owned.data ?? []).filter((p) => p.kind === kind);
  const added = (saved.data ?? []).filter((p) => p.kind === kind);
  const limits = status.data?.limits;
  const canCreate = !!limits && mine.length < limits.packs;

  const create = async () => {
    if (!name.trim() || !wallet) return;
    setBusy(true);
    try {
      const pack = await createPack(wallet, kind, name.trim());
      await invalidate();
      setName("");
      openPack(pack.slug);
    } catch (err) {
      toastError(packErrorMessage(err, t, kind));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
      <ScreenHeader title={t("creatorPacks.title")} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: insets.bottom + 24, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>{t("creatorPacks.subtitle")}</Text>

        {signedIn && status.data && (
          status.data.limits.packs === 0 ? (
            <View style={styles.panel}><PackLocked /></View>
          ) : (
            <View style={[styles.panel, { paddingHorizontal: 14, paddingVertical: 12 }]}>
              <Text style={styles.panelText}>
                {t("creatorPacks.yourTier", {
                  tier: status.data.tier,
                  packs: status.data.limits.packs,
                  emoji: status.data.limits.items.emoji,
                  stickers: status.data.limits.items.sticker,
                  gifs: status.data.limits.items.gif,
                })}
              </Text>
            </View>
          )
        )}
        <TierTable />

        <View style={styles.segment}>
          {PACK_KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: kind === k }}
              style={[styles.segmentItem, kind === k && styles.segmentItemOn]}
            >
              <Text style={[styles.segmentText, kind === k && styles.segmentTextOn]}>{t(KIND_TAB[k])}</Text>
            </Pressable>
          ))}
        </View>

        {!signedIn ? (
          <Pressable onPress={() => requireAuth(() => {})} accessibilityRole="button" style={styles.primaryBtn}>
            <Text style={styles.primaryText}>{t("creatorPacks.signInToCreate")}</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionTitle}>
              {t("creatorPacks.yourPacks")}
              {limits && limits.packs > 0 ? <Text style={styles.sectionMuted}> · {mine.length}/{limits.packs}</Text> : null}
            </Text>
            {owned.isLoading ? (
              <ActivityIndicator size="small" color="#71717A" style={{ alignSelf: "flex-start" }} />
            ) : (
              <>
                {mine.map((p) => <PackCard key={p.id} pack={p} />)}
                {canCreate && (
                  <View style={styles.createRow}>
                    <TextInput
                      value={name}
                      onChangeText={(v) => setName(v.slice(0, 64))}
                      onSubmitEditing={create}
                      returnKeyType="done"
                      placeholder={t("creatorPacks.packNamePlaceholder")}
                      placeholderTextColor="#71717A"
                      style={styles.input}
                    />
                    <Pressable
                      disabled={busy || !name.trim()}
                      onPress={create}
                      accessibilityRole="button"
                      style={[styles.createBtn, (busy || !name.trim()) && { opacity: 0.4 }]}
                    >
                      {busy ? <ActivityIndicator size="small" color="#000" /> : <Icon name="Plus" size={16} color="#000" />}
                      <Text style={styles.primaryText}>{t("creatorPacks.createPack")}</Text>
                    </Pressable>
                  </View>
                )}
                {!mine.length && !canCreate && limits && limits.packs > 0 && (
                  <Text style={styles.muted}>{t("creatorPacks.errors.packLimit")}</Text>
                )}
              </>
            )}

            {added.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 8 }]}>{t("creatorPacks.addedPacks")}</Text>
                {added.map((p) => <PackCard key={p.id} pack={p} />)}
              </>
            )}
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>{t("creatorPacks.popular")}</Text>
          {popular.isLoading ? (
            <ActivityIndicator size="small" color="#71717A" style={{ alignSelf: "flex-start" }} />
          ) : popular.data?.length ? (
            popular.data.map((p) => <PackCard key={p.id} pack={p} />)
          ) : (
            <Text style={styles.muted}>{t("creatorPacks.noneYet")}</Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  subtitle: { color: "#A1A1AA", fontSize: 14, lineHeight: 20 },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  panelText: { color: "#D4D4D8", fontSize: 14, lineHeight: 20, flexShrink: 1 },
  tierToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tierRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  tierBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  tierHead: { color: "#71717A", fontSize: 11, fontWeight: "600" },
  tierCell: { color: "#D4D4D8", fontSize: 12 },
  tierName: { flex: 1.8 },
  tierNum: { flex: 1, textAlign: "right" },
  hint: { color: "#71717A", fontSize: 11, lineHeight: 16, marginTop: 8 },
  segment: { flexDirection: "row", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", padding: 4 },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8 },
  segmentItemOn: { backgroundColor: "rgba(255,255,255,0.15)" },
  segmentText: { color: "#A1A1AA", fontSize: 13 },
  segmentTextOn: { color: "#FFFFFF", fontWeight: "600" },
  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  sectionMuted: { color: "#71717A", fontWeight: "400" },
  muted: { color: "#71717A", fontSize: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  cardPressed: { backgroundColor: "rgba(255,255,255,0.07)" },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  cardMeta: { color: "#A1A1AA", fontSize: 11, marginTop: 2 },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.2)",
  },
  input: {
    flex: 1,
    minWidth: 0,
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
  createBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  primaryBtn: { height: 42, borderRadius: 10, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#000000", fontSize: 14, fontWeight: "600" },
});
