/**
 * Top holders of a holder group, biggest first, from balances the database
 * verified. Mirrors dehubweb communities/TopHolders.tsx.
 */

import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getAccountSummaries } from "../../services/user.service";
import { useWalletAddress } from "../../hooks/useCommunityAdmin";
import { formatHolderAmount, holderGateOf, isDehubToken, useCommunityHolders } from "../../libs/holder-gate";

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");
import type { Community } from "../../types/community";

const PODIUM = ["#fcd34d", "#e4e4e7", "#fdba74"];

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

export function TopHolders({ community, limit = 10 }: { community: Community; limit?: number }) {
  const { t } = useTranslation();
  const wallet = useWalletAddress();
  const gate = holderGateOf(community);
  const { data: holders, isLoading } = useCommunityHolders(community.id, !!gate);
  const shown = (holders ?? []).filter((h) => !gate || h.balance >= gate.min).slice(0, limit);
  const addresses = shown.map((h) => h.wallet_address);
  const { data: summaries } = useQuery({
    queryKey: ["account-summaries", "holders", addresses.join(",")],
    enabled: addresses.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => getAccountSummaries(addresses),
  });
  const nameOf = (address: string) => {
    const s: any = summaries?.find((x: any) => String(x.address).toLowerCase() === address);
    return s?.displayName || s?.username || short(address);
  };

  if (!gate) return null;

  return (
    <View style={styles.card}>
      <Text className="text-white text-sm font-medium">
        {t("communities.holderGate.topHolders", { defaultValue: "Top holders" })}
      </Text>
      {isLoading ? (
        <Text className="text-zinc-500 text-xs mt-2">…</Text>
      ) : shown.length === 0 ? (
        <Text className="text-zinc-500 text-xs mt-1">
          {t("communities.holderGate.noHolders", { defaultValue: "Holders appear here once they join." })}
        </Text>
      ) : (
        <View className="mt-2">
          {shown.map((h, i) => (
            <View
              key={h.wallet_address}
              style={[styles.row, wallet?.toLowerCase() === h.wallet_address && styles.rowMine]}
            >
              <Text style={[styles.rank, { color: PODIUM[i] ?? "#71717a" }]}>{i + 1}</Text>
              <Text className="text-white text-sm flex-1" numberOfLines={1}>{nameOf(h.wallet_address)}</Text>
              {isDehubToken(gate) && <Image source={DEHUB_COIN} style={{ width: 14, height: 14, marginRight: 4 }} />}
              <Text className="text-zinc-400 text-xs">{formatHolderAmount(h.balance, gate.symbol)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    marginTop: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  rowMine: { backgroundColor: "rgba(255,255,255,0.06)" },
  rank: { width: 22, textAlign: "center", fontSize: 12, fontWeight: "700" },
});
