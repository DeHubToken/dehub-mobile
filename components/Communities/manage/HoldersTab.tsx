/**
 * Holders tab
 * ===========
 * Owner-only switch that turns a community into a holder group: chain, token
 * and minimum. The database checks every joiner's balance itself; this form
 * only stores the rule. Mirrors dehubweb manage/HoldersTab.tsx.
 */

import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import CustomSwitch from "../../ui/CustomSwitch";
import { useWalletAddress } from "../../../hooks/useCommunityAdmin";
import { DEHUB_TOKEN_BY_CHAIN, HOLDER_GATE_CHAINS, holderGateOf, isDehubToken, readTokenMeta, setHolderGate } from "../../../libs/holder-gate";

const DEHUB_COIN = require("../../../assets/web-icons/dehub-coin.png");
import { toastError, toastSuccess } from "../../../libs/toast";
import type { Community, CommunityMember } from "../../../types/community";
import { TopHolders } from "../TopHolders";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function HoldersTab({ community, onSaved }: { community: Community; membership: CommunityMember | null; onSaved?: () => void }) {
  const { t } = useTranslation();
  const wallet = useWalletAddress();
  const queryClient = useQueryClient();
  const saved = holderGateOf(community);

  const tickerChain = Number(community.ticker_chain_id);
  const fallbackChain = HOLDER_GATE_CHAINS.some((c) => c.id === tickerChain) ? tickerChain : 56;

  const [enabled, setEnabled] = useState(!!saved);
  const [chainId, setChainId] = useState<number>(saved?.chainId ?? fallbackChain);
  // DeHub tokens by default; any other token is one tap away.
  const [useDehub, setUseDehub] = useState(!saved || isDehubToken(saved));
  const [otherToken, setToken] = useState(saved && !isDehubToken(saved) ? saved.token : (community.ticker_contract_address ?? ""));
  const token = useDehub ? DEHUB_TOKEN_BY_CHAIN[chainId] : otherToken;
  const [min, setMin] = useState(saved ? String(saved.min) : "1");
  const [meta, setMeta] = useState<{ symbol: string | null; decimals: number | null }>({
    symbol: saved?.symbol ?? community.ticker_symbol ?? null,
    decimals: saved?.decimals ?? null,
  });
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (useDehub) { setMeta({ symbol: "DHB", decimals: 18 }); return; }
    if (!ADDRESS.test(token)) return;
    let cancelled = false;
    setReading(true);
    readTokenMeta(chainId, token)
      .then((r) => { if (!cancelled) setMeta((p) => ({ symbol: r.symbol ?? p.symbol, decimals: r.decimals ?? p.decimals })); })
      .finally(() => { if (!cancelled) setReading(false); });
    return () => { cancelled = true; };
  }, [chainId, token, useDehub]);

  const minNumber = Number(min);
  const valid = ADDRESS.test(token) && Number.isFinite(minNumber) && minNumber >= 0;

  const write = async (gate: Parameters<typeof setHolderGate>[2]) => {
    setSaving(true);
    try {
      await setHolderGate(wallet, community.id, gate);
      toastSuccess(gate
        ? t("communities.holderGate.saved", { defaultValue: "Holder rule saved" })
        : t("communities.holderGate.cleared", { defaultValue: "Anyone can join again" }));
      void queryClient.invalidateQueries({ queryKey: ["communities", "holders", community.id] });
      onSaved?.();
    } catch {
      toastError(t("communities.holderGate.saveFailed", { defaultValue: "Couldn't save the holder rule" }));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (next: boolean) => {
    setEnabled(next);
    if (!next && saved) void write(null);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 pr-2">
            <Text className="text-white text-sm font-medium">
              {t("communities.holderGate.title", { defaultValue: "Holders only" })}
            </Text>
            <Text className="text-zinc-400 text-xs mt-1">
              {t("communities.holderGate.explain", {
                defaultValue: "Only wallets holding this token can join and chat. Balances are read from the chain when someone joins.",
              })}
            </Text>
          </View>
          <CustomSwitch value={enabled} onValueChange={toggle} disabled={saving} />
        </View>

        {enabled && (
          <View>
            <Text style={styles.fieldLabel}>{t("communities.holderGate.chain", { defaultValue: "Chain" })}</Text>
            <View className="flex-row flex-wrap gap-2">
              {HOLDER_GATE_CHAINS.map((chain) => {
                const active = chain.id === chainId;
                return (
                  <TouchableOpacity key={chain.id} onPress={() => setChainId(chain.id)} style={[styles.choice, active && styles.choiceActive]}>
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{chain.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>{t("communities.holderGate.which", { defaultValue: "Token" })}</Text>
            <View className="flex-row flex-wrap gap-2">
              <TouchableOpacity onPress={() => setUseDehub(true)} style={[styles.choice, styles.choiceRow, useDehub && styles.choiceActive]}>
                <Image source={DEHUB_COIN} style={{ width: 16, height: 16 }} />
                <Text style={[styles.choiceText, useDehub && styles.choiceTextActive]}>{t("communities.holderGate.dehubTokens", { defaultValue: "DeHub tokens" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUseDehub(false)} style={[styles.choice, !useDehub && styles.choiceActive]}>
                <Text style={[styles.choiceText, !useDehub && styles.choiceTextActive]}>{t("communities.holderGate.otherToken", { defaultValue: "Another token" })}</Text>
              </TouchableOpacity>
            </View>

            {!useDehub && <View>
            <Text style={styles.fieldLabel}>{t("communities.holderGate.token", { defaultValue: "Token contract" })}</Text>
            <TextInput
              style={[styles.input, styles.mono]}
              value={token}
              onChangeText={(v) => setToken(v.trim())}
              placeholder="0x…"
              placeholderTextColor="#8B8D90"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text className="text-zinc-500 text-[11px] mt-1" style={{ minHeight: 16 }}>
              {reading
                ? t("communities.holderGate.reading", { defaultValue: "Reading token…" })
                : meta.symbol
                  ? `${meta.symbol}${meta.decimals != null ? ` · ${meta.decimals} decimals` : ""}`
                  : token && !ADDRESS.test(token)
                    ? t("communities.holderGate.badAddress", { defaultValue: "That is not a token address" })
                    : ""}
            </Text>
            </View>}

            <Text style={styles.fieldLabel}>{t("communities.holderGate.minimum", { defaultValue: "Minimum to hold" })}</Text>
            <TextInput
              style={styles.input}
              value={min}
              onChangeText={(v) => setMin(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholderTextColor="#8B8D90"
            />

            <TouchableOpacity
              onPress={() => valid && write({ chainId, token: token.toLowerCase(), min: minNumber, symbol: meta.symbol, decimals: meta.decimals ?? 18 })}
              disabled={!valid || saving}
              style={[styles.saveBtn, (!valid || saving) && { opacity: 0.5 }]}
            >
              {saving ? <ActivityIndicator size="small" color="#000" /> : (
                <Text style={styles.saveText}>{t("communities.holderGate.save", { defaultValue: "Save holder rule" })}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {saved && <TopHolders community={community} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
  },
  fieldLabel: { color: "#808089", fontSize: 12, marginTop: 14, marginBottom: 8 },
  input: {
    color: "#fff",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  mono: { fontFamily: "monospace", fontSize: 12 },
  choice: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  choiceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  choiceActive: { backgroundColor: "#fff", borderColor: "#fff" },
  choiceText: { color: "#a1a1aa", fontSize: 12, fontWeight: "600" },
  choiceTextActive: { color: "#000" },
  saveBtn: { marginTop: 16, height: 40, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  saveText: { color: "#000", fontSize: 14, fontWeight: "600" },
});
