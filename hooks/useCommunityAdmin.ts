import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Community administration data layer
 * ===================================
 * Native mirror of web's use-community-admin.ts. Every privileged action goes
 * through a SECURITY DEFINER RPC in services/communities.service, so a refusal
 * raises instead of silently matching zero rows.
 *
 * Query keys carry the wallet because the moderator-only reads (the join queue,
 * the ban list, invite links, the admin log) are filtered by it server-side —
 * one account's result must not be served to the next.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../context/AuthContext";
import {
  approveMember,
  banMember,
  createCommunityInvite,
  deleteCommunity,
  getBannedCommunityMembers,
  getCommunityAdminLog,
  getCommunityInvites,
  getCommunityMembers,
  getCommunityMembership,
  getPendingCommunityMembers,
  kickMember,
  muteMember,
  purgeMemberMessages,
  rejectMember,
  revokeCommunityInvite,
  setMemberRole,
  transferOwnership,
  unbanMember,
  unmuteMember,
  updateCommunitySettings,
} from "../services/communities.service";
import { communityErrorMessage } from "../libs/community-permissions";
import { toastError, toastSuccess } from "../libs/toast";
import type {
  AdminRight,
  CommunityAdminLogEntry,
  CommunityInviteLink,
  CommunityMember,
  CommunitySettingsPatch,
} from "../types/community";

export function useWalletAddress(): string | null {
  const user = useUser() as any;
  return (user?.walletAddress || user?.address || "") || null;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useCommunityMembersQuery(communityId: string | undefined) {
  const wallet = useWalletAddress();
  return useQuery({
    queryKey: ["community-members", communityId, wallet],
    queryFn: () => getCommunityMembers(communityId as string, wallet),
    enabled: !!communityId,
    staleTime: 15_000,
  });
}

export function useCommunityMembershipQuery(communityId: string | undefined) {
  const wallet = useWalletAddress();
  return useQuery({
    queryKey: ["community-membership", communityId, wallet],
    queryFn: () => getCommunityMembership(communityId as string, wallet as string),
    enabled: !!communityId && !!wallet,
    staleTime: 15_000,
  });
}

export function usePendingMembersQuery(communityId: string | undefined, enabled: boolean) {
  const wallet = useWalletAddress();
  return useQuery({
    queryKey: ["community-pending", communityId, wallet],
    queryFn: () => getPendingCommunityMembers(communityId as string, wallet as string),
    enabled: !!communityId && !!wallet && enabled,
    staleTime: 15_000,
  });
}

export function useBannedMembersQuery(communityId: string | undefined, enabled: boolean) {
  const wallet = useWalletAddress();
  return useQuery({
    queryKey: ["community-banned", communityId, wallet],
    queryFn: () => getBannedCommunityMembers(communityId as string, wallet as string),
    enabled: !!communityId && !!wallet && enabled,
    staleTime: 15_000,
  });
}

export function useCommunityInvitesQuery(communityId: string | undefined, enabled: boolean) {
  const wallet = useWalletAddress();
  return useQuery<CommunityInviteLink[]>({
    queryKey: ["community-invites", communityId, wallet],
    queryFn: () => getCommunityInvites(communityId as string, wallet as string),
    enabled: !!communityId && !!wallet && enabled,
    staleTime: 30_000,
  });
}

export function useCommunityAdminLogQuery(communityId: string | undefined, enabled: boolean) {
  const wallet = useWalletAddress();
  return useQuery<CommunityAdminLogEntry[]>({
    queryKey: ["community-admin-log", communityId, wallet],
    queryFn: () => getCommunityAdminLog(communityId as string, wallet as string),
    enabled: !!communityId && !!wallet && enabled,
    staleTime: 15_000,
  });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export interface ModerationActions {
  /** The wallet address currently being acted on, or null. Drives per-row spinners. */
  busy: string | null;
  approve: (target: string, name?: string) => Promise<void>;
  reject: (target: string, name?: string) => Promise<void>;
  kick: (target: string, name?: string) => Promise<void>;
  /** Resolves true only if the ban actually landed — the caller may chain a purge on it. */
  ban: (target: string, opts?: { reason?: string; until?: string | null; name?: string }) => Promise<boolean>;
  unban: (target: string, name?: string) => Promise<void>;
  mute: (target: string, until?: string | null, name?: string) => Promise<void>;
  unmute: (target: string, name?: string) => Promise<void>;
  promote: (
    target: string,
    permissions: Partial<Record<AdminRight, boolean>>,
    customTitle?: string | null,
    name?: string,
  ) => Promise<void>;
  demote: (target: string, name?: string) => Promise<void>;
  transfer: (target: string, name?: string) => Promise<void>;
  purgeMessages: (target: string, name?: string) => Promise<void>;
  updateSettings: (patch: CommunitySettingsPatch, successMessage?: string) => Promise<boolean>;
  remove: () => Promise<boolean>;
  createInvite: (input: {
    name?: string | null;
    expiresAt?: string | null;
    maxUses?: number | null;
    requiresApproval?: boolean;
  }) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
}

export function useCommunityModeration(communityId: string | undefined): ModerationActions {
  const { t: _copy } = _useCopy();
  const wallet = useWalletAddress();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    for (const k of [
      "community-members",
      "community-membership",
      "community-pending",
      "community-banned",
      "community-admin-log",
      "community-invites",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [k, communityId] });
    }
    void queryClient.invalidateQueries({ queryKey: ["communities"] });
  }, [queryClient, communityId]);

  const run = useCallback(
    async (
      target: string | null,
      fallback: string,
      action: (w: string, cid: string) => Promise<unknown>,
      success?: string,
    ): Promise<boolean> => {
      if (!wallet || !communityId) {
        toastError(_copy("copy.d4eb6104ebd9", { defaultValue: "Connect your wallet first" }));
        return false;
      }
      setBusy(target ?? "__community__");
      try {
        await action(wallet, communityId);
        invalidate();
        if (success) toastSuccess(success);
        return true;
      } catch (error) {
        toastError(communityErrorMessage(error, fallback));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [wallet, communityId, invalidate, _copy],
  );

  const who = (name?: string) => name || _copy("copy.7c968fb71f50", { defaultValue: "Member" });

  return useMemo<ModerationActions>(
    () => ({
      busy,
      approve: async (target, name) => {
        await run(target, _copy("copy.de0c2e40fd7a", { defaultValue: "Failed to approve" }), (w, c) => approveMember(w, c, target), _copy("copy.b4923ce2de2c", { defaultValue: "{{value1}} approved", value1: who(name) }));
      },
      reject: async (target, name) => {
        await run(target, _copy("copy.46960413b9a8", { defaultValue: "Failed to reject" }), (w, c) => rejectMember(w, c, target), _copy("copy.21b36b609f86", { defaultValue: "Request rejected" }));
      },
      kick: async (target, name) => {
        await run(target, _copy("copy.1cff79b7eb0b", { defaultValue: "Failed to remove member" }), (w, c) => kickMember(w, c, target), _copy("copy.50f8429f0d7c", { defaultValue: "{{value1}} removed", value1: who(name) }));
      },
      ban: async (target, opts) =>
        run(
          target,
          _copy("copy.3e127b875965", { defaultValue: "Failed to ban member" }),
          (w, c) => banMember(w, c, target, opts?.reason ?? null, opts?.until ?? null),
          _copy("copy.69117b59817b", { defaultValue: "{{value1}} banned", value1: who(opts?.name) }),
        ),
      unban: async (target, name) => {
        await run(target, _copy("copy.fa3f8b4f0df9", { defaultValue: "Failed to unban member" }), (w, c) => unbanMember(w, c, target), _copy("copy.af707a1ddd84", { defaultValue: "{{value1}} unbanned", value1: who(name) }));
      },
      mute: async (target, until, name) => {
        await run(target, _copy("copy.193a04ac4a9c", { defaultValue: "Failed to mute member" }), (w, c) => muteMember(w, c, target, until), _copy("copy.99f61cc51979", { defaultValue: "{{value1}} muted", value1: who(name) }));
      },
      unmute: async (target, name) => {
        await run(target, _copy("copy.2f3648d86b9d", { defaultValue: "Failed to unmute member" }), (w, c) => unmuteMember(w, c, target), _copy("copy.47ad279da2d8", { defaultValue: "{{value1}} unmuted", value1: who(name) }));
      },
      promote: async (target, permissions, customTitle, name) => {
        await run(
          target,
          _copy("copy.e4143613f121", { defaultValue: "Failed to update role" }),
          (w, c) => setMemberRole(w, c, target, "admin", permissions, customTitle),
          _copy("copy.795f6f567483", { defaultValue: "{{value1}} is now an admin", value1: who(name) }),
        );
      },
      demote: async (target, name) => {
        await run(
          target,
          _copy("copy.e4143613f121", { defaultValue: "Failed to update role" }),
          (w, c) => setMemberRole(w, c, target, "member"),
          _copy("copy.c7fbcf193b1d", { defaultValue: "{{value1}} is no longer an admin", value1: who(name) }),
        );
      },
      transfer: async (target, name) => {
        await run(
          target,
          _copy("copy.b37288814357", { defaultValue: "Failed to transfer ownership" }),
          (w, c) => transferOwnership(w, c, target),
          _copy("copy.e7028443a798", { defaultValue: "{{value1}} now owns this community", value1: who(name) }),
        );
      },
      purgeMessages: async (target, name) => {
        if (!wallet || !communityId) return;
        setBusy(target);
        try {
          const removed = await purgeMemberMessages(wallet, communityId, target);
          void queryClient.invalidateQueries({ queryKey: ["community-chat-messages", communityId] });
          void queryClient.invalidateQueries({ queryKey: ["community-admin-log", communityId] });
          toastSuccess(
            removed
              ? _copy("copy.ac929101ae36", { count: removed, defaultValue_one: "Deleted {{count}} message", defaultValue: "Deleted {{count}} messages" })
              : _copy("copy.890e0324b85b", { defaultValue: "No messages to delete" }),
          );
        } catch (error) {
          toastError(communityErrorMessage(error, _copy("copy.b9442cc89e40", { defaultValue: "Failed to delete messages" })));
        } finally {
          setBusy(null);
        }
      },
      updateSettings: async (patch, successMessage) =>
        run(null, _copy("copy.1b97419f8a5c", { defaultValue: "Failed to update community" }), (w, c) => updateCommunitySettings(w, c, patch), successMessage),
      remove: async () =>
        run(null, _copy("copy.cd9a989be4a3", { defaultValue: "Failed to delete community" }), (w, c) => deleteCommunity(w, c), _copy("copy.7793fc7ea486", { defaultValue: "Community deleted" })),
      createInvite: async (input) => {
        await run(null, _copy("copy.7d400b75a897", { defaultValue: "Failed to create invite link" }), (w, c) => createCommunityInvite(w, c, input), _copy("copy.f2661a2edcee", { defaultValue: "Invite link created" }));
      },
      revokeInvite: async (inviteId) => {
        await run(inviteId, _copy("copy.e7c82bd74723", { defaultValue: "Failed to revoke invite link" }), (w) => revokeCommunityInvite(w, inviteId), _copy("copy.0727efedeb3b", { defaultValue: "Invite link revoked" }));
      },
    }),
    [busy, run, wallet, communityId, queryClient, _copy],
  );
}

/** Shared by the members/admins lists so a wallet renders the same everywhere. */
export function shortWallet(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isMuted(member: Pick<CommunityMember, "muted_until">): boolean {
  if (!member.muted_until) return false;
  const t = new Date(member.muted_until).getTime();
  return !Number.isNaN(t) && t > Date.now();
}
