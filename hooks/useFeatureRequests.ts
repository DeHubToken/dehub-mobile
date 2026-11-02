import { useTranslation as _useCopy } from 'react-i18next';
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
import { toastError, toastSuccess, toastWarning } from "../libs/toast";
import { createLogger } from "../libs/logger";
import { dehubAuthHeaders } from "../services/ai.service";
import {
  contentTypeForExtension,
  fileExtension,
  uploadLocalFileToBucket,
} from "../libs/storage-upload";

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
  /**
   * Every attachment on the request. `image_url` mirrors the first one for
   * clients that predate the column — read through `featureAttachments` rather
   * than either field, exactly as web's lib/feature-attachments.ts does.
   */
  image_urls?: string[] | null;
  /** Short tag shown next to the status, e.g. "Future review". */
  status_note?: string | null;
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
  under_review: "#D4D4D8",
  planned: "#D4D4D8",
  in_progress: "#D4D4D8",
  completed: "#F4F4F5",
  shipped: "#F4F4F5",
  declined: "#8B8D90",
};

const PAGE_SIZE = 15;

/**
 * One request can sit in four caches at once: the paged Requests list, the
 * Shipping and Shipped arrays, and the single row a notification pins. Patching
 * only the paged list left votes and comment counts frozen on every Shipping
 * and Shipped card, which is where most of the board lives.
 */
const FEATURE_ROW_KEYS = [
  ["feature-requests"],
  ["feature-requests-shipped"],
  ["feature-requests-in-progress"],
  ["feature-request"],
] as const;

export function patchFeatureRow(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  patch: (row: FeatureRequest) => FeatureRequest,
) {
  const apply = (row: FeatureRequest) => (row?.id === id ? patch(row) : row);
  for (const queryKey of FEATURE_ROW_KEYS) {
    queryClient.setQueriesData({ queryKey }, (old: any) => {
      if (!old) return old;
      if (Array.isArray(old.pages)) {
        return { ...old, pages: old.pages.map((page: FeatureRequest[]) => page.map(apply)) };
      }
      if (Array.isArray(old)) return old.map(apply);
      if (typeof old === "object" && "id" in old) return apply(old);
      return old;
    });
  }
}

/** Edits and deletes refresh every list that can hold the row, not only Requests. */
function invalidateFeatureRows(queryClient: ReturnType<typeof useQueryClient>) {
  for (const queryKey of FEATURE_ROW_KEYS) queryClient.invalidateQueries({ queryKey });
  queryClient.invalidateQueries({ queryKey: ["feature-requests-total-count"] });
}

/** Shipped items are pulled out into their own section, as on web. */
const SHIPPED_STATUSES = ["completed", "shipped"];

/**
 * Statuses the Requests list must not show: shipped ones have their own tab,
 * in-progress ones have theirs, and declined ones are resolved — without this a
 * declined request sits in the list forever. Matches web's
 * use-feature-requests.ts, including `in_progress`: leaving it out here is what
 * put the same row on two tabs at once.
 */
const RESOLVED_STATUSES = '("completed","shipped","declined","in_progress")';

/** Matches the cardinality bound on feature_requests.image_urls. */
export const MAX_FEATURE_ATTACHMENTS = 6;

/** Per-file ceiling, same as web's: 50MB so a screen recording of a bug fits. */
export const MAX_FEATURE_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** One picked attachment. Only `uri` is required; the rest name the file. */
export type FeatureAttachment = {
  /** `file://` path or, on Android, a picker `content://` URI. */
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

/**
 * Every attachment on a request, oldest-first. `image_urls` is the authority
 * when present; rows written before the column existed only carry `image_url`.
 * Mirrors web's lib/feature-attachments.ts so both clients read the same rows
 * the same way.
 */
export function featureAttachments(
  feature: { image_url?: string | null; image_urls?: string[] | null } | null | undefined,
): string[] {
  if (!feature) return [];
  const many = feature.image_urls;
  if (Array.isArray(many)) {
    const urls = many.filter((u): u is string => typeof u === "string" && u.length > 0);
    if (urls.length > 0) return urls;
  }
  return typeof feature.image_url === "string" && feature.image_url.length > 0
    ? [feature.image_url]
    : [];
}

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|ogg)(\?|#|$)/i;

/** Whether an attachment should play rather than render as a still. */
export function isVideoAttachment(url: string): boolean {
  return VIDEO_EXTENSIONS.test(url);
}

/**
 * PostgREST parses `or=(...)` as a filter tree whose clauses are comma-separated,
 * so a comma typed into the search box splits the clause and the request 400s
 * (verified live: searching `DM, video` unquoted returns HTTP 400). Wrap the
 * pattern in double quotes so it arrives as one literal value.
 *
 * Mirrors web's src/lib/postgrest-filter.ts.
 */
function escapeFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

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
        const pattern = escapeFilterValue(`%${term}%`);
        query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`);
      }

      if (sort === "most_voted") {
        query = query
          .order("vote_count", { ascending: false })
          .order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      // Shipped items live in their own section; declined ones are resolved and
      // don't belong in the list at all.
      query = query.not("status", "in", RESOLVED_STATUSES);
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

/**
 * One feature request by id, for a notification's deep link.
 *
 * The list query can't be relied on to hold it — it may be shipped, declined,
 * outside the active category, or pages down the infinite scroll — so the
 * screen fetches the single row and pins it above everything else. A request
 * that has since been deleted comes back null and the board renders normally.
 */
export function useFeatureRequest(id: string | null | undefined) {
  return useQuery({
    queryKey: ["feature-request", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("feature_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as FeatureRequest | null) ?? null;
    },
    enabled: !!id,
    staleTime: 60_000,
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

/** Requests currently being built — the Shipping tab. */
export function useInProgressFeatures() {
  return useQuery({
    queryKey: ["feature-requests-in-progress"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_requests")
        .select("*")
        .eq("status", "in_progress")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as FeatureRequest[];
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

/**
 * Board totals for the header and the Requests tab badge. `open` is counted
 * with the same status filter the list uses, so the badge can never disagree
 * with the rows underneath it.
 */
export function useFeatureCounts() {
  return useQuery({
    queryKey: ["feature-requests-total-count"],
    queryFn: async () => {
      const [totalRes, openRes] = await Promise.all([
        supabase.from("feature_requests").select("*", { count: "exact", head: true }),
        supabase
          .from("feature_requests")
          .select("*", { count: "exact", head: true })
          .not("status", "in", RESOLVED_STATUSES),
      ]);
      if (totalRes.error) throw totalRes.error;
      if (openRes.error) throw openRes.error;
      return { total: totalRes.count ?? 0, open: openRes.count ?? 0 };
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
  const { t: _copy } = _useCopy();
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
      for (const queryKey of FEATURE_ROW_KEYS) await queryClient.cancelQueries({ queryKey });
      await queryClient.cancelQueries({ queryKey: ["feature-request-votes"] });

      const previousRequests = FEATURE_ROW_KEYS.flatMap((queryKey) =>
        queryClient.getQueriesData({ queryKey }),
      );
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

      patchFeatureRow(queryClient, featureRequestId, applyVote);

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
      toastError(err, _copy("copy.485fbbcb6b0e", { defaultValue: "Vote failed. Please try again." }));
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
  patchFeatureRow(queryClient, featureRequestId, (fr) => ({
    ...fr,
    comment_count: Math.max(0, (fr.comment_count || 0) + delta),
  }));
}

/**
 * The assistant's trigger on the requests board, word-bounded.
 *
 * `@dehub` is deliberately not a trigger: it is a real user's handle, and the
 * chat bot's original regex matched it, so every "@dehub" answered on that
 * person's behalf. The same expression guards the server side — this copy only
 * decides whether the call is worth making.
 */
const ASSISTANT_MENTION_RE = /(^|[^a-zA-Z0-9_])@assistant(?![a-zA-Z0-9_])/i;

/**
 * Ask the assistant to answer a comment that tagged it.
 *
 * The reply is written server-side as a real comment owned by the assistant
 * account, so there is nothing to render here — only a refetch once it lands.
 * These threads have no realtime channel, which is why this waits on the call
 * rather than hoping an invalidation catches it.
 */
async function requestAssistantReply(
  commentId: string,
  walletAddress: string,
): Promise<void> {
  const headers = await dehubAuthHeaders(walletAddress);
  if (!headers["x-dehub-token"]) return;
  const { error } = await supabase.functions.invoke("feature-request-assistant", {
    body: { commentId },
    headers,
  });
  if (error) throw error;
}

export function useSubmitComment() {
  const { t: _copy } = _useCopy();
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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["feature-request-comments", variables.featureRequestId],
      });
      patchCommentCount(queryClient, variables.featureRequestId, 1);

      // Tagging @assistant here gets an answer from the assistant itself, in
      // DeHub's own voice. This board is where the people who reported things
      // come back to ask whether the fix landed, and a question that sits
      // unanswered until somebody scrolls past is the whole problem. Fire and
      // forget: the comment is already saved, so a failed reply must not toast
      // an error over it.
      const newCommentId = (data as { id?: string } | null)?.id;
      if (newCommentId && wallet && ASSISTANT_MENTION_RE.test(variables.content)) {
        void requestAssistantReply(newCommentId, wallet)
          .then(() => {
            queryClient.invalidateQueries({
              queryKey: ["feature-request-comments", variables.featureRequestId],
            });
          })
          .catch((error) => {
            log.warn("Assistant reply failed:", error);
          });
      }
    },
    onError: (error) => {
      log.error("Post comment failed:", error);
      toastError(error, _copy("copy.791ab06be905", { defaultValue: "Failed to post comment" }));
    },
  });
}

export function useDeleteComment() {
  const { t: _copy } = _useCopy();
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
      toastSuccess(_copy("copy.7199a134a339", { defaultValue: "Comment deleted" }));
    },
    onError: (error) => {
      log.error("Delete comment failed:", error);
      toastError(error, _copy("copy.c65a5314ca9e", { defaultValue: "Failed to delete comment" }));
    },
  });
}

/**
 * Upload a picked local file to the shared `feature-media` bucket and return
 * its public URL, at the same `${wallet}/${Date.now()}-${i}.${ext}` path web
 * writes. Android's picker returns `content://` URIs with no extension in
 * them, so the extension falls back to the picker's file name or MIME type.
 */
async function uploadFeatureMedia(
  attachment: FeatureAttachment,
  wallet: string,
  index: number,
): Promise<string> {
  const ext = fileExtension(attachment, "jpg");
  // The filename is stamped with Date.now(); the index keeps same-extension
  // files picked in the same millisecond from colliding, as on web.
  const path = `${wallet.toLowerCase()}/${Date.now()}-${index}.${ext}`;
  return uploadLocalFileToBucket({
    bucket: "feature-media",
    path,
    uri: attachment.uri,
    contentType: contentTypeForExtension(ext, "image/jpeg"),
  });
}

/** True when Postgres rejected the payload because the column isn't there yet. */
function isMissingColumn(error: any, column: string): boolean {
  const message = String(error?.message ?? "");
  return error?.code === "PGRST204" || (message.includes(column) && /column/i.test(message));
}

export function useSubmitFeatureRequest() {
  const { t: _copy } = _useCopy();
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const user = useUser() as any;

  return useMutation({
    mutationFn: async ({
      title,
      description,
      category,
      attachments,
    }: {
      title: string;
      description: string;
      category: FeatureCategory;
      /** Picked local files, oldest-first. Capped at MAX_FEATURE_ATTACHMENTS. */
      attachments?: FeatureAttachment[] | null;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      const picked = (attachments ?? []).slice(0, MAX_FEATURE_ATTACHMENTS);
      const imageUrls: string[] = [];
      // Sequential, not parallel — see the filename note in uploadFeatureMedia.
      for (const [index, attachment] of picked.entries()) {
        imageUrls.push(await uploadFeatureMedia(attachment, addr, index));
      }

      const row = {
        title: title.trim(),
        description: description.trim(),
        category,
        image_url: imageUrls[0] ?? null,
        author_wallet_address: addr,
        author_username: user?.username || null,
        author_avatar: user?.avatarImageUrl || null,
      };

      const insert = (payload: Record<string, unknown>) =>
        withWalletHeader(
          supabase.from("feature_requests").insert(payload as any).select().single(),
          addr,
        );

      const { data, error } = await insert(
        imageUrls.length > 0 ? { ...row, image_urls: imageUrls } : row,
      );

      // The board must keep accepting reports where image_urls has not been
      // migrated in yet: retry on the single-attachment shape rather than lose
      // the submission. image_url already holds the first upload, so only the
      // extras are dropped — and the toast says so.
      if (error && isMissingColumn(error, "image_urls")) {
        const retry = await insert(row);
        if (retry.error) throw retry.error;
        if (imageUrls.length > 1) {
          toastWarning(
            "Only the first attachment was saved — attachments are still rolling out",
          );
        }
        return retry.data;
      }

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-requests"] });
      queryClient.invalidateQueries({ queryKey: ["feature-requests-total-count"] });
      toastSuccess(_copy("copy.27873a08f25d", { defaultValue: "Feature request submitted!" }));
    },
    onError: (error) => {
      log.error("Submit feature request failed:", error);
      toastError(error, _copy("copy.c7ea1b9c02fb", { defaultValue: "Failed to submit feature request" }));
    },
  });
}

/** Author-only edit of their own request. Mirrors web's useEditFeatureRequest. */
export function useEditFeatureRequest() {
  const { t: _copy } = _useCopy();
  const queryClient = useQueryClient();
  const wallet = useWallet();

  return useMutation({
    mutationFn: async ({
      id,
      title,
      description,
      category,
    }: {
      id: string;
      title: string;
      description: string;
      category: FeatureCategory;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("feature_requests")
          .update({ title: title.trim(), description: description.trim(), category })
          .eq("id", id)
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateFeatureRows(queryClient);
      toastSuccess(_copy("copy.b8af57e311aa", { defaultValue: "Feature request updated!" }));
    },
    onError: (error) => {
      log.error("Edit feature request failed:", error);
      toastError(error, _copy("copy.db455cae992e", { defaultValue: "Failed to update feature request" }));
    },
  });
}

/**
 * Accounts that can move any request to Queued or Shipped, whoever posted it.
 * Only decides who sees the controls: the database's
 * feature_request_status_editor_wallets() is the real check. Same list as web.
 */
const FEATURE_STATUS_EDITOR_WALLETS = ["0x9324840523a5d17dd12a2f11a9472e5a199c1937"]; // maldoteth

export function isFeatureStatusEditor(wallet: string | null | undefined): boolean {
  return !!wallet && FEATURE_STATUS_EDITOR_WALLETS.includes(wallet.toLowerCase());
}

/** Statuses the owners set from the board: Requests, Queued, Shipped. */
export type EditableFeatureStatus = "open" | "in_progress" | "shipped";

/** Owner-only status change. Mirrors web's useSetFeatureStatus. */
export function useSetFeatureStatus() {
  const { t: _copy } = _useCopy();
  const queryClient = useQueryClient();
  const wallet = useWallet();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EditableFeatureStatus }) => {
      if (!wallet) throw new Error("Not authenticated");
      const { error } = await withWalletHeader(
        (supabase as any).rpc("set_feature_request_status", { p_id: id, p_status: status }),
        wallet.toLowerCase(),
      );
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      invalidateFeatureRows(queryClient);
      toastSuccess(
        status === "shipped"
          ? _copy("copy.366cb56b38ce", { defaultValue: "Marked Shipped" })
          : status === "in_progress"
            ? _copy("copy.ae6a0ffbe609", { defaultValue: "Marked Queued" })
            : _copy("copy.9db7b5ba03bb", { defaultValue: "Moved back to Requests" }),
      );
    },
    onError: (error) => {
      log.error("Set feature status failed:", error);
      toastError(error, _copy("copy.bb2be752e079", { defaultValue: "Couldn't change the status" }));
    },
  });
}

/** Author-only delete. Mirrors web's useDeleteFeatureRequest. */
export function useDeleteFeatureRequest() {
  const { t: _copy } = _useCopy();
  const queryClient = useQueryClient();
  const wallet = useWallet();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase.from("feature_requests").delete().eq("id", id),
        addr,
      );
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateFeatureRows(queryClient);
      toastSuccess(_copy("copy.be692c8e223e", { defaultValue: "Feature request deleted" }));
    },
    onError: (error) => {
      log.error("Delete feature request failed:", error);
      toastError(error, _copy("copy.b500b2068ac7", { defaultValue: "Failed to delete feature request" }));
    },
  });
}

export interface ShippedFeatureNotice {
  id: string;
  title: string;
  category: FeatureCategory;
}

/**
 * The caller's own requests that shipped and that they have not been told
 * about yet. Same two reads as web's useUnnotifiedShippedFeatures, against
 * the same `feature_shipped_notifications` table, so a thank-you seen on one
 * client is never shown again on the other. Before this the app had no notice
 * at all and an app-only author only heard about it by logging in on web.
 */
export function useUnnotifiedShippedFeatures() {
  const wallet = useWallet();

  return useQuery({
    queryKey: ["feature-requests-unnotified-shipped", wallet?.toLowerCase() ?? null],
    queryFn: async () => {
      const addr = wallet!.toLowerCase();
      const [shippedRes, notifiedRes] = await Promise.all([
        supabase
          .from("feature_requests")
          .select("id, title, category")
          .eq("author_wallet_address", addr)
          .in("status", SHIPPED_STATUSES),
        withWalletHeader(
          supabase
            .from("feature_shipped_notifications")
            .select("feature_request_id")
            .eq("wallet_address", addr),
          addr,
        ),
      ]);
      // A failed read shows nothing rather than a notice the user already saw.
      if (shippedRes.error || notifiedRes.error) return [];
      const notified = new Set(
        ((notifiedRes.data || []) as { feature_request_id: string }[]).map((n) => n.feature_request_id),
      );
      return ((shippedRes.data || []) as ShippedFeatureNotice[]).filter((f) => !notified.has(f.id));
    },
    enabled: !!wallet,
    staleTime: 60_000,
    retry: false,
  });
}

/** Record the notice as seen for these requests (idempotent, like web's). */
export function useMarkShippedNotified() {
  const queryClient = useQueryClient();
  const wallet = useWallet();

  return useMutation({
    mutationFn: async (featureRequestIds: string[]) => {
      if (!wallet || featureRequestIds.length === 0) return;
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase
          .from("feature_shipped_notifications")
          .upsert(
            featureRequestIds.map((feature_request_id) => ({ wallet_address: addr, feature_request_id })),
            { onConflict: "wallet_address,feature_request_id", ignoreDuplicates: true },
          ),
        addr,
      );
      if (error) throw error;
    },
    onMutate: (featureRequestIds) => {
      // Drop them at once so the notice cannot reopen while the write is in flight.
      queryClient.setQueryData<ShippedFeatureNotice[]>(
        ["feature-requests-unnotified-shipped", wallet?.toLowerCase() ?? null],
        (old) => old?.filter((f) => !featureRequestIds.includes(f.id)),
      );
    },
    onError: (err) => log.error("mark shipped notified failed", err),
  });
}
