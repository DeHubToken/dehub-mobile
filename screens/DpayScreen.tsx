import { translateCopy as _translateCopy } from '../i18n/copy';
import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { useFocusedInterval } from "../hooks/useFocusedInterval";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import type { IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { PageSection, PageTabs } from "../components/page/PageKit";
import DpayInfoCards from "../components/Dpay/DpayInfoCards";
import DpayTopUpForm from "../components/Dpay/DpayTopUpForm";
import NearIntentBuy from "../components/Dpay/NearIntentBuy";
import DpayTransactions from "../components/Dpay/DpayTransactions";
import DpayAbout from "../components/Dpay/DpayAbout";
import StakingTab from "../components/Wallet/StakingTab";
import BridgeTab from "../components/Wallet/BridgeTab";
import SolanaTab from "../components/Wallet/SolanaTab";
import WalletOverview from "../components/Wallet/WalletOverview";
import { getSupply, getSuccessTotal, getDpayPrice } from "../services";
import { ChainId } from "../config/constants";
import { ScreenNames } from "../navigation/ScreenNames";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import type { AppStackParamList } from "../navigation/types";
import { DHB_SALES_PAUSED } from "../libs/dhb-sales";

type WalletTab = "wallet" | "buy" | "stake" | "bridge" | "solana";

/**
 * The App Store build offers no buying, staking or bridging (config/storefront,
 * guideline 3.1.1). Its menus hide the wallet, but Settings → Assets,
 * notifications and Command Centre still open it, so whatever tab they ask
 * for, it opens on the overview there.
 */
function storefrontTab(tab: WalletTab | undefined): WalletTab {
  return DIGITAL_PURCHASES_ENABLED ? (tab ?? "wallet") : "wallet";
}

const TABS: { key: WalletTab; label: string; labelKey?: string; icon: IconName }[] = [
  { key: "wallet", get label() { return _translateCopy("copy.d1c9a01d57e9", { defaultValue: "Wallet" }); }, labelKey: "wallet.title", icon: "Wallet" },
  { key: "buy", get label() { return _translateCopy("copy.989bd871eac5", { defaultValue: "Buy Tokens" }); }, labelKey: "upload.buyTokens", icon: "CreditCard" },
  { key: "stake", get label() { return _translateCopy("copy.8939aea8419b", { defaultValue: "Stake" }); }, icon: "Lock" },
  { key: "bridge", get label() { return _translateCopy("copy.3892e10346fd", { defaultValue: "Bridge" }); }, icon: "ArrowLeftRight" },
  { key: "solana", label: "Solana", icon: "Coins" },
];

const DpayScreen: React.FC = () => {
  const { t } = useTranslation();
  // The KeyboardAvoidingView wraps the ScreenHeader too, so there is no chrome
  // above it beyond the root SafeAreaView's inset.
  const keyboardOffset = useKeyboardOffset();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  // Wallet opens its overview; purchase and staking shortcuts remain explicit.
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.Dpay>>();
  const [activeTab, setActiveTab] = useState<WalletTab>(
    storefrontTab(route.params?.initialTab),
  );

  // Re-select the tab when the drawer navigates to Dpay while it is already
  // mounted — React Navigation reuses the screen, so the initial state above
  // would otherwise be stale. Keyed on the params object rather than the tab
  // string: navigate() hands back a fresh object every call, so this still
  // fires when the user has since switched tabs by hand and taps the same
  // drawer entry again.
  const routeParams = route.params;
  useEffect(() => {
    setActiveTab(storefrontTab(routeParams?.initialTab));
  }, [routeParams]);
  const [dataReady, setDataReady] = React.useState<boolean>(false);
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
      if (DHB_SALES_PAUSED) setSupplyAmount(0);
      else if (Number.isFinite(supVal as number)) setSupplyAmount(supVal as number);
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
    if (activeTab !== "buy" || dataReady) return;
    let cancelled = false;
    async function bootstrap() {
      try {
        const [supplyRes, totalRes] = await Promise.all([
          getSupply().catch((e) => { console.warn('[DpayScreen] getSupply failed', e?.message || e); return null; }),
          getSuccessTotal().catch((e) => { console.warn('[DpayScreen] getSuccessTotal failed', e?.message || e); return null; }),
        ]);
        parseSupply(supplyRes);
        parseTotal(totalRes);
        try {
          const p = await requestPrice({ currency: 'usd', amount: 10, tokenSymbol: 'DHB', chainId: ChainId.BASE_MAINNET });
          if (typeof p === 'number') setInitialPrice(p);
        } catch {}
      } finally {
        if (!cancelled) {
          setDataReady(true);
        }
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [activeTab, dataReady]);

  // Only while this screen is the one on screen. It used to be a bare
  // setInterval in the effect above, which kept two network calls every ten
  // seconds running under whatever screen was opened after it, for as long as
  // this one sat in the stack.
  useFocusedInterval(
    () => {
      void (async () => {
        try {
          const [supplyRes, totalRes] = await Promise.all([
            getSupply().catch(() => null),
            getSuccessTotal().catch(() => null),
          ]);
          parseSupply(supplyRes);
          parseTotal(totalRes);
        } catch {}
      })();
    },
    activeTab === "buy" ? POLL_INTERVAL_MS : null,
    { catchUp: true },
  );

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

  if (activeTab === "wallet") {
    return <WalletOverview onBuy={() => setActiveTab("buy")} onStake={() => setActiveTab("stake")} />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardOffset}
      className="flex-1 bg-theme-neutrals-900"
    >
      <ScreenHeader title={t(activeTab === "buy" ? "wallet.buy" : activeTab === "stake" ? "wallet.stake" : "wallet.title")} onBackPress={() => setActiveTab("wallet")} icon="buy" />
      <ScrollView
        className="flex-1 px-0"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
        refreshControl={<DeHubRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
      >
        {/* Tab switcher */}
        <PageTabs<WalletTab>
          value={activeTab}
          onChange={setActiveTab}
          tabs={TABS.map((tab) => ({ id: tab.key, label: tab.labelKey ? t(tab.labelKey) : tab.label }))}
          style={{ paddingHorizontal: 16, paddingBottom: 16 }}
        />

        {/* Tab content */}
        {activeTab === "buy" && (
          <>
            <PageSection>
              <DpayInfoCards transfersTotal={transfersTotal ?? undefined} supplyAmount={supplyAmount ?? undefined} />
            </PageSection>
            {/* The top-up form and NEAR buy are shared with the gift and buy
                sheets and draw their own cards. */}
            <View className="px-4 py-3">
              <DpayTopUpForm initialPrice={initialPrice ?? undefined} supplyData={supplyData ?? undefined} />
              <NearIntentBuy />
            </View>
            <DpayTransactions />
            <DpayAbout />
          </>
        )}
        {activeTab === "stake" && (
          <PageSection>
            <StakingTab />
          </PageSection>
        )}
        {activeTab === "bridge" && (
          <PageSection>
            <BridgeTab />
          </PageSection>
        )}
        {activeTab === "solana" && (
          <PageSection>
            <SolanaTab />
          </PageSection>
        )}
      </ScrollView>
      <DeHubRefreshMark refreshing={refreshing} />
    </KeyboardAvoidingView>
  );
};

export default DpayScreen;
