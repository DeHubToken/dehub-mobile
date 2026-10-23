/**
 * Gated video playback
 * ====================
 * A pay-per-view, hold-gated or subscriber-only post's video is stored
 * private, so the CDN URL built from its token id is refused. Once the viewer
 * is through the gate, the player asks the API for a short-lived signed URL
 * and plays that instead. Open posts never call this.
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './api.client';
import { isHoldGated } from './content-gate';

export interface VideoAccess {
  url: string;
  /** False when the post is open and `url` is the plain CDN file. */
  private: boolean;
  /** When a signed `url` stops working; null for a CDN URL. */
  expiresAt: string | null;
}

/** Fetch a fresh URL this long before the signed one lapses. */
const EXPIRY_MARGIN_MS = 10 * 60 * 1000;

/**
 * Whether the post's file is gated at all, before the viewer's own unlock
 * state. The same test the gated audio player uses.
 */
export function videoNeedsAccess(post: { streamInfo?: any; plansDetails?: unknown[] | null }): boolean {
  const info = post?.streamInfo || {};
  return !!info.isPayPerView
    || isHoldGated(info.isLockContent, info.lockAmount ?? info.lockContentAmount)
    || !!post?.plansDetails?.length;
}

export function fetchVideoAccess(tokenId: string | number): Promise<VideoAccess> {
  return apiClient.get<VideoAccess>(`/nfts/video/${encodeURIComponent(String(tokenId))}/access`, { isAuthRequired: true });
}

/** True once a signed URL is close enough to lapsing that a failure is probably the signature. */
export function isVideoAccessExpiring(access: VideoAccess | null | undefined, now = Date.now()): boolean {
  return !!access?.expiresAt && Date.parse(access.expiresAt) - now < EXPIRY_MARGIN_MS;
}

export function useVideoAccess(tokenId: string | number | null | undefined, enabled: boolean, viewerKey?: string | null) {
  return useQuery({
    queryKey: ['video-access', String(tokenId ?? ''), viewerKey || 'anonymous'],
    queryFn: () => fetchVideoAccess(tokenId!),
    enabled: enabled && tokenId != null && tokenId !== '',
    // Fresh until shortly before the signature lapses: a remount reuses it,
    // and a screen left open picks up a new one.
    staleTime: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      return expiresAt ? Math.max(0, Date.parse(expiresAt) - Date.now() - EXPIRY_MARGIN_MS) : Infinity;
    },
    gcTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
