/**
 * Governance discussion data layer
 * ================================
 * Native port of the web app's use-proposal-discussion.ts. Reads and writes the
 * same Supabase tables (`governance_proposals`, `governance_comments`) with the
 * same threading rule — replies hang off `parent_id`, one visible level deep, a
 * reply to a reply joining its root thread — so both clients show one thread.
 *
 * Replies notify the parent comment's author through the table's trigger
 * (`governance_reply`); the proposal's author hears about every comment the
 * same way. Nothing is written by the client beyond the comment itself.
 *
 * Reactions and editing exist on web; here the thread is read, reply and
 * delete-your-own, which is what the discussion needs to work.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";
import { getProposal } from "../services/governance.service";

const log = createLogger("useGovernanceDiscussion");

export interface ProposalComment {
  id: string;
  proposal_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
  /** Null on a top-level comment; the comment being replied to otherwise. */
  parent_id: string | null;
  /** Set the first time the author edits it (on web). */
  updated_at: string | null;
}

/** A top-level comment with its replies, oldest first, at one visible level. */
export interface ProposalThread {
  comment: ProposalComment;
  replies: ProposalComment[];
}

function useWallet(): string | null {
  const user = useUser() as any;
  return (user?.walletAddress || user?.address || null) as string | null;
}

/**
 * Group comments into threads, one visible level deep.
 *
 * An orphan — its root deleted between two reads — is dropped rather than
 * promoted; promoting it would reword the thread.
 */
export function buildProposalThreads(comments: ProposalComment[]): ProposalThread[] {
  const roots = comments.filter((comment) => !comment.parent_id);
  const rootIds = new Set(roots.map((comment) => comment.id));
  const byId = new Map(comments.map((comment) => [comment.id, comment]));

  const rootFor = (comment: ProposalComment): string | null => {
    let current = comment;
    // Bounded by the list length, so a cycle cannot outlive the walk.
    for (let hop = 0; hop < comments.length; hop += 1) {
      if (!current.parent_id) return current.id;
      if (rootIds.has(current.parent_id)) return current.parent_id;
      const parent = byId.get(current.parent_id);
      if (!parent) return null;
      current = parent;
    }
    return null;
  };

  const threads = new Map<string, ProposalThread>(
    roots.map((comment) => [comment.id, { comment, replies: [] }]),
  );
  for (const comment of comments) {
    if (!comment.parent_id) continue;
    const root = rootFor(comment);
    if (root) threads.get(root)?.replies.push(comment);
  }
  return roots.map((comment) => threads.get(comment.id)!);
}

export function useGovernanceProposal(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ["governance-proposal", proposalId],
    queryFn: () => getProposal(proposalId!),
    enabled: !!proposalId,
    staleTime: 60_000,
  });
}

export function useProposalDiscussion(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ["governance-comments", proposalId],
    queryFn: async (): Promise<ProposalThread[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from("governance_comments")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return buildProposalThreads((data || []) as ProposalComment[]);
    },
    enabled: !!proposalId,
    staleTime: 30_000,
  });
}

/** Everything a comment write touches: the thread, and the counts on the board. */
function invalidateProposal(queryClient: ReturnType<typeof useQueryClient>, proposalId: string) {
  queryClient.invalidateQueries({ queryKey: ["governance-comments", proposalId] });
  queryClient.invalidateQueries({ queryKey: ["governance-proposal", proposalId] });
  queryClient.invalidateQueries({ queryKey: ["governance-proposals"] });
}

export function useSubmitProposalComment() {
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const user = useUser() as any;

  return useMutation({
    mutationFn: async ({
      proposalId,
      content,
      parentId,
    }: {
      proposalId: string;
      content: string;
      /** The comment being replied to, or nothing for a new thread. */
      parentId?: string | null;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      const { data, error } = await withWalletHeader(
        supabase
          .from("governance_comments")
          .insert({
            proposal_id: proposalId,
            wallet_address: addr,
            username: user?.username || null,
            avatar: user?.avatarImageUrl || null,
            content: content.trim(),
            parent_id: parentId ?? null,
          })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data as ProposalComment;
    },
    onSuccess: (_data, variables) => {
      invalidateProposal(queryClient, variables.proposalId);
    },
    onError: (error) => {
      log.error("Post comment failed:", error);
      toastError(error, "Failed to post comment");
    },
  });
}

export function useDeleteProposalComment() {
  const queryClient = useQueryClient();
  const wallet = useWallet();

  return useMutation({
    mutationFn: async ({ commentId }: { commentId: string; proposalId: string }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase.from("governance_comments").delete().eq("id", commentId),
        addr,
      );
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidateProposal(queryClient, variables.proposalId);
      toastSuccess("Comment deleted");
    },
    onError: (error) => {
      log.error("Delete comment failed:", error);
      toastError(error, "Failed to delete comment");
    },
  });
}
