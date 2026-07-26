/**
 * Feature Requests data layer
 * ===========================
 * Native port of the web app's use-feature-requests.ts. Reads and writes the
 * same Supabase tables (`feature_requests`, `feature_request_votes`) with the
 * same filters, ordering and optimistic vote maths, so both clients agree.
 *
 * Differences from web, all deliberate:
 *  - No sessionStorage layer: the app already persists react-query through
 *    PersistQueryClientProvider (App.tsx), which covers the same ground.
 *  - RLS headers go through libs/supabase-wallet-client's `withWalletHeader`
 *    rather than calling .setHeader() inline.
 */
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";

const log = createLogger("useFeatureRequests");

export type FeatureCategory =
  | "ui_ux"
  | "performance"
  | "new_feature"
  | "bug_fix"
  | "integration"
  | "other";

export type FeatureStatus =
  | "open"
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed"
  | "shipped"
  | "declined";

export type FeatureSort = "most_voted" | "newest";

export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  category: FeatureCategory;
  status: FeatureStatus;
  author_wallet_address: string;
  author_username: string | null;
  author_avatar: string | null;
  image_url: string | null;
  vote_count: number;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  ui_ux: "UI/UX",
  performance: "Performance",
  new_feature: "New Feature",
  bug_fix: "Bug Fix",
  integration: "Integration",
  other: "Other",
};

export const STATUS_LABELS: Record<FeatureStatus, string> = {
  open: "Open",
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Shipped",
  shipped: "Shipped",
  declined: "Declined",
};

/** Accent per status — mirrors the web badge colours. */
export const STATUS_COLORS: Record<FeatureStatus, string> = {
  open: "#A1A1AA",
  under_review: "#FBBF24",
  planned: "#60A5FA",
  in_progress: "#A78BFA",
  completed: "#34D399",
  shipped: "#34D399",
  declined: "#F87171",
};

const PAGE_SIZE = 15;

/** Shipped items are pulled out into their own section, as on web. */
const SHIPPED_STATUSES = ["completed", "shipped"];

function useWallet(): string | null {
  const user = useUser() as any;
  return (user?.walletAddress || user?.address || null) as string | null;
}

export function useFeatureRequests(
  sort: FeatureSort,
  category: FeatureCategory | "all",
  search: string,
) {
  return useInfiniteQuery({
    queryKey: ["feature-requests", sort, category, search],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase.from("feature_requests").select("*");

      if (category !== "all") query = query.eq("category", category);

      const term = search.trim();
      if (term) {
        query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
      }

      if (sort === "most_voted") {
        query = query
          .order("vote_count", { ascending: false })
          .order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      // Shipped items live in their own section
      query = query.not("status", "in", '("completed","shipped")');
      query = query.range(pageParam, pageParam + PAGE_SIZE - 1);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as FeatureRequest[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useShippedFeatures() {
  return useQuery({
    queryKey: ["feature-requests-shipped"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_requests")
        .select("*")
        .in("status", SHIPPED_STATUSES)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as FeatureRequest[];
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useTotalFeatureCount() {
  return useQuery({
    queryKey: ["feature-requests-total-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("feature_requests")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

/** Map of featureRequestId → vote_type (1 or -1) for the signed-in wallet. */
export function useUserVotes() {
  const wallet = useWallet();

  return useQuery({
    queryKey: ["feature-request-votes", wallet],
    queryFn: async () => {
      if (!wallet) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("feature_request_votes")
        .select("feature_request_id, vote_type")
        .eq("wallet_address", wallet.toLowerCase());
      if (error) throw error;

      const voteMap: Record<string, number> = {};
      for (const v of (data || []) as Array<{
        feature_request_id: string;
        vote_type: number;
      }>) {
        voteMap[v.feature_request_id] = v.vote_type;
      }
      return voteMap;
    },
    enabled: !!wallet,
    staleTime: 60_000,
  });
}

type VoteVars = {
  featureRequestId: string;
  voteType: 1 | -1;
  currentVote: number | undefined;
};

export function useVoteFeatureRequest() {
  const queryClient = useQueryClient();
  const wallet = useWallet();

  return useMutation({
    mutationFn: async ({ featureRequestId, voteType, currentVote }: VoteVars) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      if (currentVote === voteType) {
        // Tapping the same arrow again clears the vote
        const { error } = await withWalletHeader(
          supabase
            .from("feature_request_votes")
            .delete()
            .eq("feature_request_id", featureRequestId)
            .eq("wallet_address", addr),
          addr,
        );
        if (error) throw error;
        return { action: "removed" as const };
      }

      const { error } = await withWalletHeader(
        supabase.from("feature_request_votes").upsert(
          {
            feature_request_id: featureRequestId,
            wallet_address: addr,
            vote_type: voteType,
          },
          { onConflict: "feature_request_id,wallet_address" },
        ),
        addr,
      );
      if (error) throw error;
      return { action: "voted" as const };
    },

    onMutate: async ({ featureRequestId, voteType, currentVote }: VoteVars) => {
      await queryClient.cancelQueries({ queryKey: ["feature-requests"] });
      await queryClient.cancelQueries({ queryKey: ["feature-request-votes"] });

      const previousRequests = queryClient.getQueriesData({ queryKey: ["feature-requests"] });
      const previousVotes = queryClient.getQueryData(["feature-request-votes", wallet]);

      queryClient.setQueryData(
        ["feature-request-votes", wallet],
        (old: Record<string, number> | undefined) => {
          const next = { ...(old || {}) };
          if (currentVote === voteType) delete next[featureRequestId];
          else next[featureRequestId] = voteType;
          return next;
        },
      );

      // Same delta maths as web so the counters agree before the refetch lands.
      const applyVote = (fr: FeatureRequest): FeatureRequest => {
        let voteDelta: number = voteType;
        let likeDelta = 0;
        let dislikeDelta = 0;

        if (currentVote === voteType) {
          voteDelta = -voteType;
          likeDelta = voteType === 1 ? -1 : 0;
          dislikeDelta = voteType === -1 ? -1 : 0;
        } else if (currentVote) {
          voteDelta = voteType - currentVote;
          likeDelta = voteType === 1 ? 1 : -1;
          dislikeDelta = voteType === -1 ? 1 : -1;
        } else {
          likeDelta = voteType === 1 ? 1 : 0;
          dislikeDelta = voteType === -1 ? 1 : 0;
        }

        return {
          ...fr,
          vote_count: fr.vote_count + voteDelta,
          like_count: Math.max(0, (fr.like_count ?? 0) + likeDelta),
          dislike_count: Math.max(0, (fr.dislike_count ?? 0) + dislikeDelta),
        };
      };

      queryClient.setQueriesData({ queryKey: ["feature-requests"] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: FeatureRequest[]) =>
            page.map((fr) => (fr.id === featureRequestId ? applyVote(fr) : fr)),
          ),
        };
      });

      return { previousRequests, previousVotes };
    },

    onError: (err, _vars, context) => {
      if (context?.previousRequests) {
        for (const [key, data] of context.previousRequests) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousVotes) {
        queryClient.setQueryData(["feature-request-votes", wallet], context.previousVotes);
      }
      log.error("Vote failed:", err);
      toastError(err, "Vote failed. Please try again.");
    },

    // Deliberately no onSettled invalidation (matches web): refetching
    // ["feature-requests"] here would reorder the list under the user's finger
    // on the most_voted sort. The optimistic counts stand until staleTime.
  });
}

// ── Comments ────────────────────────────────────────────────────────────────

export interface FeatureRequestComment {
  id: string;
  feature_request_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
}

export function useFeatureRequestComments(featureRequestId: string | null) {
  return useQuery({
    queryKey: ["feature-request-comments", featureRequestId],
    queryFn: async () => {
      if (!featureRequestId) return [] as FeatureRequestComment[];
      const { data, error } = await supabase
        .from("feature_request_comments")
        .select("*")
        .eq("feature_request_id", featureRequestId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as FeatureRequestComment[];
    },
    enabled: !!featureRequestId,
    staleTime: 30_000,
  });
}

/**
 * Adjust a feature's comment_count in the cached list without refetching it —
 * a refetch would reorder the most_voted list under the user.
 */
function patchCommentCount(
  queryClient: ReturnType<typeof useQueryClient>,
  featureRequestId: string,
  delta: 1 | -1,
) {
  queryClient.setQueriesData({ queryKey: ["feature-requests"] }, (old: any) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page: FeatureRequest[]) =>
        page.map((fr) =>
          fr.id === featureRequestId
            ? { ...fr, comment_count: Math.max(0, (fr.comment_count || 0) + delta) }
            : fr,
        ),
      ),
    };
  });
}

export function useSubmitComment() {
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const user = useUser() as any;

  return useMutation({
    mutationFn: async ({
      featureRequestId,
      content,
    }: {
      featureRequestId: string;
      content: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      const { data, error } = await withWalletHeader(
        supabase
          .from("feature_request_comments")
          .insert({
            feature_request_id: featureRequestId,
            wallet_address: addr,
            username: user?.username || null,
            avatar: user?.avatarImageUrl || null,
            content: content.trim(),
          })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["feature-request-comments", variables.featureRequestId],
      });
      patchCommentCount(queryClient, variables.featureRequestId, 1);
    },
    onError: (error) => {
      log.error("Post comment failed:", error);
      toastError(error, "Failed to post comment");
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  const wallet = useWallet();

  return useMutation({
    mutationFn: async ({
      commentId,
      featureRequestId,
    }: {
      commentId: string;
      featureRequestId: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      const { error } = await withWalletHeader(
        supabase.from("feature_request_comments").delete().eq("id", commentId),
        addr,
      );
      if (error) throw error;
      return { featureRequestId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["feature-request-comments", variables.featureRequestId],
      });
      patchCommentCount(queryClient, variables.featureRequestId, -1);
      toastSuccess("Comment deleted");
    },
    onError: (error) => {
      log.error("Delete comment failed:", error);
      toastError(error, "Failed to delete comment");
    },
  });
}

/**
 * Upload a picked local image to the shared `feature-media` bucket and return
 * its public URL. Web uploads a `File` to `${wallet}/${Date.now()}.${ext}`;
 * React Native has no File, so the local URI is read into a Blob first.
 */
async function uploadFeatureMedia(localUri: string, wallet: string): Promise<string> {
  const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${wallet.toLowerCase()}/${Date.now()}.${ext}`;
  const response = await fetch(localUri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from("feature-media")
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from("feature-media").getPublicUrl(path);
  return data.publicUrl;
}

export function useSubmitFeatureRequest() {
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const user = useUser() as any;

  return useMutation({
    mutationFn: async ({
      title,
      description,
      category,
      mediaUri,
    }: {
      title: string;
      description: string;
      category: FeatureCategory;
      mediaUri?: string | null;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      const imageUrl = mediaUri ? await uploadFeatureMedia(mediaUri, addr) : null;

      const { data, error } = await withWalletHeader(
        supabase
          .from("feature_requests")
          .insert({
            title: title.trim(),
            description: description.trim(),
            category,
            image_url: imageUrl,
            author_wallet_address: addr,
            author_username: user?.username || null,
            author_avatar: user?.avatarImageUrl || null,
          })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-requests"] });
      queryClient.invalidateQueries({ queryKey: ["feature-requests-total-count"] });
      toastSuccess("Feature request submitted!");
    },
    onError: (error) => {
      log.error("Submit feature request failed:", error);
      toastError(error, "Failed to submit feature request");
    },
  });
}
