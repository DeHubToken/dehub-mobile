/**
 * New Members (mobile)
 * ====================
 * Native port of web's `use-new-members.ts`. Same Supabase table
 * (`public.new_members`), same `x-wallet-address` RLS header, same
 * `register-new-member` edge function — so a member who signs in on the phone
 * shows up in the rail on the web and vice versa.
 *
 * The roster lives in Supabase rather than being asked of the DeHub API
 * because the API cannot answer it: `/api/users_search` ignores `page`,
 * `limit` and every sort parameter, and returns the same ten oldest accounts
 * every time. The edge function is the only writer; clients hold no INSERT
 * grant, and the one column they can change on their own row is `opted_out`.
 *
 * Opting out is enforced by RLS, not here — an opted-out row is not selectable
 * by anyone but its owner, so every read below is already filtered.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { getAuthToken } from "../libs/auth.utils";
import { useUser } from "../context/AuthContext";
import { getAvatarUrl } from "../libs";
import { createLogger } from "../libs/logger";

const log = createLogger("useNewMembers");

/** How long an account counts as new. Mirrors WINDOW_DAYS in the edge function. */
export const NEW_MEMBER_WINDOW_DAYS = 30;

const WINDOW_MS = NEW_MEMBER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** The greeting a wave drafts. Meant to be edited before sending, not fired off as-is. */
export const NEW_MEMBER_WELCOME =
  "Welcome to DeHub! 👋 Give me a shout if you need anything.";

export interface NewMember {
  address: string;
  username: string | null;
  displayName: string;
  avatarUrl?: string;
  badgeBalance: number;
  joinedAt: string;
}

interface NewMemberRow {
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  joined_at: string;
}

function cutoffIso(): string {
  return new Date(Date.now() - WINDOW_MS).toISOString();
}

function toNewMember(row: NewMemberRow): NewMember {
  // 56pt: the rail's avatar. The profile chip never reads this field.
  const avatar = getAvatarUrl(row.avatar_url || "", 56);
  return {
    address: row.wallet_address,
    username: row.username,
    displayName:
      row.display_name ||
      row.username ||
      `${row.wallet_address.slice(0, 6)}…${row.wallet_address.slice(-4)}`,
    avatarUrl: avatar && avatar !== "default-avatar" ? avatar : undefined,
    badgeBalance: row.badge_balance ?? 0,
    joinedAt: row.joined_at,
  };
}

/** "3h ago" / "2d ago" — deliberately coarse; nobody needs minutes. */
export function joinedAgoLabel(joinedAt: string): string {
  const ms = Date.now() - new Date(joinedAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function walletOf(user: { walletAddress?: string; address?: string } | null): string | null {
  const w = user?.walletAddress || user?.address;
  return w ? w.toLowerCase() : null;
}

/** The roster, newest first, minus yourself. */
export function useNewMembers(limit = 20) {
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const exclude = walletOf(user);

  return useQuery({
    queryKey: ["new-members", limit, exclude],
    queryFn: async (): Promise<NewMember[]> => {
      const { data, error } = await supabase
        .from("new_members")
        .select("wallet_address, username, display_name, avatar_url, badge_balance, joined_at")
        .gte("joined_at", cutoffIso())
        .order("joined_at", { ascending: false })
        .limit(limit + 1);

      if (error) throw error;
      return ((data || []) as NewMemberRow[])
        .map(toNewMember)
        .filter((m) => m.address.toLowerCase() !== exclude)
        .slice(0, limit);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * A plain object, not a Map, on purpose: the whole query cache is persisted
 * to MMKV as JSON (config/queryClient.ts), and a Map serialises to `{}`. The
 * restored value then had no `.get`, so every NewMemberChip in the first feed
 * threw "undefined is not a function" on the launch after the first — the
 * 1.17.0 / build 45 crash-on-open. A record round-trips intact.
 */
export type NewMemberSet = Readonly<Record<string, string>>;

const EMPTY_MEMBER_SET: NewMemberSet = Object.freeze({});

/**
 * Everyone inside the 30-day window, in one request. Twin of web's
 * `useNewMemberSet` — a feed of twenty cards used to mean twenty per-address
 * queries for data one query already covers; every chip below reads this same
 * cached map instead.
 *
 * PostgREST caps a single response at 1000 rows; if a month ever onboards more
 * than that, the oldest of them would stop showing the chip until then.
 */
export function useNewMemberSet(): { members: NewMemberSet; isLoading: boolean } {
  const query = useQuery({
    queryKey: ["new-member-set"],
    queryFn: async (): Promise<NewMemberSet> => {
      const { data, error } = await supabase
        .from("new_members")
        .select("wallet_address, joined_at")
        .gte("joined_at", cutoffIso());

      if (error) throw error;
      const set: Record<string, string> = {};
      for (const row of (data || []) as { wallet_address: string; joined_at: string }[]) {
        set[row.wallet_address.toLowerCase()] = row.joined_at;
      }
      return set;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  return { members: query.data ?? EMPTY_MEMBER_SET, isLoading: query.isLoading };
}

/**
 * Is this one person new? A local lookup in the shared window set, so the
 * profile chip and every feed surface below read the same answer from the
 * same request.
 */
export function useIsNewMember(address?: string | null) {
  const { members, isLoading } = useNewMemberSet();
  const key = address?.toLowerCase() ?? null;
  const joinedAt = (key && Object.hasOwn(members, key) ? members[key] : null) || null;
  return { isNew: !!joinedAt, joinedAt, isLoading };
}

/**
 * Your own row, and the switch that hides it.
 *
 * Read with the wallet header on purpose: the SELECT policy hides opted-out
 * rows from everyone except their owner, so without the header this reports
 * "not a new member" the moment the setting is switched off and the toggle
 * springs back on.
 */
export function useNewMemberSelf() {
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const address = walletOf(user);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["new-member-self", address],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase.from("new_members").select("joined_at, opted_out").eq("wallet_address", address!),
        address,
      ).maybeSingle();

      if (error) throw error;
      return (data as { joined_at: string; opted_out: boolean } | null) ?? null;
    },
    enabled: !!address,
    staleTime: 60 * 1000,
    retry: false,
  });

  const setOptedOut = useMutation({
    mutationFn: async (optedOut: boolean) => {
      const { error } = await withWalletHeader(
        supabase.from("new_members").update({ opted_out: optedOut }).eq("wallet_address", address!),
        address,
      );
      if (error) throw error;
      return optedOut;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["new-member-self", address] });
      queryClient.invalidateQueries({ queryKey: ["new-members"] });
      // The set feeds every chip in the app — profile included — so flipping
      // the switch has to drop it, or the old answer lingers for ten minutes.
      queryClient.invalidateQueries({ queryKey: ["new-member-set"] });
    },
  });

  const joinedAt = query.data?.joined_at ?? null;
  const withinWindow = !!joinedAt && Date.now() - new Date(joinedAt).getTime() < WINDOW_MS;

  return {
    /** True only while the setting still does something — see PrivacySettingsScreen. */
    isNewMember: withinWindow,
    joinedAt,
    optedOut: query.data?.opted_out ?? false,
    isLoading: query.isLoading,
    setOptedOut: setOptedOut.mutateAsync,
    isUpdating: setOptedOut.isPending,
  };
}

/**
 * Put the signed-in account on the roster, once per app launch.
 *
 * Nothing is passed to the function: it derives the wallet from the verified
 * DeHub token and re-reads the join date from the API, so there is nothing a
 * client could get wrong or lie about.
 */
export function useRegisterNewMember() {
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const address = walletOf(user);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!address) return;
    if (registeredThisLaunch === address) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token || cancelled) return;

        const { data, error } = await supabase.functions.invoke("register-new-member", {
          headers: { "x-wallet-address": address, "x-dehub-token": token },
        });
        if (cancelled) return;
        if (error) throw error;

        registeredThisLaunch = address;
        if ((data as { isNew?: boolean })?.isNew) {
          queryClient.invalidateQueries({ queryKey: ["new-members"] });
          queryClient.invalidateQueries({ queryKey: ["new-member-self", address] });
          queryClient.invalidateQueries({ queryKey: ["new-member-set"] });
        }
      } catch (err) {
        // Never surfaced: a welcome rail missing one name is not worth an error
        // on top of someone's first login.
        log.warn("register failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, queryClient]);
}

/**
 * Module-level rather than AsyncStorage: "once per launch" is exactly the
 * lifetime of this module, and a persisted flag would stop the roster ever
 * learning that a profile was renamed.
 */
let registeredThisLaunch: string | null = null;
