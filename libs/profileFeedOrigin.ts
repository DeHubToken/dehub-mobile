/**
 * A post opened from a profile tab keeps going through that creator's posts of
 * the same format, in the tab's own order: a text post from Posts continues
 * into their next text posts on the post page, a video from Videos plays on
 * through their videos in the Shorts viewer, the All tab into everything.
 *
 * Each profile tab provides the query it lists. A card opening a post notes it
 * against the post's id; the post page's continuation and the Shorts viewer
 * read it back by id.
 */
import { createContext, useContext, useRef } from "react";
import type { FeedPostType, FeedRange, FeedSortBy, FeedSortOrder } from "../services/feed.unified.service";

export interface ProfileFeedOrigin {
  minter: string;
  /** Unset on the All tab: every format. */
  postType?: FeedPostType;
  sortBy?: FeedSortBy;
  sortOrder?: FeedSortOrder;
  search?: string;
  category?: string;
  range?: FeedRange;
  isPPV?: boolean;
  hasBounty?: boolean;
  isLocked?: boolean;
}

/** Read at tap time, so a re-rendering tab does not re-render every card. */
export interface ProfileFeedSource {
  current: ProfileFeedOrigin | null;
}

export const ProfileFeedOriginContext = createContext<ProfileFeedSource | null>(null);

export function useProfileFeedSource(): ProfileFeedSource | null {
  return useContext(ProfileFeedOriginContext);
}

/** A tap that never became a page view should not steer a later visit. */
const NOTE_TTL_MS = 2 * 60 * 1000;
const notes = new Map<string, { origin: ProfileFeedOrigin; at: number }>();

export function noteProfileFeedOpen(source: ProfileFeedSource | null | undefined, postId: string | number | null | undefined): ProfileFeedOrigin | null {
  const origin = source?.current ?? null;
  if (!origin || postId == null || postId === "") return null;
  notes.set(String(postId), { origin, at: Date.now() });
  return origin;
}

export function peekProfileFeedOrigin(postId: string | number | null | undefined): ProfileFeedOrigin | null {
  if (postId == null || postId === "") return null;
  const note = notes.get(String(postId));
  if (!note) return null;
  if (Date.now() - note.at > NOTE_TTL_MS) {
    notes.delete(String(postId));
    return null;
  }
  return note.origin;
}

/** The /feed query for one page of the origin's list. */
export function profileFeedParams(origin: ProfileFeedOrigin, page: number, limit: number) {
  return {
    minter: origin.minter,
    postType: origin.postType && origin.postType !== "all" ? origin.postType : undefined,
    sortBy: origin.sortBy ?? ("createdAt" as const),
    sortOrder: origin.sortOrder ?? ("desc" as const),
    search: origin.search || undefined,
    category: origin.category || undefined,
    range: origin.range,
    isPPV: origin.isPPV || undefined,
    hasBounty: origin.hasBounty || undefined,
    isLocked: origin.isLocked || undefined,
    status: "all" as const,
    page,
    limit,
  };
}

/** A stable source for a tab to provide, kept pointing at its current list. */
export function useProvidedProfileFeed(origin: ProfileFeedOrigin | null): ProfileFeedSource {
  const ref = useRef<ProfileFeedSource>({ current: null });
  ref.current.current = origin;
  return ref.current;
}
