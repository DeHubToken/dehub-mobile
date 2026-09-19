import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { toastError, toastSuccess } from "../libs/toast";
import { supabase } from "../services/supabase";

export type GovernanceComment = {
  id: string;
  proposal_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
};

function useWallet() {
  const user = useUser() as any;
  return (user?.walletAddress || user?.address || null) as string | null;
}

export function useGovernanceComments(proposalId: string | null) {
  return useQuery({
    queryKey: ["governance-comments", proposalId],
    queryFn: async () => {
      if (!proposalId) return [] as GovernanceComment[];
      const { data, error } = await supabase
        .from("governance_comments")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as GovernanceComment[];
    },
    enabled: !!proposalId,
    staleTime: 30_000,
  });
}

export function useSubmitGovernanceComment() {
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const user = useUser() as any;

  return useMutation({
    mutationFn: async ({ proposalId, content }: { proposalId: string; content: string }) => {
      if (!wallet) throw new Error("Not authenticated");
      const address = wallet.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("governance_comments")
          .insert({
            proposal_id: proposalId,
            wallet_address: address,
            username: user?.username || null,
            avatar: user?.avatarImageUrl || null,
            content: content.trim(),
          })
          .select()
          .single(),
        address,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["governance-comments", variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ["governance-proposals"] });
    },
    onError: (error) => toastError(error, "Failed to post comment"),
  });
}

export function useDeleteGovernanceComment() {
  const queryClient = useQueryClient();
  const wallet = useWallet();

  return useMutation({
    mutationFn: async ({ commentId, proposalId }: { commentId: string; proposalId: string }) => {
      if (!wallet) throw new Error("Not authenticated");
      const { error } = await withWalletHeader(
        supabase.from("governance_comments").delete().eq("id", commentId),
        wallet.toLowerCase(),
      );
      if (error) throw error;
      return proposalId;
    },
    onSuccess: (proposalId) => {
      queryClient.invalidateQueries({ queryKey: ["governance-comments", proposalId] });
      queryClient.invalidateQueries({ queryKey: ["governance-proposals"] });
      toastSuccess("Comment deleted");
    },
    onError: (error) => toastError(error, "Failed to delete comment"),
  });
}
