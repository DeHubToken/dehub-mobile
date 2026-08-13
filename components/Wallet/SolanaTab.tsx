// Solana wallet surface.
//
// Posting, tipping and PPV on Solana all spend SOL from a wallet derived from
// the user's DeHub wallet key (libs/solana-derive.ts). Until this screen
// existed there was no way to learn its address, so nobody could fund it and
// every Solana action failed on "Insufficient SOL for transaction fees" with
// no route out. Showing the address and its balance is what makes the chain
// usable at all.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import {
  getLegacySolanaAddress,
  getSolanaAddress,
  getSolanaBalance,
  getSolanaMintStatus,
} from "../../services/solana.service";
import { toastError, toastSuccess } from "../../libs/toast";

const SOLSCAN = "https://solscan.io/account/";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function formatSol(value: number | null): string {
  if (value == null) return "—";
  if (value === 0) return "0";
  if (value < 0.0001) return "<0.0001";
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

const SolanaTab: React.FC = () => {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mintingEnabled, setMintingEnabled] = useState<boolean | null>(null);

  // Only rendered when the older random keypair still holds a balance.
  const [legacyAddress, setLegacyAddress] = useState<string | null>(null);
  const [legacyBalance, setLegacyBalance] = useState<number | null>(null);

  const loadBalance = useCallback(async (addr: string) => {
    try {
      setBalance(await getSolanaBalance(addr));
    } catch {
      // A rate-limited public RPC is the usual cause; leave the balance blank
      // rather than claiming zero, which would read as "your funds are gone".
      setBalance(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const addr = await getSolanaAddress();
      if (cancelled) return;
      setAddress(addr);

      if (addr) await loadBalance(addr);
      if (cancelled) return;
      setLoading(false);

      getSolanaMintStatus()
        .then((s) => !cancelled && setMintingEnabled(s.mintingEnabled !== false))
        .catch(() => {});

      const legacy = await getLegacySolanaAddress();
      if (cancelled || !legacy || legacy === addr) return;
      try {
        const bal = await getSolanaBalance(legacy);
        if (!cancelled && bal > 0) {
          setLegacyAddress(legacy);
          setLegacyBalance(bal);
        }
      } catch {
        /* best-effort */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBalance]);

  const handleRefresh = useCallback(async () => {
    if (!address || refreshing) return;
    setRefreshing(true);
    await loadBalance(address);
    setRefreshing(false);
  }, [address, refreshing, loadBalance]);

  const handleCopy = useCallback(async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    toastSuccess("Solana address copied");
  }, [address]);

  const handleExplorer = useCallback(
    (addr: string) => {
      Linking.openURL(SOLSCAN + addr).catch(() =>
        toastError("Could not open Solscan"),
      );
    },
    [],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <ActivityIndicator size="small" color="#fff" />
      </View>
    );
  }

  if (!address) {
    return (
      <View className="bg-white/5 border border-white/10 rounded-xl p-5">
        <Text className="text-white font-semibold text-base mb-2">
          Solana wallet unavailable
        </Text>
        <Text className="text-white/60 text-sm leading-5">
          This device does not hold the key for your DeHub wallet. Sign in again
          to restore it, and your Solana wallet comes back with it.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* Balance */}
      <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-white/50 text-xs uppercase tracking-wider">
            Balance
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={refreshing}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Refresh SOL balance"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={16}
                color="rgba(255,255,255,0.6)"
              />
            )}
          </TouchableOpacity>
        </View>
        <Text className="text-white text-2xl font-bold">
          {formatSol(balance)}
        </Text>
        <Text className="text-white/60 text-xs mt-0.5">SOL</Text>
      </View>

      {/* Address */}
      <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
        <Text className="text-white/50 text-xs uppercase tracking-wider mb-2">
          Your Solana address
        </Text>
        <Text className="text-white text-sm font-mono mb-3" selectable>
          {address}
        </Text>
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={handleCopy}
            className="flex-1 flex-row items-center justify-center gap-2 bg-white/10 border border-white/10 rounded-xl py-3"
            accessibilityRole="button"
            accessibilityLabel="Copy Solana address"
          >
            <Ionicons name="copy-outline" size={16} color="#fff" />
            <Text className="text-white text-sm font-semibold">Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleExplorer(address)}
            className="flex-1 flex-row items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl py-3"
            accessibilityRole="button"
            accessibilityLabel="View on Solscan"
          >
            <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text className="text-white/70 text-sm font-semibold">Solscan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Why it needs funding */}
      <View className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
        <Text className="text-white font-semibold text-sm mb-2">
          Funding this wallet
        </Text>
        <Text className="text-white/60 text-sm leading-5">
          Posting, tipping and unlocking on Solana are paid from this address.
          Send SOL to it from an exchange or another wallet — roughly 0.01 SOL
          covers several posts. It is derived from your DeHub wallet, so it
          comes back on any device you sign in to.
        </Text>
      </View>

      {mintingEnabled === false && (
        <View className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <Text className="text-white/70 text-sm leading-5">
            Solana posting is turned off on the server right now. Your wallet
            and balance are unaffected.
          </Text>
        </View>
      )}

      {/* Older device-only wallet that still holds funds */}
      {legacyAddress && (
        <View className="bg-white/[0.03] border border-white/20 rounded-xl p-4 mb-4">
          <Text className="text-white font-semibold text-sm mb-2">
            Older Solana wallet — {formatSol(legacyBalance)} SOL
          </Text>
          <Text className="text-white/60 text-sm leading-5 mb-3">
            An earlier version of the app created a separate Solana wallet that
            only ever existed on this device. It still holds a balance. Move the
            funds to the address above while you have this phone — that key
            cannot be recovered anywhere else.
          </Text>
          <Text className="text-white/70 text-xs font-mono mb-3" selectable>
            {shorten(legacyAddress)}
          </Text>
          <TouchableOpacity
            onPress={() => handleExplorer(legacyAddress)}
            className="flex-row items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl py-3"
            accessibilityRole="button"
            accessibilityLabel="View older wallet on Solscan"
          >
            <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text className="text-white/70 text-sm font-semibold">
              View on Solscan
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default SolanaTab;
