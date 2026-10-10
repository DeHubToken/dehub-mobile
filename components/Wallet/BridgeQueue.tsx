import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
/**
 * Every bridge transfer from the last seven days, from everyone — the "Bridges"
 * list at the foot of the web Bridge page. Read-only and public: the relay's
 * incoming transfers as the `bridge-transfers` edge function reports them.
 * BridgeTab's own "recent" list is the viewer's slice of the same feed.
 */
import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { DeHubLoader } from "../DeHubLoader";
import { DhbCoin } from "../common/DhbCoin";
import { supabase } from "../../services/supabase";
import { appLocale } from "../../libs/date.util";
import { formatBridgeAmount } from "../../libs/bridge-amount";
import { FIELD_TEXT } from "../../theme/inputs";
import { PageSection } from "../page/PageKit";

interface BridgeTransfer {
  txHash: string;
  from: string;
  amount: string;
  chain: string;
  chainId: number;
  explorerUrl: string;
  timestamp: number;
  status: string;
}

const PAGE_SIZE = 10;

async function fetchBridgeTransfers(): Promise<BridgeTransfer[]> {
  const { data, error } = await supabase.functions.invoke("bridge-transfers");
  if (error) throw error;
  return (data?.transfers ?? []) as BridgeTransfer[];
}

const shorten = (addr: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

function when(unix: number): string {
  const d = new Date(unix * 1000);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(appLocale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function BridgeQueue() {
  const { t } = useTranslation();
  const [search, setSearch] = useSurfaceDraft("components/Wallet/BridgeQueue.tsx:search", "");
  const [shown, setShown] = useState(PAGE_SIZE);

  const { data: transfers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["bridge-transfers"],
    queryFn: fetchBridgeTransfers,
    staleTime: 60_000,
    retry: 1,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter(
      (x) =>
        x.from?.toLowerCase().includes(q) ||
        x.txHash?.toLowerCase().includes(q) ||
        String(x.amount).toLowerCase().includes(q) ||
        x.chain?.toLowerCase().includes(q),
    );
  }, [transfers, search]);

  const visible = filtered.slice(0, shown);

  return (
    <PageSection
      title={t("bridge.queueTitle")}
      action={<Text style={styles.count}>{t("bridge.transferCount", { count: transfers.length })}</Text>}
    >

      <View style={styles.searchBox}>
        <Icon name="Search" size={14} color="rgba(255,255,255,0.35)" />
        <TextInput
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setShown(PAGE_SIZE);
          }}
          placeholder={t("bridge.searchPlaceholder")}
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, FIELD_TEXT]}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <DeHubLoader size={36} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{t("bridge.queueLoadFailed")}</Text>
          <Pressable onPress={() => refetch()} style={styles.pill} accessibilityRole="button">
            <Text style={styles.pillText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{search ? t("bridge.noMatches") : t("bridge.noneRecent")}</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {visible.map((x) => (
            <Pressable
              key={`${x.txHash}-${x.from}`}
              onPress={() => x.explorerUrl && Linking.openURL(x.explorerUrl)}
              style={styles.row}
              accessibilityRole="link"
            >
              <View style={styles.chainBadge}>
                <Text style={styles.chainText}>{x.chainId === 8453 ? "B" : "BNB"}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.from} numberOfLines={1}>{shorten(x.from)}</Text>
                <Text style={styles.hash} numberOfLines={1}>{`${x.txHash.slice(0, 18)}…`}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.amount}>
                  {formatBridgeAmount(x.amount, appLocale())} <DhbCoin size={11} />
                </Text>
                <Text style={styles.hash}>{when(x.timestamp)}</Text>
              </View>
              <Icon name="ExternalLink" size={12} color="rgba(255,255,255,0.25)" />
            </Pressable>
          ))}
          {filtered.length > shown && (
            <Pressable onPress={() => setShown((n) => n + PAGE_SIZE)} style={[styles.pill, { alignSelf: "center" }]} accessibilityRole="button">
              <Text style={styles.pillText}>{t("bridge.showMore")}</Text>
            </Pressable>
          )}
        </View>
      )}
    </PageSection>
  );
}

const styles = StyleSheet.create({
  count: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 13 },
  center: { alignItems: "center", paddingVertical: 24, gap: 12 },
  empty: { color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center" },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  chainBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  chainText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  from: { color: "#FFFFFF", fontSize: 12, fontWeight: "500" },
  hash: { color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2 },
  amount: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
});
