import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../context/AuthContext";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";

export interface WorkApplicationComment {
  id: string;
  job_id: string;
  application_id: string;
  author_address: string;
  body: string;
  created_at: string;
}

const TABLE = "work_application_comments";

export function useJobApplicationComments(jobId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!jobId) return;
    const channel = supabase.channel(`work-application-comments:${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE, filter: `job_id=eq.${jobId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["work-application-comments", jobId] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [jobId, qc]);

  return useQuery({
    queryKey: ["work-application-comments", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase.from(TABLE).select("*")
        .eq("job_id", jobId!).order("created_at").order("id");
      if (error) throw error;
      return (data || []) as WorkApplicationComment[];
    },
  });
}

export function useCommentOnApplication() {
  const user = useUser() as any;
  const wallet: string | undefined = user?.walletAddress || user?.address;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { job_id: string; application_id: string; body: string }) => {
      if (!wallet) throw new Error("Not authenticated");
      const body = params.body.trim();
      if (!body || body.length > 2000) throw new Error("Invalid comment length");
      const { data, error } = await withWalletHeader(
        supabase.from(TABLE).insert({ ...params, body, author_address: wallet.toLowerCase() }).select().single(),
        wallet,
      );
      if (error) throw error;
      return data as WorkApplicationComment;
    },
    onSuccess: (_, params) => {
      void qc.invalidateQueries({ queryKey: ["work-application-comments", params.job_id] });
    },
  });
}
