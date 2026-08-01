/**
 * Command Centre data layer
 * =========================
 * Native port of the web app's command-centre cards. Reuses what mobile
 * already has (getMyAnalytics, subscriptions, dpay, getAccount) and adds the
 * two Supabase reads mobile was missing: `tip_records` and `ppv_purchases`.
 *
 * Difference from web, deliberate: web's IncomeChart and RecentTransactions
 * also fold in `useOnchainDHBTransfers` — an on-chain DHB transfer index that
 * has no mobile equivalent. Income here therefore counts tips recorded in
 * `tip_records` only, so a raw on-chain transfer that never produced a tip row
 * will show on web but not here. Porting that indexer is the follow-up.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { getMySubscriptions, getPlans } from "../services/subscription.service";
import { getDpayTnx } from "../services/dpay.service";
import { createLogger } from "../libs/logger";

const log = createLogger("useCommandCentre");

export type IncomeRange = "1h" | "1d" | "1w" | "1m" | "Max";

/** Matches web's SOURCE_CONFIG — same keys, labels and colours. */
export const INCOME_SOURCES = [
  { key: "tips", label: "Tips", color: "#22c55e" },
  { key: "subs", label: "Subs", color: "#F4F4F5" },
  { key: "adRevenue", label: "Ad Revenue", color: "#D4D4D8" },
  { key: "bounties", label: "Bounties", color: "#D4D4D8" },
  { key: "ppv", label: "PPV Sales", color: "#D4D4D8" },
] as const;

export interface TipRecord {
  amount: number;
  created_at: string;
  tx_hash: string | null;
  sender_address?: string;
  receiver_address?: string;
}

export interface PpvPurchase {
  amount: number;
  created_at: string;
  buyer_address?: string;
  creator_address?: string;
}

function useWallet(): string | null {
  const user = useUser() as any;
  return (user?.walletAddress || user?.address || null) as string | null;
}

/** Cut-off for a range filter; null means "everything" (web's `Max`). */
export function rangeStart(range: IncomeRange): Date | null {
  const now = Date.now();
  switch (range) {
    case "1h": return new Date(now - 60 * 60 * 1000);
    case "1d": return new Date(now - 24 * 60 * 60 * 1000);
    case "1w": return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "1m": return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default: return null;
  }
}

// ── Income sources ──────────────────────────────────────────────────────────

/** Tips *received* — drives the income pie, same query as web's IncomeChart. */
export function useTipsReceived() {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["cc-tips-received", wallet],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tip_records")
        .select("amount, created_at, tx_hash")
        .eq("receiver_address", wallet!.toLowerCase())
        .order("created_at", { ascending: false });
      if (error) {
        log.warn("tip_records error:", error);
        return [] as TipRecord[];
      }
      return (data || []) as TipRecord[];
    },
    enabled: !!wallet,
    staleTime: 30_000,
  });
}

/** PPV sales *as creator* — the other half of the income pie. */
export function usePpvSales() {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["cc-ppv-sales", wallet],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ppv_purchases")
        .select("amount, created_at")
        .eq("creator_address", wallet!.toLowerCase())
        .order("created_at", { ascending: false });
      if (error) {
        log.warn("ppv_purchases error:", error);
        return [] as PpvPurchase[];
      }
      return (data || []) as PpvPurchase[];
    },
    enabled: !!wallet,
    staleTime: 30_000,
  });
}

// ── Recent activity ─────────────────────────────────────────────────────────

export type ActivityKind = "tip-in" | "tip-out" | "ppv-in" | "ppv-out" | "dpay";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Positive = money in, negative = money out. */
  amount: number;
  currency: string;
  createdAt: string;
  counterparty?: string | null;
}

/**
 * Merged recent activity: tips both directions, PPV both directions, and DHB
 * purchases from the dpay ledger — the same three sources web's
 * RecentTransactions merges (minus the on-chain index, see file header).
 */
export function useRecentActivity() {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["cc-recent-activity", wallet],
    queryFn: async (): Promise<ActivityItem[]> => {
      const addr = wallet!.toLowerCase();
      const out: ActivityItem[] = [];

      const [tips, ppv, dpay] = await Promise.all([
        supabase
          .from("tip_records")
          .select("*")
          .or(`sender_address.ilike.${addr},receiver_address.ilike.${addr}`)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("ppv_purchases")
          .select("*")
          .or(`buyer_address.ilike.${addr},creator_address.ilike.${addr}`)
          .order("created_at", { ascending: false })
          .limit(50),
        getDpayTnx({ address: addr }).catch((e) => {
          log.warn("dpay tnx failed:", e);
          return null;
        }),
      ]);

      for (const t of (tips.data || []) as any[]) {
        const incoming = t.receiver_address?.toLowerCase() === addr;
        out.push({
          id: `tip-${t.id ?? t.tx_hash ?? t.created_at}`,
          kind: incoming ? "tip-in" : "tip-out",
          amount: incoming ? Number(t.amount) : -Number(t.amount),
          currency: "DHB",
          createdAt: t.created_at,
          counterparty: incoming ? t.sender_address : t.receiver_address,
        });
      }

      for (const p of (ppv.data || []) as any[]) {
        const incoming = p.creator_address?.toLowerCase() === addr;
        out.push({
          id: `ppv-${p.id ?? p.created_at}`,
          kind: incoming ? "ppv-in" : "ppv-out",
          amount: incoming ? Number(p.amount) : -Number(p.amount),
          currency: "DHB",
          createdAt: p.created_at,
          counterparty: incoming ? p.buyer_address : p.creator_address,
        });
      }

      const dpayRows: any[] =
        (dpay as any)?.data?.result ?? (dpay as any)?.result ?? (Array.isArray(dpay) ? dpay : []);
      for (const d of dpayRows ?? []) {
        const created = d.createdAt ?? d.created_at ?? d.date;
        if (!created) continue;
        out.push({
          id: `dpay-${d._id ?? d.id ?? created}`,
          kind: "dpay",
          amount: Number(d.tokenAmount ?? d.amount ?? 0),
          currency: d.tokenSymbol ?? "DHB",
          createdAt: created,
        });
      }

      return out.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },
    enabled: !!wallet,
    staleTime: 60_000,
  });
}

// ── Subscriptions ───────────────────────────────────────────────────────────

/** Counts + estimated monthly spend, matching web's SubscriptionsSummary. */
export function useSubscriptionsSummary() {
  const wallet = useWallet();

  const subs = useQuery({
    queryKey: ["cc-my-subscriptions", wallet],
    queryFn: () => getMySubscriptions(),
    enabled: !!wallet,
    staleTime: 60_000,
  });

  const plans = useQuery({
    queryKey: ["cc-creator-plans", wallet],
    queryFn: () => getPlans(wallet!),
    enabled: !!wallet,
    staleTime: 60_000,
  });

  const all = subs.data ?? [];
  const active = all.filter((s) => s.isActive && new Date(s.endDate) > new Date());

  // Same normalisation as web: price is per `duration` days, shown per 30.
  const monthlySpend = active.reduce((sum, s) => {
    const price = s.plan?.price ?? 0;
    const duration = s.plan?.duration || 30;
    return sum + (price / duration) * 30;
  }, 0);

  return {
    isLoading: subs.isLoading || plans.isLoading,
    total: all.length,
    activeCount: active.length,
    planCount: (plans.data ?? []).length,
    monthlySpend,
    refetch: () => {
      void subs.refetch();
      void plans.refetch();
    },
  };
}
