import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import InfoTooltip from "../ui/InfoTooltip";
import dhbIcon from "../../assets/tokens/DHB.png";
import usdcIcon from "../../assets/tokens/USDC.png";
import usdtIcon from "../../assets/tokens/USDT.png";
import ethIcon from "../../assets/chains/base-icon.png";
import bnbIcon from "../../assets/chains/bnb-icon.png";
import { useUser, useAuthState, useProvider } from "../../context/AuthContext";
import { ChainId } from "../../config/constants";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { toastInfo } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import TransferModal from "../Transfer/TransferModal";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

/** Shimmering placeholder shown while balances load for the first time. */
const BalanceSkeleton: React.FC = () => (
  <View className="w-16 h-5 rounded-md bg-theme-neutrals-700 overflow-hidden">
    <Animated.View
      entering={FadeIn.duration(600)}
      exiting={FadeOut.duration(300)}
      className="w-full h-full bg-theme-neutrals-600 opacity-40"
    />
  </View>
);

const ProfileAssets = () => {
  const user = useUser();
  const { balancesLoading } = useAuthState();
  const { chainId } = useProvider();
  const navigation = useNavigation<any>();
  const [showDHBOptions, setShowDHBOptions] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const walletBalances =
    (user?.tokenBalances as Record<string, number> | undefined) || {};

  // True when we have NEVER received real balance data yet.
  // Once any token value is populated (even 0 after a fetch), this becomes false
  // because fetchAndStoreBalances always writes at least {}. tokenBalances being
  // `undefined` means no fetch has completed.
  const isInitialLoad = useMemo(
    () => !user?.tokenBalances || Object.keys(user.tokenBalances).length === 0,
    [user?.tokenBalances]
  );

  // Show skeleton only on the very first fetch — never during background refreshes
  // when we already have data to display.
  // Also show skeleton if balances have never loaded yet (provider not ready).
  const showSkeleton = isInitialLoad;

  /**
   * DHB is a position, not a chain balance.
   *
   * Every other row here is what you hold on the chain you have selected, and
   * for DHB that is close to meaningless: it lives on Base and BNB at once,
   * and most of it is staked, so a wallet holding 11.1M DHB reported 0. The
   * DHB row is the whole position instead — held plus staked, both chains —
   * and the (i) above breaks it down.
   *
   * `ownBadgeBalance` is the server's version of exactly this sum and is the
   * number the leaderboard and the badge ladder use, so preferring it keeps
   * all three agreeing. Note it is `ownBadgeBalance` and never `badgeBalance`:
   * the latter is the *rendered* badge number and a delegation can hold it
   * above what the wallet owns, which on a wallet screen would be someone
   * else's tokens shown as yours. Falling back to `balanceData` — the raw
   * per-chain rows — gives the same figure without that risk.
   */
  const dhbBreakdown = useMemo(() => {
    const BADGE_CHAINS: Record<number, string> = {
      [ChainId.BSC_MAINNET]: "BNB Chain",
      [ChainId.BASE_MAINNET]: "Base",
    };
    const rows = (user?.balanceData || [])
      .filter((entry) => BADGE_CHAINS[entry.chainId] !== undefined)
      .map((entry) => ({
        chain: BADGE_CHAINS[entry.chainId],
        wallet: Number(entry.walletBalance) || 0,
        staked: Number(entry.staked) || 0,
      }))
      .filter((row) => row.wallet > 0 || row.staked > 0);
    const summed = rows.reduce((acc, row) => acc + row.wallet + row.staked, 0);
    return { rows, summed };
  }, [user?.balanceData]);

  const dhbPosition = useMemo(() => {
    const own = user?.ownBadgeBalance;
    if (typeof own === "number" && own > 0) return own;
    if (dhbBreakdown.summed > 0) return dhbBreakdown.summed;
    // Nothing from the server yet — the liquid balance is all we can stand behind.
    return Number(walletBalances["DHB"] ?? 0);
  }, [user?.ownBadgeBalance, dhbBreakdown.summed, walletBalances]);

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
        balance: symbol === "DHB" ? dhbPosition : balance,
        icon: iconMap[symbol] || dhbIcon,
        hasActions: symbol === "DHB",
      };
    });
  }, [walletBalances, chainId, dhbPosition]);

  const [transferOpen, setTransferOpen] = useState(false);
  const dhbActions = [
    { label: "Top up", subtitle: undefined, disabled: false },
    { label: "Bridge", subtitle: "coming soon", disabled: true },
    { label: "Transfer", disabled: false },
  ];

  const handleTopUp = React.useCallback(() => {
    if (chainId !== ChainId.BASE_MAINNET) {
      toastInfo("Dpay is only available on Base.");
      return;
    }
    navigation.navigate(ScreenNames.Dpay);
  }, [chainId, navigation]);

  const toggleDHBOptions = () => {
    setShowDHBOptions((prev) => !prev);
  };

  return (
    <View className="mx-4 my-3 bg-theme-neutrals-800 rounded-xl p-4 relative">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-base text-white font-semibold">Assets</Text>
        <InfoTooltip
          open={showInfo}
          onOpenChange={setShowInfo}
          triggerClassName="pl-3"
        >
          <Text className="text-xs leading-5 text-white">
            {`DHB is your whole position — held plus staked, across Base and BNB Chain. Most of it is usually staked, so this is larger than what you can spend right now.`}
          </Text>

          {dhbBreakdown.rows.length > 0 && (
            <View className="mt-2 border-t border-white/10 pt-2">
              {dhbBreakdown.rows.map((row) => (
                <View key={row.chain} className="mb-1">
                  <Text className="text-[11px] text-white/60 mb-0.5">{row.chain}</Text>
                  <View className="flex-row justify-between">
                    <Text className="text-[11px] text-white/80">Held</Text>
                    <Text className="text-[11px] text-white">
                      {formatCompactNumber(row.wallet)} DHB
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-[11px] text-white/80">Staked</Text>
                    <Text className="text-[11px] text-white">
                      {formatCompactNumber(row.staked)} DHB
                    </Text>
                  </View>
                </View>
              ))}
              <View className="flex-row justify-between border-t border-white/10 pt-1 mt-1">
                <Text className="text-[11px] text-white font-semibold">Total</Text>
                <Text className="text-[11px] text-white font-semibold">
                  {formatCompactNumber(dhbPosition)} DHB
                </Text>
              </View>
              <Text className="text-[10px] leading-4 text-white/50 mt-1">
                Staked DHB includes anything you have asked to unstake but not
                yet received back.
              </Text>
            </View>
          )}

          <Text className="text-xs leading-5 text-white mt-2">
            {(() => {
              const isBase = chainId === ChainId.BASE_MAINNET;
              const isBNB = chainId === ChainId.BSC_MAINNET;
              const netName = isBase
                ? "Base"
                : isBNB
                ? "BNB Chain"
                : `Chain ${chainId ?? "N/A"}`;
              const gasSym = isBase ? "ETH" : isBNB ? "BNB" : "ETH";
              return `Your other balances are on ${netName} (chain ${
                chainId ?? "N/A"
              }) only. ${gasSym} is your gas balance. Values may lag a few seconds. Bridge or transfer assets to ${netName} to use them here.`;
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
                  color="#A1A1AA"
                  className="ml-1"
                />
              )}
            </TouchableOpacity>
            {showSkeleton ? (
              <BalanceSkeleton />
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
                  className={`py-2 px-3 rounded-xl flex-1 mx-1 ${
                    action.disabled ? "bg-theme-neutrals-800" : "bg-theme-neutrals-700"
                  }`}
                  onPress={
                    action.disabled
                      ? undefined
                      : action.label === "Top up"
                      ? handleTopUp
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
