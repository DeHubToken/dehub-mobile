import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import DpayLoader from "../components/Dpay/DpayLoader";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import DpayInfoCards from "../components/Dpay/DpayInfoCards";
import DpayTopUpForm from "../components/Dpay/DpayTopUpForm";
import DpayTransactions from "../components/Dpay/DpayTransactions";
import DpayAbout from "../components/Dpay/DpayAbout";
import DpayHeader from "../components/Dpay/DpayHeader";
import StakingTab from "../components/Wallet/StakingTab";
import BridgeTab from "../components/Wallet/BridgeTab";
import ProfileAssets from "../components/Profile/ProfileAssets";
import { getSupply, getSuccessTotal, getDpayPrice } from "../services";
import { ChainId } from "../config/constants";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";

type WalletTab = "buy" | "stake" | "bridge";

const TABS: { key: WalletTab; label: string; icon: IconName }[] = [
  { key: "buy", label: "Buy DHB", icon: "CreditCard" },
  { key: "stake", label: "Stake", icon: "Lock" },
  { key: "bridge", label: "Bridge", icon: "ArrowLeftRight" },
];

const DpayScreen: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  // Drawer entries (Wallet / Staking) deep-link to a specific tab; default to Buy.
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.Dpay>>();
  const [activeTab, setActiveTab] = useState<WalletTab>(
    route.params?.initialTab ?? "buy",
  );

  // Re-select the tab when the drawer navigates to Dpay while it is already
  // mounted — React Navigation reuses the screen, so the initial state above
  // would otherwise be stale. Keyed on the params object rather than the tab
  // string: navigate() hands back a fresh object every call, so this still
  // fires when the user has since switched tabs by hand and taps the same
  // drawer entry again.
  const routeParams = route.params;
  useEffect(() => {
    if (routeParams?.initialTab) setActiveTab(routeParams.initialTab);
  }, [routeParams]);
  const [dataReady, setDataReady] = React.useState<boolean>(false);
  const [progress, setProgress] = React.useState<number>(0);
  const [transfersTotal, setTransfersTotal] = React.useState<number | null>(null);
  const [supplyAmount, setSupplyAmount] = React.useState<number | null>(null);
  const [supplyData, setSupplyData] = React.useState<Record<string, Record<string, number>> | null>(null);
  const [initialPrice, setInitialPrice] = React.useState<number | null>(null);
  const POLL_INTERVAL_MS = 10000;

  const requestPrice = React.useCallback(async ({ currency, amount, tokenSymbol, chainId }: { currency: string; amount: number; tokenSymbol: string; chainId: number; }) => {
    try {
      const res: any = await getDpayPrice({ currency, amount, tokenSymbol, chainId });
      const data = res?.data ?? res?.result ?? res;
      const price = Number(data?.price ?? data?.tokenPrice ?? data?.value ?? 0);
      return Number.isFinite(price) && price > 0 ? price : null;
    } catch {
      return null;
    }
  }, []);

  const parseSupply = (supplyRes: any) => {
    try {
      const balanceRoot: any = supplyRes?.data?.balance || supplyRes?.balance || supplyRes?.data || null;
      if (balanceRoot && typeof balanceRoot === 'object') setSupplyData(balanceRoot);
      const baseKey = balanceRoot ? (balanceRoot[8453] ? 8453 : (balanceRoot['8453'] ? '8453' : null)) : null;
      const baseMap = baseKey != null ? balanceRoot?.[baseKey] : null;
      const dhbKey = baseMap ? (baseMap['DHB'] !== undefined ? 'DHB' : (baseMap['dhb'] !== undefined ? 'dhb' : undefined)) : undefined;
      const supVal = dhbKey ? Number(baseMap[dhbKey]) : undefined;
      if (Number.isFinite(supVal as number)) setSupplyAmount(supVal as number);
      else if (supVal === 0) setSupplyAmount(0);
    } catch {}
  };

  const parseTotal = (totalRes: any) => {
    try {
      const arr: any[] = totalRes?.data || totalRes?.result || (Array.isArray(totalRes) ? totalRes : []);
      if (Array.isArray(arr)) {
        const match = arr.find((it) => {
          const cid = Number((it?.chainId ?? it?.chainID ?? it?.chain)?.toString?.() || NaN);
          const sym = (it?.tokenSymbol ?? it?.symbol ?? '').toString();
          return cid === 8453 && sym.toUpperCase() === 'DHB';
        });
        const total = match?.total ?? match?.count ?? match?.value;
        if (typeof total === 'number') setTransfersTotal(total);
      }
    } catch {}
  };

  React.useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        setProgress(0.1);
        const [supplyRes, totalRes] = await Promise.all([
          getSupply().catch((e) => { console.warn('[DpayScreen] getSupply failed', e?.message || e); return null; }),
          getSuccessTotal().catch((e) => { console.warn('[DpayScreen] getSuccessTotal failed', e?.message || e); return null; }),
        ]);
        setProgress(0.45);
        parseSupply(supplyRes);
        parseTotal(totalRes);
        try {
          const p = await requestPrice({ currency: 'usd', amount: 10, tokenSymbol: 'DHB', chainId: ChainId.BASE_MAINNET });
          if (typeof p === 'number') setInitialPrice(p);
        } catch {}
      } finally {
        if (!cancelled) {
          setProgress(1);
          setDataReady(true);
        }
      }
    }
    bootstrap();
    const interval = setInterval(async () => {
      try {
        const [supplyRes, totalRes] = await Promise.all([
          getSupply().catch(() => null),
          getSuccessTotal().catch(() => null),
        ]);
        parseSupply(supplyRes);
        parseTotal(totalRes);
      } catch {}
    }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [supplyRes, totalRes] = await Promise.all([
        getSupply().catch(() => null),
        getSuccessTotal().catch(() => null),
      ]);
      parseSupply(supplyRes);
      parseTotal(totalRes);
      try {
        const p = await requestPrice({ currency: 'usd', amount: 10, tokenSymbol: 'DHB', chainId: ChainId.BASE_MAINNET });
        if (typeof p === 'number') setInitialPrice(p);
      } catch {}
    } finally {
      setRefreshing(false);
    }
  }, [requestPrice]);

  if (!dataReady) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <DpayLoader progress={progress} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      className="flex-1 bg-theme-neutrals-900"
    >
      <ScreenHeader title={t("wallet.title")} subtitle={t("screens.walletSubtitle")} />
      <ScrollView
        className="flex-1 px-0"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
      >
        <DpayHeader />

        {/* Assets / token balances — moved here from the profile to match web. */}
        <ProfileAssets />

        {/* Tab switcher */}
        <View className="flex-row px-4 gap-2 mb-5">
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-xl items-center justify-center border ${
                activeTab === tab.key
                  ? "bg-white/15 border-white/25"
                  : "bg-white/[0.04] border-white/10"
              }`}
            >
              <View className="mb-0.5">
                <Icon
                  name={tab.icon}
                  size={14}
                  color={activeTab === tab.key ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
                />
              </View>
              <Text
                className={`text-[11px] font-medium ${
                  activeTab === tab.key ? "text-white" : "text-white/50"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View className="px-4">
          {activeTab === "buy" && (
            <>
              <DpayTopUpForm initialPrice={initialPrice ?? undefined} supplyData={supplyData ?? undefined} />
              <DpayInfoCards transfersTotal={transfersTotal ?? undefined} supplyAmount={supplyAmount ?? undefined} />
              <DpayTransactions />
              <DpayAbout />
            </>
          )}
          {activeTab === "stake" && <StakingTab />}
          {activeTab === "bridge" && <BridgeTab />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default DpayScreen;
