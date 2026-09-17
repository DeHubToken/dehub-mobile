/**
 * The post reaction system, for a surface that only knows the post's tokenId.
 *
 * A live post is a post: the same nine reactions, the same counts, the same
 * shared engagement overlay every mounted card reads. The live viewer used to
 * carry its own heart on `/api/live/:id/like` — a counter on the stream
 * document that nothing else on DeHub reads — so a like there never showed on
 * the feed card, never showed on web, and never showed as pressed after a
 * reload. This hook is FeedCard's reaction handler with the card stripped away:
 * seed from the post, write through applyEngagement, roll back on failure.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PostReaction } from "../libs/reactions";
import { applyReactionDelta, isPositiveReaction, reactionForTap } from "../libs/reactions";
import {
  applyEngagement,
  engagementKeyOf,
  isFailedResponse,
  revertEngagement,
  useEngagement,
} from "../libs/engagementCache";
import { useEngagementWeight } from "./useEngagementWeight";
import { getNFT, reactToNFT, voteOnNFT } from "../services/nft.service";

interface Options {
  tokenId: number | string | null | undefined;
  /** The viewer's address, forwarded on plain votes exactly as FeedCard does. */
  userAddress?: string;
  /** Defers to sign-in when the viewer is not; runs the action otherwise. */
  requireAuth?: (fn: () => void) => void;
  onError?: () => void;
}

export function useLivePostReactions({ tokenId, userAddress, requireAuth, onError }: Options) {
  // The post's own engagement fields, fetched once: the stream document does
  // not carry them, and the overlay only holds what some card already wrote.
  const [seed, setSeed] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (tokenId == null) return;
    let cancelled = false;
    getNFT(tokenId)
      .then((res) => {
        if (!cancelled && res?.result) setSeed(res.result as Record<string, unknown>);
      })
      .catch(() => {
        /* the overlay and the counts the stream carries are all there is */
      });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  const item = useMemo(() => ({ tokenId, ...(seed || {}) }), [tokenId, seed]);
  const engagement = useEngagement(item);
  const engagementKey = engagementKeyOf(item);
  const voteWeight = useEngagementWeight();
  const inFlightRef = useRef(false);

  const react = useCallback(
    (reaction: PostReaction) => {
      if (tokenId == null) return;
      if (inFlightRef.current) return;
      const run = () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        const { isLiked, isDisliked, likeCount, dislikeCount, myReaction, reactionCounts } = engagement;
        const isRemoving = myReaction === reaction;
        const next: PostReaction | null = isRemoving ? null : reaction;
        const wasPositive = myReaction ? isPositiveReaction(myReaction) : false;
        const wasNegative = myReaction ? !wasPositive : false;
        const nextPositive = next ? isPositiveReaction(next) : false;
        const nextNegative = next ? !nextPositive : false;
        let nextLikeCount = likeCount;
        let nextDislikeCount = dislikeCount;
        if (wasPositive && !nextPositive) nextLikeCount = Math.max(0, nextLikeCount - voteWeight);
        if (!wasPositive && nextPositive) nextLikeCount += voteWeight;
        if (wasNegative && !nextNegative) nextDislikeCount = Math.max(0, nextDislikeCount - voteWeight);
        if (!wasNegative && nextNegative) nextDislikeCount += voteWeight;

        applyEngagement(engagementKey, {
          isLiked: nextPositive,
          isDisliked: nextNegative,
          myReaction: next,
          likeCount: nextLikeCount,
          dislikeCount: nextDislikeCount,
          reactionCounts: applyReactionDelta(reactionCounts, myReaction, next, voteWeight),
        });
        const rollback = () => {
          revertEngagement(engagementKey, { isLiked, isDisliked, myReaction, likeCount, dislikeCount, reactionCounts });
          onError?.();
        };
        const request =
          reaction === "like" || reaction === "dislike"
            ? voteOnNFT({ streamTokenId: tokenId, vote: reaction === "like", account: userAddress })
            : reactToNFT({ streamTokenId: tokenId, reaction });
        request
          .then((res: any) => {
            if (isFailedResponse(res)) rollback();
          })
          .catch(rollback)
          .finally(() => {
            inFlightRef.current = false;
          });
      };
      if (requireAuth) requireAuth(run);
      else run();
    },
    [tokenId, engagement, engagementKey, voteWeight, userAddress, requireAuth, onError],
  );

  /** A thumb tap casts whichever reaction the thumb is wearing — see FeedCard. */
  const toggle = useCallback(
    (positive: boolean) => react(reactionForTap(positive, engagement.myReaction, engagement.reactionCounts)),
    [react, engagement.myReaction, engagement.reactionCounts],
  );

  return { ...engagement, react, toggle };
}

export default useLivePostReactions;
