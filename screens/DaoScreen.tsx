/**
 * DAO Screen
 * ==========
 * Native twin of web's /dao. The treasury wallet, its live balance, who has
 * funded it and the share of the pool each contributor holds — the weight
 * their vote carries when the DAO decides how the treasury is spent.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import Icon from "../components/ui/Icon";
import GlassModal from "../components/ui/GlassModal";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/common/Avatar";
import { theme } from "../theme";
import { getAvatarUrl } from "../libs/misc";
import { toastError, toastSuccess } from "../libs/toast";
import { getAccount } from "../services/user.service";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { useDaoTreasury, useContributeToDao } from "../hooks/useDaoTreasury";
import {
  DAO_TREASURY_ADDRESS,
  daoTxUrl,
  shortAddress,
  formatDhb,
  formatShare,
  type DaoContributor,
  type DaoContribution,
} from "../libs/dao-treasury";

const QUICK_AMOUNTS = [100, 1_000, 10_000];

function useContributorProfile(address: string) {
  const { data } = useQuery({
    queryKey: ["dao-contributor-profile", address],
    queryFn: async () => {
      try {
        const res = await getAccount(address);
        return (res as any)?.data?.result ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60_000,
  });
  const username: string | undefined = data?.username || undefined;
  return {
    avatar: getAvatarUrl(data?.avatarImageUrl, 32),
    name: data?.displayName || username || shortAddress(address),
    handle: username ? `@${username}` : shortAddress(address),
  };
}

const ContributorRow: React.FC<{ row: DaoContributor; rank: number; isSelf: boolean }> = ({ row, rank, isSelf }) => {
  const { t } = useTranslation();
  const profile = useContributorProfile(row.address);
  return (
    <View style={[styles.row, isSelf && styles.rowSelf]}>
      <Text style={styles.rank}>{rank}</Text>
      <Avatar uri={profile.avatar} size={32} name={profile.name} />
      <View style={styles.rowBody}>
        <View style={styles.rowTitle}>
          <Text style={styles.rowName} numberOfLines={1}>{profile.name}</Text>
          {isSelf && <Text style={styles.youTag}>{t("dao.you")}</Text>}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {profile.handle} · {t("dao.transferCount", { count: row.txCount })}
        </Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.max(1, row.share * 100)}%` }]} />
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowAmount}>{formatDhb(row.amount)} DHB</Text>
        <Text style={styles.rowShare}>{formatShare(row.share)} {t("dao.power")}</Text>
      </View>
    </View>
  );
};

const RecentRow: React.FC<{ item: DaoContribution }> = ({ item }) => {
  const profile = useContributorProfile(item.from);
  const when = item.timestamp ? new Date(item.timestamp * 1000).toLocaleDateString() : "";
  return (
    <Pressable onPress={() => Linking.openURL(daoTxUrl(item.chainId, item.txHash))} style={styles.recentRow}>
      <Text style={styles.recentName} numberOfLines={1}>{profile.name}</Text>
      <Text style={styles.recentWhen}>{when}</Text>
      <Text style={styles.recentAmount}>+{formatDhb(item.amount)}</Text>
      <Icon name="ExternalLink" size={13} color="#71717A" />
    </Pressable>
  );
};

export default function DaoScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const { requireAuth } = useAuthActions();
  const signedIn = isSignedIn && !needsUsername;

  const { data, isLoading, isError, refetch, isRefetching } = useDaoTreasury();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const pay = useContributeToDao(sheetOpen && signedIn);

  const self = (user?.walletAddress || user?.address || "").toLowerCase() || null;
  const ownRow = useMemo(
    () => (self && data ? data.contributors.find((c) => c.address === self) ?? null : null),
    [data, self],
  );

  const openContribute = useCallback(() => {
    requireAuth(() => setSheetOpen(true));
  }, [requireAuth]);

  const copyAddress = useCallback(async () => {
    await Clipboard.setStringAsync(DAO_TREASURY_ADDRESS);
    toastSuccess(t("dao.addressCopied"));
  }, [t]);

  const parsed = Math.floor(Number(amount));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const handleSend = useCallback(async () => {
    if (!valid) return;
    try {
      const result = await pay.contribute(parsed);
      toastSuccess(
        t("dao.sentDesc", { amount: parsed.toLocaleString(), chain: pay.chainName || "" }),
      );
      setAmount("");
      setSheetOpen(false);
      void result;
    } catch (err) {
      toastError(err, t("dao.sendFailed"));
    }
  }, [valid, parsed, pay, t]);

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.card}>
        <View style={styles.balanceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t("dao.treasuryBalance")}</Text>
            {isLoading ? (
              <ActivityIndicator color="#71717A" style={{ alignSelf: "flex-start", marginTop: 6 }} />
            ) : (
              <Text style={styles.balance}>{formatDhb(data?.totalBalance ?? 0)} DHB</Text>
            )}
          </View>
          <Pressable onPress={() => refetch()} hitSlop={8} style={styles.iconBtn}>
            <Icon name="RefreshCw" size={16} color="#A1A1AA" />
          </Pressable>
        </View>

        {data && (
          <View style={styles.chainGrid}>
            {data.balances.map((b) => (
              <Pressable
                key={b.chainId}
                onPress={() => Linking.openURL(`${b.explorerUrl}/address/${DAO_TREASURY_ADDRESS}`)}
                style={styles.chainCell}
              >
                <Text style={styles.chainName}>{b.name}</Text>
                <Text style={styles.chainAmount}>{formatDhb(b.amount)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.label, { marginTop: 14 }]}>{t("dao.treasuryAddress")}</Text>
        <View style={styles.addressRow}>
          <Text style={styles.address} selectable>{DAO_TREASURY_ADDRESS}</Text>
          <Pressable onPress={copyAddress} hitSlop={8} style={styles.copyBtn}>
            <Icon name="Copy" size={15} color="#FAFAFA" />
          </Pressable>
        </View>
        <Text style={styles.hint}>{t("dao.sendAnyWallet")}</Text>
        {isError && !data && <Text style={styles.error}>{t("dao.loadFailed")}</Text>}

        <Pressable onPress={openContribute} style={styles.primaryBtn}>
          <Icon name="HeartHandshake" size={16} color="#09090B" />
          <Text style={styles.primaryBtnText}>{t("dao.contribute")}</Text>
        </Pressable>
      </View>

      {signedIn && data && (
        <View style={styles.card}>
          <Text style={styles.label}>{t("dao.yourPower")}</Text>
          {ownRow ? (
            <>
              <Text style={styles.power}>{formatShare(ownRow.share)}</Text>
              <Text style={styles.hint}>{t("dao.yourContribution", { amount: formatDhb(ownRow.amount) })}</Text>
            </>
          ) : (
            <Text style={styles.hint}>{t("dao.noContributionYet")}</Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("dao.howItWorksTitle")}</Text>
        <Text style={styles.body}>{t("dao.howItWorksBody")}</Text>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t("dao.contributors")}</Text>
        {data && <Text style={styles.hint}>{t("dao.pooledTotal", { amount: formatDhb(data.totalContributed) })}</Text>}
      </View>
    </View>
  );

  const footer = data && data.recent.length > 0 ? (
    <View style={styles.footerBlock}>
      <Text style={styles.sectionTitle}>{t("dao.recent")}</Text>
      <View style={{ gap: 6 }}>
        {data.recent.map((item) => <RecentRow key={`${item.chainId}-${item.txHash}`} item={item} />)}
      </View>
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("dao.title")}
        subtitle={t("dao.subtitle")}
        rightContent={<Icon name="Landmark" size={22} color={theme.colors.accent} />}
      />

      <FlatList
        data={data?.contributors ?? []}
        keyExtractor={(c) => c.address}
        renderItem={({ item, index }) => <ContributorRow row={item} rank={index + 1} isSelf={item.address === self} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}><ActivityIndicator color="#FFFFFF" /></View>
          ) : (
            <Text style={[styles.hint, { paddingHorizontal: 12 }]}>{t("dao.noContributors")}</Text>
          )
        }
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, gap: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.accent} />}
      />

      <GlassModal scrollable visible={sheetOpen} onClose={() => setSheetOpen(false)} presentation="bottom" maxHeight="80%">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t("dao.contribute")}</Text>
            <Text style={styles.body}>{t("dao.contributeIntro")}</Text>

            <Text style={[styles.label, { marginTop: 8 }]}>{t("dao.amountLabel")}</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="1000"
              placeholderTextColor="#52525B"
              style={styles.input}
            />
            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((q) => (
                <Pressable key={q} onPress={() => setAmount(String(q))} style={styles.quickChip}>
                  <Text style={styles.quickText}>{q.toLocaleString()}</Text>
                </Pressable>
              ))}
              {pay.walletDhb > 0 && (
                <Pressable onPress={() => setAmount(String(Math.floor(pay.walletDhb)))} style={{ marginLeft: "auto" }}>
                  <Text style={styles.hint}>{t("dao.youHold", { amount: formatDhb(pay.walletDhb) })}</Text>
                </Pressable>
              )}
            </View>

            {pay.unsupportedChain && (
              <Text style={styles.error}>{t("dao.switchChain", { chains: pay.unsupportedChain })}</Text>
            )}
            <Text style={styles.hint}>{t("dao.irreversible")}</Text>

            <Pressable
              onPress={handleSend}
              disabled={!valid || pay.isPending || !!pay.unsupportedChain}
              style={[styles.primaryBtn, (!valid || pay.isPending || !!pay.unsupportedChain) && { opacity: 0.5 }]}
            >
              {pay.isPending ? (
                <ActivityIndicator color="#09090B" />
              ) : (
                <>
                  <Icon name="HeartHandshake" size={16} color="#09090B" />
                  <Text style={styles.primaryBtnText}>
                    {valid ? t("dao.sendAmount", { amount: parsed.toLocaleString() }) : t("dao.contribute")}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </GlassModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  headerBlock: { gap: 8, paddingBottom: 4 },
  footerBlock: { gap: 10, paddingTop: 12 },
  card: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 14,
    gap: 6,
  },
  balanceRow: { flexDirection: "row", alignItems: "flex-start" },
  label: { color: "#71717A", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  balance: { color: "#FFFFFF", fontSize: 30, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  iconBtn: { padding: 6 },
  chainGrid: { flexDirection: "row", gap: 8, marginTop: 10 },
  chainCell: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chainName: { color: "#71717A", fontSize: 11 },
  chainAmount: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  address: {
    flex: 1,
    color: "#D4D4D8",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  copyBtn: {
    padding: 9,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  hint: { color: "#71717A", fontSize: 12, lineHeight: 17 },
  body: { color: "#A1A1AA", fontSize: 13, lineHeight: 19 },
  error: { color: "#F87171", fontSize: 12, marginTop: 4 },
  primaryBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 11,
  },
  primaryBtnText: { color: "#09090B", fontSize: 14, fontWeight: "700" },
  power: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", fontVariant: ["tabular-nums"] },
  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, paddingTop: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  rowSelf: { backgroundColor: "rgba(255,255,255,0.10)" },
  rank: { width: 18, textAlign: "center", color: "#71717A", fontSize: 12, fontWeight: "600" },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  youTag: { color: "#A1A1AA", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  rowMeta: { color: "#71717A", fontSize: 11 },
  barTrack: { height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)", overflow: "hidden", marginTop: 4 },
  barFill: { height: "100%", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.7)" },
  rowRight: { alignItems: "flex-end" },
  rowAmount: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  rowShare: { color: "#A1A1AA", fontSize: 11, fontVariant: ["tabular-nums"] },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  recentName: { flex: 1, color: "#D4D4D8", fontSize: 13 },
  recentWhen: { color: "#71717A", fontSize: 11 },
  recentAmount: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  sheet: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 8 },
  sheetTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  input: {
    color: "#FFFFFF",
    fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  quickChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" },
  quickText: { color: "#D4D4D8", fontSize: 12 },
});
