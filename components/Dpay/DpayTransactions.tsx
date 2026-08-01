import React, { useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { miniAddress } from "../../libs/strings.util";
import { DPAY_TX_LINK, LEGACY_WEBSITE_LINK } from "../../config/links";
import { openInApp, getTransactionLink } from "../../libs/links.utils";
import { getDpayTnx } from "../../services";
import { formatRelativeFromNow } from "../../libs/date.util";
import baseIcon from "../../assets/chains/base-icon.png";
import bnbIcon from "../../assets/chains/bnb-icon.png";
import { toastError } from "../../libs/toast";
import { formatDistance } from "date-fns";

type Tx = {
  id: string;
  chainId: number;
  tokenSymbol: string;
  amountToken: number;
  approxFiat: number;
  currency: string;
  address: string;
  stripeStatus?: string;
  sendStatus?: "sent" | "cancelled" | "not_sent" | string;
  createdAt?: string;
  txHash?: string;
};

const StatusPill: React.FC<{ label: string; intent: "green" | "red" | "grey" | "white" }> = ({ label, intent }) => {
  const cls =
    intent === "green" ? "bg-green-600 text-white" :
    intent === "red" ? "bg-red-600 text-white" :
    intent === "grey" ? "bg-gray-600 text-white" :
    "bg-white text-black";
  return (
    <View className={`px-2 py-0.5 rounded-full mr-2 ${cls}`}>
      <Text className={`text-[10px] ${intent === 'white' ? 'text-black' : 'text-white'}`}>{label}</Text>
    </View>
  );
};

const DpayTransactions: React.FC = () => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [items, setItems] = React.useState<Tx[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res: any = await getDpayTnx({ page: 1, limit: 10 });
        const list: any[] = res?.data?.tnxs || res?.tnxs || res?.result || res?.data || [];
        const mapped: Tx[] = Array.isArray(list)
          ? list.slice(0, 10).map((tx: any, idx: number) => ({
              id: String(tx?.sessionId || tx?.id || idx),
              chainId: Number(tx?.chainId ?? 8453),
              tokenSymbol: String(tx?.tokenSymbol || 'DHB'),
              amountToken: Number(tx?.tokenReceived ?? tx?.approxTokensToReceive ?? 0) || 0,
              approxFiat: Number(tx?.amount ?? 0) || 0,
              currency: String(tx?.currency || 'USD').toUpperCase(),
              address: String(tx?.receiverAddress || tx?.address || ''),
              stripeStatus: tx?.status_stripe,
              sendStatus: tx?.tokenSendStatus,
              createdAt: tx?.createdAt || tx?.created_at,
              txHash: tx?.tokenSendTxnHash,
            }))
          : [];
        if (!cancelled) setItems(mapped);
      } catch (e) {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);
  const onShowAll = React.useCallback(() => {
    // openInApp(DPAY_TX_LINK);
    openInApp(`${LEGACY_WEBSITE_LINK}/dpay/tnx`);
  }, []);

  const renderItem = React.useCallback((tx: Tx) => {
    const stripeIntent: "green" | "red" | "grey" | "white" = (() => {
      const s = (tx.stripeStatus || '').toString().toLowerCase();
      if (s === 'succeeded' || s === 'complete') return 'green';
      if (s === 'processing' || s === 'pending' || s === 'requires_payment_method') return 'grey';
      if (s === 'failed' || s === 'canceled' || s === 'cancelled') return 'red';
      return 'white';
    })();
    const sendIntent: "green" | "red" | "grey" | "white" = tx.sendStatus === 'sent' ? 'green' : tx.sendStatus === 'not_sent' ? 'grey' : (tx.sendStatus ? 'red' : 'white');

    const iconSource = tx.chainId === 8453 ? baseIcon : tx.chainId === 56 ? bnbIcon : null;
    const onPress = () => {
      if (!tx.txHash) {
        toastError("Couldn't find transaction hash");
        return;
      }
      const url = getTransactionLink(tx.chainId, tx.txHash);
      if (url) openInApp(url);
    };

    return (
      <TouchableOpacity
        key={tx.id}
        activeOpacity={0.85}
        onPress={onPress}
        className={`bg-theme-neutrals-800/90 rounded-xl p-4 mb-2 border border-theme-neutrals-700 ${!tx.txHash ? 'opacity-70' : ''}`}
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center">
            {iconSource ? (
              <Image source={iconSource} className="w-4 h-4 mr-2" />
            ) : (
              <View className="w-4 h-4 mr-2 rounded-full bg-theme-neutrals-700" />
            )}
            <Text className="text-gray-300 text-xs">{(tx.tokenSymbol || 'DHB').toUpperCase()}</Text>
          </View>
          <View className="flex-row items-center">
            {tx.stripeStatus ? <StatusPill label={String(tx.stripeStatus)} intent={stripeIntent} /> : null}
            {tx.sendStatus ? <StatusPill label={String(tx.sendStatus)} intent={sendIntent} /> : null}
          </View>
        </View>
        <View className="flex-row justify-between items-end mt-2">
          <View>
            <Text className="text-white text-lg font-semibold">{tx.amountToken.toLocaleString()}</Text>
            <Text className="text-gray-400 text-xs">≈ {tx.approxFiat.toFixed(2)} {tx.currency}</Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="time-outline" size={14} color="#9CA3AF" />
            <Text className="text-gray-400 text-[11px] ml-1">{formatDistance(tx.createdAt as string, new Date(), { addSuffix: true })}</Text>
          </View>
        </View>
        <View className="flex-row justify-between items-center mt-2">
          <Text className="text-gray-300 text-xs">{miniAddress(tx.address)}</Text>
          <Ionicons name="chevron-forward" size={16} color="#6B7280" />
        </View>
      </TouchableOpacity>
    );
  }, []);

  return (
    <View className="mt-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-white text-lg font-semibold tracking-wide">Latest Transactions</Text>
        <TouchableOpacity onPress={onShowAll} className="px-3 py-1 rounded-full bg-gray-800 border border-gray-700 flex-row items-center">
          <Text className="text-white text-xs mr-1">Show all</Text>
          <Ionicons name="open-outline" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} className="bg-theme-neutrals-800/90 rounded-xl p-4 mb-2 border border-theme-neutrals-700/60">
              <View className="flex-row justify-between items-center">
                <View className="w-24 h-3 rounded bg-theme-neutrals-700/60" />
                <View className="w-20 h-5 rounded bg-theme-neutrals-700/60" />
              </View>
              <View className="flex-row justify-between items-end mt-3">
                <View>
                  <View className="w-28 h-5 rounded bg-theme-neutrals-700/60 mb-2" />
                  <View className="w-24 h-3 rounded bg-theme-neutrals-700/60" />
                </View>
                <View className="w-16 h-3 rounded bg-theme-neutrals-700/60" />
              </View>
              <View className="flex-row justify-between items-center mt-2">
                <View className="w-28 h-3 rounded bg-theme-neutrals-700/60" />
                <View className="w-4 h-4 rounded bg-theme-neutrals-700/60" />
              </View>
            </View>
          ))}
        </>
      ) : (
        items.map(renderItem)
      )}
    </View>
  );
};

export default DpayTransactions;
