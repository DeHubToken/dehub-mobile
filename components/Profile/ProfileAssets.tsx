import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import InfoTooltip from "../ui/InfoTooltip";
import dhbIcon from "../../assets/tokens/DHB.png";
import usdcIcon from "../../assets/tokens/USDC.png";
import usdtIcon from "../../assets/tokens/USDT.png";
import ethIcon from "../../assets/chains/base-icon.png";
import bnbIcon from "../../assets/chains/bnb-icon.png";
import { useAuth } from "../../context/AuthContext";
import { ChainId } from "../../config/constants";
import { BUY_FROM_DEX_LINK } from "../../config/links";
import { openInApp } from "../../libs/links.utils";
import { formatCompactNumber } from "../../libs/numbers.util";
import TransferModal from "../Transfer/TransferModal";

const ProfileAssets = () => {
  const { user, balancesLoading, chainId } = useAuth();
  const [showDHBOptions, setShowDHBOptions] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const walletBalances =
    (user?.tokenBalances as Record<string, number> | undefined) || {};

  const assets = useMemo(() => {
    const isBase = chainId === 8453; // ChainId.BASE_MAINNET
    const isBNB = chainId === 56; // ChainId.BSC_MAINNET
    const nativeSymbol = isBNB ? "BNB" : "ETH";
    const order: Array<"DHB" | "USDC" | "USDT" | "ETH" | "BNB"> = [
      "DHB",
      "USDC",
      "USDT",
      nativeSymbol as any,
    ];
    const iconMap: Record<string, any> = {
      DHB: dhbIcon,
      USDC: usdcIcon,
      USDT: usdtIcon,
      ETH: ethIcon,
      BNB: bnbIcon,
    };
    return order.map((symbol) => {
      const isNative = symbol === "ETH" || symbol === "BNB";
      // Fallback: if store still uses 'ETH' key for native on BNB, read it
      const balance = isNative
        ? walletBalances[symbol] ?? walletBalances["ETH"] ?? 0
        : walletBalances[symbol] ?? 0;
      return {
        name: symbol,
        balance,
        icon: iconMap[symbol] || dhbIcon,
        hasActions: symbol === "DHB",
      };
    });
  }, [walletBalances, chainId]);

  const [transferOpen, setTransferOpen] = useState(false);
  const dhbActions = [
    { label: "Top up", subtitle: "reviewing", disabled: true },
    { label: "Bridge", subtitle: "coming soon", disabled: true },
    { label: "Transfer", disabled: false },
  ];

  const toggleDHBOptions = () => {
    setShowDHBOptions((prev) => !prev);
  };

  return (
    <View className="mx-4 my-3 bg-theme-neutrals-800 rounded-2xl p-4 relative">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-base text-white font-semibold">Assets</Text>
        <InfoTooltip
          open={showInfo}
          onOpenChange={setShowInfo}
          triggerClassName="pl-3"
        >
          <Text className="text-[11px] leading-4 text-white">
            {(() => {
              const isBase = chainId === ChainId.BASE_MAINNET;
              const isBNB = chainId === ChainId.BSC_MAINNET;
              const netName = isBase
                ? "Base"
                : isBNB
                ? "BNB Chain"
                : `Chain ${chainId ?? "N/A"}`;
              const gasSym = isBase ? "ETH" : isBNB ? "BNB" : "ETH";
              return `Balances shown are on ${netName} (chain ${
                chainId ?? "N/A"
              }). DHB is the platform token used for tipping & rewards. ${gasSym} is your gas balance. Values may lag a few seconds. Bridge or transfer assets to ${netName} to use them here.`;
            })()}
          </Text>
          <View className="flex-row justify-end mt-2">
            <TouchableOpacity
              onPress={() => setShowInfo(false)}
              className="px-2 py-1 rounded bg-zinc-800"
            >
              <Text className="text-[11px] text-white font-medium">Got it</Text>
            </TouchableOpacity>
          </View>
        </InfoTooltip>
      </View>

      {assets.map((asset) => (
        <View key={asset.name} className="mb-1">
          <View className="flex-row items-center justify-between py-2">
            <TouchableOpacity
              className="flex-row items-center flex-1"
              onPress={asset.hasActions ? toggleDHBOptions : undefined}
            >
              <Image
                source={asset.icon}
                className="w-8 h-8 rounded-full mr-3"
              />
              <Text className="text-lg text-white">{asset.name}</Text>
              {asset.hasActions && (
                <Ionicons
                  name={showDHBOptions ? "chevron-down" : "chevron-forward"}
                  size={14}
                  color="#9CA3AF"
                  className="ml-1"
                />
              )}
            </TouchableOpacity>
            {balancesLoading ? (
              <View className="w-14 h-4 rounded bg-theme-neutrals-700 animate-pulse" />
            ) : (
              <Text className="text-lg text-gray-300">
                {formatCompactNumber(Number(asset.balance || 0))}
              </Text>
            )}
          </View>

          {asset.hasActions && showDHBOptions && (
            <View className="ml-9 mt-1 mb-2 flex-row space-x-2">
              {dhbActions.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  className={`py-2 px-3 rounded-2xl flex-1 mx-1 rounded ${
                    action.disabled ? "bg-gray-800" : "bg-gray-700"
                  }`}
                  onPress={
                    action.disabled
                      ? undefined
                      : action.label === "Top up"
                      ? () => openInApp(BUY_FROM_DEX_LINK)
                      : action.label === "Transfer"
                      ? () => setTransferOpen(true)
                      : undefined
                  }
                  disabled={action.disabled}
                >
                  <View className="items-center">
                    <Text
                      className={`text-xs ${
                        action.disabled ? "text-gray-500" : "text-white"
                      }`}
                    >
                      {action.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}
      <TransferModal open={transferOpen} onOpenChange={setTransferOpen} />
    </View>
  );
};

export default ProfileAssets;
