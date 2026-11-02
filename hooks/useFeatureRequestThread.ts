/**
 * Requests board comment threads
 * ==============================
 * The Requests board keeps its comments in Supabase (`feature_request_comments`
 * plus `feature_request_comment_reactions`), the same tables web reads. This
 * hook turns those rows into the post thread's own `Comment` shape so the post
 * comment row (components/Comments/CommentItem) draws them: same avatar,
 * badge, reactions tray, media, link cards and long-press menu.
 *
 * Rows carry uuids; the post row speaks numbers. Each uuid gets a stable
 * number taken from its first 48 bits, and the map back lives next to the list.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { toastError } from "../libs/toast";
import { createLogger } from "../libs/logger";
import { dehubAuthHeaders } from "../services/ai.service";
import { getAccountSummaries, getAccountSummariesByUsernames, type AccountSummary } from "../services/user.service";
import { contentTypeForExtension, fileExtension, uploadLocalFileToBucket } from "../libs/storage-upload";
import { isPositiveReaction, type PostReaction } from "../libs/reactions";
import type { Comment } from "../services/nft.service";
import type { MediaAttachment } from "../components/Comments/CommentMediaPreview";
import { patchFeatureRow } from "./useFeatureRequests";

const log = createLogger("useFeatureRequestThread");

export type FeatureCommentMediaType = "image" | "video" | "audio" | "voice" | "gif";

interface Row {
  id: string;
  feature_request_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
  parent_id: string | null;
  updated_at: string | null;
  media_url?: string | null;
  media_type?: FeatureCommentMediaType | null;
  media_duration?: number | null;
}

interface ReactionRow {
  comment_id: string;
  wallet_address: string;
  reaction: string;
}

/** A top-level comment with its replies, one visible level, oldest first. */
export interface FeatureThread {
  comment: Comment;
  replies: Comment[];
}

export interface FeatureThreadData {
  threads: FeatureThread[];
  /** Post-row number → the Supabase row it stands for. */
  rows: Map<number, Row>;
  total: number;
}

/** A stable post-row number for a uuid. */
export function commentNumber(uuid: string): number {
  return parseInt(uuid.replace(/-/g, "").slice(0, 12), 16);
}

function toComment(row: Row, reactions: ReactionRow[], viewer: string | null, account?: AccountSummary): Comment {
  let likes = 0;
  let dislikes = 0;
  let mine: PostReaction | null = null;
  const counts: Partial<Record<PostReaction, number>> = {};
  for (const one of reactions) {
    const reaction = one.reaction as PostReaction;
    counts[reaction] = (counts[reaction] ?? 0) + 1;
    if (isPositiveReaction(reaction)) likes += 1;
    else dislikes += 1;
    if (viewer && one.wallet_address.toLowerCase() === viewer) mine = reaction;
  }
  const url = row.media_url || undefined;
  const type = row.media_type;
  const address = row.wallet_address.toLowerCase();
  return {
    id: commentNumber(row.id),
    address,
    content: row.content,
    imageUrl: url && type === "image" ? url : undefined,
    gifUrl: url && type === "gif" ? url : undefined,
    videoUrl: url && type === "video" ? url : undefined,
    audioUrl: url && (type === "audio" || type === "voice") ? url : undefined,
    audioDuration: url && (type === "audio" || type === "voice") ? row.media_duration ?? undefined : undefined,
    createdAt: row.created_at,
    parentId: row.parent_id ? commentNumber(row.parent_id) : undefined,
    likeCount: likes,
    dislikeCount: dislikes,
    isLiked: !!mine && isPositiveReaction(mine),
    isDisliked: mine === "dislike",
    myReaction: mine,
    reactionCounts: counts,
    views: 0,
    user: {
      address,
      username: account?.username || row.username || undefined,
      displayName: account?.displayName || undefined,
      avatarImageUrl: account?.avatarImageUrl || row.avatar || undefined,
      badgeBalance: account?.badgeBalance ?? undefined,
    },
  };
}

const queryKey = (id: string | null, viewer: string | null) => ["feature-request-thread", id, viewer];

function useWallet(): string | null {
  const user = useUser() as any;
  const wallet = (user?.walletAddress || user?.address || null) as string | null;
  return wallet ? wallet.toLowerCase() : null;
}

export function useFeatureRequestThread(featureRequestId: string | null) {
  const viewer = useWallet();
  return useQuery({
    queryKey: queryKey(featureRequestId, viewer),
    enabled: !!featureRequestId,
    staleTime: 30_000,
    queryFn: async (): Promise<FeatureThreadData> => {
      const empty: FeatureThreadData = { threads: [], rows: new Map(), total: 0 };
      if (!featureRequestId) return empty;
      const { data, error } = await supabase
        .from("feature_request_comments")
        .select("*")
        .eq("feature_request_id", featureRequestId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data || []) as Row[];
      if (rows.length === 0) return empty;

      const [reactionResult, accounts] = await Promise.all([
        supabase
          .from("feature_request_comment_reactions")
          .select("comment_id, wallet_address, reaction")
          .in("comment_id", rows.map((row) => row.id)),
        // Fresh names, avatars and badges, the same account rows a post
        // comment carries. A slow API keeps the names stored on the rows.
        getAccountSummaries(rows.map((row) => row.wallet_address)).catch(() => [] as AccountSummary[]),
      ]);
      if (reactionResult.error) log.warn("comment reactions unavailable", reactionResult.error);
      const reactions = (reactionResult.data || []) as ReactionRow[];
      const byComment = new Map<string, ReactionRow[]>();
      for (const one of reactions) {
        const list = byComment.get(one.comment_id);
        if (list) list.push(one);
        else byComment.set(one.comment_id, [one]);
      }
      const byAddress = new Map(accounts.map((account) => [account.address.toLowerCase(), account]));

      const byId = new Map(rows.map((row) => [row.id, row]));
      const rootFor = (row: Row): string | null => {
        let current = row;
        for (let hop = 0; hop < rows.length; hop += 1) {
          if (!current.parent_id) return current.id;
          const parent = byId.get(current.parent_id);
          if (!parent) return null;
          current = parent;
        }
        return null;
      };

      const numbered = new Map<number, Row>();
      const threads = new Map<string, FeatureThread>();
      for (const row of rows) {
        numbered.set(commentNumber(row.id), row);
        if (!row.parent_id) {
          threads.set(row.id, {
            comment: toComment(row, byComment.get(row.id) ?? [], viewer, byAddress.get(row.wallet_address.toLowerCase())),
            replies: [],
          });
        }
      }
      for (const row of rows) {
        if (!row.parent_id) continue;
        const root = rootFor(row);
        const thread = root ? threads.get(root) : undefined;
        if (!thread) continue;
        thread.replies.push(
          toComment(row, byComment.get(row.id) ?? [], viewer, byAddress.get(row.wallet_address.toLowerCase())),
        );
      }
      const list = [...threads.values()];
      return {
        threads: list,
        rows: numbered,
        total: list.reduce((sum, thread) => sum + 1 + thread.replies.length, 0),
      };
    },
  });
}

/** Put one attachment in the shared `feature-media` bucket and return its URL. */
async function uploadAttachment(media: MediaAttachment, wallet: string): Promise<{
  url: string;
  type: FeatureCommentMediaType;
  duration: number | null;
}> {
  if (media.type === "gif") return { url: media.url, type: "gif", duration: null };
  const fallback = media.type === "image" ? "jpg" : media.type === "video" ? "mp4" : "m4a";
  const mimeType = "mimeType" in media ? media.mimeType : undefined;
  const fileName = media.type === "audiofile" ? media.name : undefined;
  const ext = fileExtension({ uri: media.uri, mimeType, fileName }, fallback);
  const path = `${wallet}/comment-${Date.now()}.${ext}`;
  const url = await uploadLocalFileToBucket({
    bucket: "feature-media",
    path,
    uri: media.uri,
    contentType: mimeType || contentTypeForExtension(ext, media.type === "image" ? "image/jpeg" : "application/octet-stream"),
  });
  if (media.type === "image") return { url, type: "image", duration: null };
  if (media.type === "video") return { url, type: "video", duration: null };
  if (media.type === "audio") return { url, type: "voice", duration: Math.max(1, Math.round(media.durationMs / 1000)) };
  return { url, type: "audio", duration: null };
}

function mentionedHandles(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/@([a-zA-Z0-9._]{1,30})/g)) found.add(match[1].toLowerCase());
  return [...found].slice(0, 5);
}

/** Tell the people named in a comment — same rows web writes. Best-effort. */
async function notifyMentions(params: {
  content: string;
  featureRequestId: string;
  featureTitle: string | null;
  actor: string;
  actorUsername: string | null;
  actorAvatar: string | null;
  skip: string[];
}) {
  const handles = mentionedHandles(params.content);
  if (handles.length === 0) return;
  const skip = new Set(params.skip.filter(Boolean).map((address) => address.toLowerCase()));
  const accounts = await getAccountSummariesByUsernames(handles).catch(() => [] as AccountSummary[]);
  const recipients = [...new Set(accounts.map((account) => account.address.toLowerCase()))].filter((a) => a && !skip.has(a));
  if (recipients.length === 0) return;
  try {
    await withWalletHeader(
      supabase.from("custom_notifications").insert(
        recipients.map((address) => ({
          recipient_address: address,
          actor_address: params.actor,
          actor_username: params.actorUsername,
          actor_avatar: params.actorAvatar,
          type: "feature_request_mention",
          content: params.content.slice(0, 100),
          reference_id: params.featureRequestId,
          reference_title: params.featureTitle,
        })),
      ),
      params.actor,
    );
  } catch {
    // The comment stands whether or not the mention row landed.
  }
}

const ASSISTANT_MENTION_RE = /(^|[^a-zA-Z0-9_])@assistant(?![a-zA-Z0-9_])/i;

export function useFeatureThreadActions(featureRequestId: string, feature: { title: string; authorAddress: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const user = useUser() as any;
  const key = queryKey(featureRequestId, wallet);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["feature-request-thread", featureRequestId] });

  const submit = useMutation({
    mutationFn: async (input: { content: string; parent: Row | null; media: MediaAttachment | null }) => {
      if (!wallet) throw new Error("Not authenticated");
      const attached = input.media ? await uploadAttachment(input.media, wallet) : null;
      const text = input.content.trim();
      const avatar = user?.avatarImageUrl || null;
      const { data, error } = await withWalletHeader(
        supabase
          .from("feature_request_comments")
          .insert({
            feature_request_id: featureRequestId,
            wallet_address: wallet,
            username: user?.username || null,
            avatar,
            content: text,
            parent_id: input.parent?.id ?? null,
            ...(attached ? {
              media_url: attached.url,
              media_type: attached.type,
              media_duration: attached.duration,
            } : {}),
          })
          .select()
          .single(),
        wallet,
      );
      if (error) throw error;
      void notifyMentions({
        content: text,
        featureRequestId,
        featureTitle: feature.title,
        actor: wallet,
        actorUsername: user?.username || null,
        actorAvatar: avatar,
        skip: [wallet, feature.authorAddress, input.parent?.wallet_address ?? ""],
      });
      return data as Row;
    },
    onSuccess: (row, input) => {
      void refresh();
      patchFeatureRow(queryClient, featureRequestId, (fr) => ({ ...fr, comment_count: (fr.comment_count || 0) + 1 }));
      if (row?.id && wallet && ASSISTANT_MENTION_RE.test(input.content)) {
        void (async () => {
          const headers = await dehubAuthHeaders(wallet);
          if (!headers["x-dehub-token"]) return;
          const { error } = await supabase.functions.invoke("feature-request-assistant", {
            body: { commentId: row.id },
            headers,
          });
          if (error) throw error;
          void refresh();
        })().catch((error) => log.warn("Assistant reply failed:", error));
      }
    },
    onError: (error) => {
      log.error("Post comment failed:", error);
      toastError(error, t("copy.791ab06be905", { defaultValue: "Failed to post comment" }));
    },
  });

  const edit = useMutation({
    mutationFn: async ({ row, content }: { row: Row; content: string }) => {
      if (!wallet) throw new Error("Not authenticated");
      const { error } = await withWalletHeader(
        supabase
          .from("feature_request_comments")
          .update({ content: content.trim(), updated_at: new Date().toISOString() })
          .eq("id", row.id),
        wallet,
      );
      if (error) throw error;
    },
    onSuccess: () => { void refresh(); },
    onError: (error) => toastError(error, t("copy.78443791af16", { defaultValue: "Failed to save comment" })),
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      if (!wallet) throw new Error("Not authenticated");
      const { error } = await withWalletHeader(
        supabase.from("feature_request_comments").delete().eq("id", row.id),
        wallet,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void refresh();
      patchFeatureRow(queryClient, featureRequestId, (fr) => ({ ...fr, comment_count: Math.max(0, (fr.comment_count || 0) - 1) }));
    },
    onError: (error) => toastError(error, t("copy.c65a5314ca9e", { defaultValue: "Failed to delete comment" })),
  });

  /**
   * Cast, change or clear a reaction — one row per viewer per comment. Throws
   * on failure so the post row puts its optimistic tally back.
   */
  const react = async (row: Row, reaction: PostReaction, current: PostReaction | null) => {
    if (!wallet) throw new Error("Not authenticated");
    const query = current === reaction
      ? supabase.from("feature_request_comment_reactions").delete().eq("comment_id", row.id).eq("wallet_address", wallet)
      : supabase.from("feature_request_comment_reactions").upsert(
        { comment_id: row.id, wallet_address: wallet, reaction },
        { onConflict: "comment_id,wallet_address" },
      );
    const { error } = await withWalletHeader(query, wallet);
    if (error) {
      toastError(error, t("copy.13931898084d", { defaultValue: "Failed to react" }));
      throw error;
    }
    void queryClient.invalidateQueries({ queryKey: key });
  };

  return { submit, edit, remove, react };
}

export type { Row as FeatureCommentRow };

/**
 * Who reacted positively to one Requests comment, in the likers sheet's shape.
 * The sheet opens from your own comment's thumb, the same as on a post.
 */
export function featureLikersLoader(rows: Map<number, Row>) {
  return async ({ commentId, page = 0, limit = 50 }: { commentId: string | number; page?: number; limit?: number }) => {
    const row = rows.get(Number(commentId));
    if (!row) return { result: true, canViewLikers: true, data: [], pagination: { page, limit, totalCount: 0, hasMore: false } } as any;
    const { data, error } = await supabase
      .from("feature_request_comment_reactions")
      .select("wallet_address, reaction, created_at")
      .eq("comment_id", row.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const positive = ((data || []) as unknown as ReactionRow[]).filter((one) => isPositiveReaction(one.reaction as PostReaction));
    const slice = positive.slice(page * limit, page * limit + limit);
    const accounts = await getAccountSummaries(slice.map((one) => one.wallet_address)).catch(() => [] as AccountSummary[]);
    const byAddress = new Map(accounts.map((account) => [account.address.toLowerCase(), account]));
    return {
      result: true,
      canViewLikers: true,
      data: slice.map((one) => {
        const account = byAddress.get(one.wallet_address.toLowerCase());
        return {
          address: one.wallet_address,
          username: account?.username ?? null,
          displayName: account?.displayName ?? null,
          avatarImageUrl: account?.avatarImageUrl ?? null,
          badgeBalance: account?.badgeBalance ?? undefined,
        };
      }),
      pagination: { page, limit, totalCount: positive.length, hasMore: (page + 1) * limit < positive.length },
    } as any;
  };
}
