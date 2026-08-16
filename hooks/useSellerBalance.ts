/**
 * Seller balance
 * ==============
 * Card earnings for the signed-in wallet: what is still inside the 30-day hold
 * and what can be withdrawn. Native port of the web hook, against the same
 * `store-payouts` edge function.
 *
 * It cannot extend `useBalances` — that reads on-chain token balances through
 * ethersService and writes symbol-keyed values into the persisted auth user.
 * This is a server-side USD figure with no token and no chain behind it.
 *
 * Served by a function rather than read from `seller_ledger` directly because
 * that table's SELECT policy resolves the caller through an unsigned request
 * header; under requireDeHubAuth the wallet comes off a verified DeHub token.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { dehubAuthHeaders } from "../services/ai.service";
import { createLogger } from "../libs/logger";

const log = createLogger("useSellerBalance");

export interface SellerBalance {
  pendingUsd: number;
  availableUsd: number;
  lifetimeEarnedUsd: number;
  nextReleaseAt: string | null;
  payoutsEnabled: boolean;
  onboardingStarted: boolean;
  hasActivity: boolean;
  holdDays: number;
}

/**
 * Money, never compacted. formatCompactNumber renders 1200 as "1.2K", which is
 * right for viewer counts and wrong for an amount someone is owed.
 */
export function formatUsd(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const [intPart, decPart] = rounded.toFixed(2).split(".");
  return `$${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decPart}`;
}

export function useSellerBalance() {
  const user = useUser() as any;
  const wallet = (user?.walletAddress || user?.address || null) as string | null;

  const query = useQuery({
    queryKey: ["seller-balance", wallet],
    queryFn: async () => {
      const headers = await dehubAuthHeaders(wallet);
      const { data, error } = await supabase.functions.invoke("store-payouts", {
        body: { action: "balance" },
        headers,
      });
      if (error) {
        let detail = "";
        try {
          const context = (error as { context?: Response }).context;
          if (context) detail = String((await context.json())?.error || "");
        } catch {
          // Not JSON — fall back to the transport message.
        }
        throw new Error(detail || error.message || "Could not load earnings");
      }
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      return data as SellerBalance;
    },
    enabled: !!wallet,
    staleTime: 30_000,
    retry: 1,
  });

  if (query.error) log.warn("balance fetch failed", query.error);

  return {
    balance: query.data ?? null,
    pendingUsd: query.data?.pendingUsd ?? 0,
    availableUsd: query.data?.availableUsd ?? 0,
    hasActivity: query.data?.hasActivity ?? false,
    isLoading: query.isLoading,
    refresh: query.refetch,
  };
}
