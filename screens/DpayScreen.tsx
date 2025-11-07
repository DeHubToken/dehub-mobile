import React from "react";
import { useAuth } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import DpayLoader from "../components/Dpay/DpayLoader";
import DpayInfoCards from "../components/Dpay/DpayInfoCards";
import DpayTopUpForm from "../components/Dpay/DpayTopUpForm";
import DpayTransactions from "../components/Dpay/DpayTransactions";
import DpayAbout from "../components/Dpay/DpayAbout";
import DpayHeader from "../components/Dpay/DpayHeader";
import { getSupply, getSuccessTotal, getDpayPrice } from "../services";
import { ChainId } from "../config/constants";

const DpayScreen: React.FC = () => {
  const { isSignedIn, needsUsername } = useAuth();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const [minReady, setMinReady] = React.useState<boolean>(false);
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

  React.useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        // Fetch required data in parallel
        const [supplyRes, totalRes] = await Promise.all([
          getSupply().catch((e) => { console.warn('[DpayScreen] getSupply failed', e?.message || e); return null; }),
          getSuccessTotal().catch((e) => { console.warn('[DpayScreen] getSuccessTotal failed', e?.message || e); return null; }),
        ]);

        // Derive Supply (Base, DHB)
        try {
          const balanceRoot: any = (supplyRes as any)?.data?.balance || (supplyRes as any)?.balance || (supplyRes as any)?.data || null;
          if (balanceRoot && typeof balanceRoot === 'object') setSupplyData(balanceRoot);
          const baseKey = balanceRoot ? (balanceRoot[8453] ? 8453 : (balanceRoot['8453'] ? '8453' : null)) : null;
          const baseMap = baseKey != null ? balanceRoot?.[baseKey] : null;
          const dhbKey = baseMap ? (baseMap['DHB'] !== undefined ? 'DHB' : (baseMap['dhb'] !== undefined ? 'dhb' : undefined)) : undefined;
          const supVal = dhbKey ? Number(baseMap[dhbKey]) : undefined;
          if (Number.isFinite(supVal as number)) setSupplyAmount(supVal as number);
          else if (supVal === 0) setSupplyAmount(0);
        } catch {}

        // Derive Transfers Total (Base, DHB)
        try {
          const arr: any[] = (totalRes as any)?.data || (totalRes as any)?.result || (Array.isArray(totalRes) ? (totalRes as any) : []);
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
        // Initial price for default form (USD, amount 10, Base, DHB)
        try {
          const p = await requestPrice({ currency: 'usd', amount: 10, tokenSymbol: 'DHB', chainId: ChainId.BASE_MAINNET });
          if (typeof p === 'number') setInitialPrice(p);
        } catch {}
      } finally {
        if (!cancelled) setDataReady(true);
      }
    }
    bootstrap();
    // Polling for supply and totals
  const interval = setInterval(async () => {
      try {
        const [supplyRes, totalRes] = await Promise.all([
          getSupply().catch(() => null),
          getSuccessTotal().catch(() => null),
        ]);
        try {
          const balanceRoot: any = (supplyRes as any)?.data?.balance || (supplyRes as any)?.balance || (supplyRes as any)?.data || null;
          if (balanceRoot && typeof balanceRoot === 'object') setSupplyData(balanceRoot);
          const baseKey = balanceRoot ? (balanceRoot[8453] ? 8453 : (balanceRoot['8453'] ? '8453' : null)) : null;
          const baseMap = baseKey != null ? balanceRoot?.[baseKey] : null;
          const dhbKey = baseMap ? (baseMap['DHB'] !== undefined ? 'DHB' : (baseMap['dhb'] !== undefined ? 'dhb' : undefined)) : undefined;
          const supVal = dhbKey ? Number(baseMap[dhbKey]) : undefined;
          if (Number.isFinite(supVal as number)) setSupplyAmount(supVal as number);
          else if (supVal === 0) setSupplyAmount(0);
        } catch {}
        try {
          const arr: any[] = (totalRes as any)?.data || (totalRes as any)?.result || (Array.isArray(totalRes) ? (totalRes as any) : []);
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
      } catch {}
    }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Pull-to-refresh: refetch supply, totals, and seed price
  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [supplyRes, totalRes] = await Promise.all([
        getSupply().catch(() => null),
        getSuccessTotal().catch(() => null),
      ]);
      try {
        const balanceRoot: any = (supplyRes as any)?.data?.balance || (supplyRes as any)?.balance || (supplyRes as any)?.data || null;
        if (balanceRoot && typeof balanceRoot === 'object') setSupplyData(balanceRoot);
        const baseKey = balanceRoot ? (balanceRoot[8453] ? 8453 : (balanceRoot['8453'] ? '8453' : null)) : null;
        const baseMap = baseKey != null ? balanceRoot?.[baseKey] : null;
        const dhbKey = baseMap ? (baseMap['DHB'] !== undefined ? 'DHB' : (baseMap['dhb'] !== undefined ? 'dhb' : undefined)) : undefined;
        const supVal = dhbKey ? Number(baseMap[dhbKey]) : undefined;
        if (Number.isFinite(supVal as number)) setSupplyAmount(supVal as number);
        else if (supVal === 0) setSupplyAmount(0);
      } catch {}
      try {
        const arr: any[] = (totalRes as any)?.data || (totalRes as any)?.result || (Array.isArray(totalRes) ? (totalRes as any) : []);
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
      try {
        const p = await requestPrice({ currency: 'usd', amount: 10, tokenSymbol: 'DHB', chainId: ChainId.BASE_MAINNET });
        if (typeof p === 'number') setInitialPrice(p);
      } catch {}
    } finally {
      setRefreshing(false);
    }
  }, [requestPrice]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {!(minReady && dataReady) && (
        <DpayLoader
          minDurationMs={1200}
          onMinDuration={() => setMinReady(true)}
        />
      )}

      {minReady && dataReady && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView
            className="flex-1 px-0 pt-6"
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
          >
            <DpayHeader
              title="Fiat Gateway"
              subtitle="Buy DHB with cards and local methods."
            />

            {/* Padded content container (everything besides header) */}
            <View className="px-5">
              <DpayTopUpForm initialPrice={initialPrice ?? undefined} supplyData={supplyData ?? undefined} />
              <DpayInfoCards transfersTotal={transfersTotal ?? undefined} supplyAmount={supplyAmount ?? undefined} />
              <DpayTransactions />
              <DpayAbout />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

export default DpayScreen;
