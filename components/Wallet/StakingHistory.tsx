/**
 * Deposit and withdrawal history under the staking card, matching web's
 * "Your Deposits" / "Your Withdrawals" panels on StakingPage. Rows come from
 * `staking_records`; the sync button asks `sync-staking-deposits` to scan the
 * chain for deposits the ledger missed.
 */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../services/supabase";
import { toastError, toastSuccess } from "../../libs/toast";
import { appLocale } from "../../libs/date.util";
import { DhbCoin } from "../common/DhbCoin";

type Kind = "stake" | "unstake";
interface StakingRecord {
  amount: number;
  tx_hash: string;
  chain: string;
  created_at: string;
}

function fmt(n: number) {
  return Number(n || 0).toLocaleString(appLocale(), { maximumFractionDigits: 2 });
}

export default function StakingHistory({ walletAddress, style }: { walletAddress?: string; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Kind | null>(null);
  const [syncing, setSyncing] = useState(false);
  const wallet = walletAddress?.toLowerCase();

  const { data: records = [], isLoading, refetch } = useQuery<StakingRecord[]>({
    queryKey: ["staking-records", wallet, open],
    enabled: !!wallet && !!open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staking_records")
        .select("amount, tx_hash, chain, created_at")
        .eq("wallet_address", wallet!)
        .eq("action", open!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as StakingRecord[];
    },
  });

  const sync = useCallback(async () => {
    if (!wallet || syncing) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-staking-deposits", { body: { wallet } });
      if (error) throw error;
      if ((data as any)?.newRecords > 0) {
        toastSuccess(t("staking.foundNewDeposits", { count: (data as any).newRecords }));
        await refetch();
      } else {
        toastSuccess(t("copy.7082f2b3815d", { defaultValue: "Deposits are up to date" }));
      }
    } catch (e) {
      toastError(e, t("copy.2d240e231566", { defaultValue: "Failed to sync deposits" }));
    } finally {
      setSyncing(false);
    }
  }, [wallet, syncing, refetch, t]);

  if (!wallet) return null;

  const tab = (kind: Kind, label: string) => (
    <TouchableOpacity
      key={kind}
      onPress={() => setOpen((v) => (v === kind ? null : kind))}
      className={`flex-1 py-2 rounded-lg items-center ${open === kind ? "bg-white/15" : ""}`}
      accessibilityRole="button"
      accessibilityState={{ selected: open === kind }}
    >
      <Text className={`text-xs font-semibold ${open === kind ? "text-white" : "text-white/50"}`}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mt-4" style={style}>
      <View className="flex-row bg-white/[0.04] rounded-xl p-1">
        {tab("stake", t("copy.a3b7dbe57071", { defaultValue: "Your Deposits" }))}
        {tab("unstake", t("copy.a7b7e36d6fdf", { defaultValue: "Your Withdrawals" }))}
      </View>

      {!!open && (
        <View className="mt-3">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-white/40 text-xs flex-1">
              {open === "stake"
                ? t("copy.701ef1840612", { defaultValue: "All your stake transactions" })
                : t("copy.31a3711c4ab5", { defaultValue: "All your withdrawal transactions" })}
            </Text>
            {open === "stake" && (
              <TouchableOpacity
                onPress={sync}
                disabled={syncing}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t("copy.5b5a9671e539", { defaultValue: "Scan on-chain for missing deposits" })}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color="#ffffff99" />
                ) : (
                  <Ionicons name="refresh" size={14} color="#ffffff99" />
                )}
              </TouchableOpacity>
            )}
          </View>

          {isLoading ? (
            <View className="py-6 items-center">
              <ActivityIndicator size="small" color="#ffffff66" />
            </View>
          ) : records.length === 0 ? (
            <View className="py-6 items-center">
              <Text className="text-white/70 text-sm font-semibold">
                {open === "stake"
                  ? t("copy.4574472bb474", { defaultValue: "No deposits yet" })
                  : t("copy.1fdecb2c9a54", { defaultValue: "No withdrawals yet" })}
              </Text>
              <Text className="text-white/40 text-xs mt-1 text-center">
                {open === "stake"
                  ? t("copy.cbfc01a6c13a", { defaultValue: "Completed staking deposits will appear here." })
                  : t("copy.50b2bdd7a1e5", { defaultValue: "Completed staking withdrawals will appear here." })}
              </Text>
            </View>
          ) : (
            records.map((rec, i) => {
              const explorer =
                rec.chain === "BNB" ? `https://bscscan.com/tx/${rec.tx_hash}` : `https://basescan.org/tx/${rec.tx_hash}`;
              return (
                <View
                  key={`${rec.tx_hash}-${i}`}
                  className={`flex-row items-center py-3 ${i > 0 ? "border-t border-white/5" : ""}`}
                  style={{ gap: 10 }}
                >
                  <View className="flex-1">
                    <Text className="text-white text-sm font-medium">
                      {fmt(rec.amount)} <DhbCoin size={12} />
                    </Text>
                    <Text className="text-white/40 text-[11px] mt-0.5">
                      {rec.chain} · {new Date(rec.created_at).toLocaleDateString(appLocale())}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => void Linking.openURL(explorer)}
                    className="flex-row items-center"
                    style={{ gap: 4 }}
                    accessibilityRole="link"
                  >
                    <Text className="text-white/50 text-[11px] font-mono">{rec.tx_hash.slice(0, 10)}…</Text>
                    <Ionicons name="open-outline" size={12} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}
