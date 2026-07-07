import * as VideoThumbnails from "expo-video-thumbnails";
import { supabase } from "./supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";

/**
 * Stories — shared Supabase `stories` table (same schema as web).
 * Stories expire 24h after creation via `expires_at`.
 */
export interface Story {
  id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  expires_at: string;
}

export interface StoryUserGroup {
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  /** Oldest-first — viewer playback order */
  stories: Story[];
  /** Newest — strip thumbnail */
  previewStory: Story;
}

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeWallet(address?: string | null): string {
  return (address || "").toLowerCase();
}

/** All active (non-expired) stories, newest first. */
export async function getActiveStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Story[]) || [];
}

/**
 * Active stories for a single wallet, oldest first (viewer order).
 */
export async function getStoriesForWallet(walletAddress?: string | null): Promise<Story[]> {
  if (!walletAddress) return [];
  const target = normalizeWallet(walletAddress);
  try {
    const all = await getActiveStories();
    return all
      .filter((s) => normalizeWallet(s.wallet_address) === target)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  } catch {
    return [];
  }
}

/** One bubble per wallet for the home/profile strip. */
export function groupStoriesByWallet(stories: Story[]): StoryUserGroup[] {
  const map = new Map<string, Story[]>();
  for (const story of stories) {
    const key = normalizeWallet(story.wallet_address);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(story);
    map.set(key, list);
  }

  const groups: StoryUserGroup[] = [];
  for (const userStories of map.values()) {
    const newestFirst = [...userStories].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const viewerOrder = [...userStories].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const head = newestFirst[0];
    groups.push({
      wallet_address: head.wallet_address,
      username: head.username,
      avatar: head.avatar,
      stories: viewerOrder,
      previewStory: head,
    });
  }

  return groups.sort(
    (a, b) =>
      new Date(b.previewStory.created_at).getTime() -
      new Date(a.previewStory.created_at).getTime(),
  );
}

/** Flat list for the viewer — grouped users, each user's stories oldest-first. */
export function flattenStoriesForViewer(stories: Story[]): Story[] {
  return groupStoriesByWallet(stories).flatMap((g) => g.stories);
}

export function getViewerStartIndex(flatStories: Story[], walletAddress: string): number {
  const target = normalizeWallet(walletAddress);
  const idx = flatStories.findIndex((s) => normalizeWallet(s.wallet_address) === target);
  return idx >= 0 ? idx : 0;
}

export async function uploadStory(params: {
  localVideoUri: string;
  walletAddress: string;
  username?: string | null;
  avatar?: string | null;
  onProgress?: (percent: number) => void;
}): Promise<Story> {
  const { localVideoUri, walletAddress, username, avatar, onProgress } = params;
  const wallet = normalizeWallet(walletAddress);
  if (!wallet) throw new Error("Wallet address required");

  const timestamp = Date.now();
  const videoFilename = `${wallet}/${timestamp}.mp4`;
  const thumbFilename = `${wallet}/${timestamp}-thumb.jpg`;

  onProgress?.(15);

  let thumbnailUrl: string | null = null;
  try {
    const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(localVideoUri, { time: 0 });
    const thumbBlob = await (await fetch(thumbUri)).blob();
    const { error: thumbError } = await supabase.storage
      .from("stories")
      .upload(thumbFilename, thumbBlob, { contentType: "image/jpeg", upsert: false });
    if (!thumbError) {
      thumbnailUrl = supabase.storage.from("stories").getPublicUrl(thumbFilename).data.publicUrl;
    }
  } catch {
    // thumbnail optional
  }

  onProgress?.(35);

  const videoBlob = await (await fetch(localVideoUri)).blob();
  const contentType = videoBlob.type?.startsWith("video/") ? videoBlob.type : "video/mp4";

  onProgress?.(55);

  const { error: videoError } = await supabase.storage
    .from("stories")
    .upload(videoFilename, videoBlob, { contentType, upsert: false });
  if (videoError) throw videoError;

  onProgress?.(80);

  const videoUrl = supabase.storage.from("stories").getPublicUrl(videoFilename).data.publicUrl;

  const { data, error: insertError } = await withWalletHeader(
    supabase
      .from("stories")
      .insert({
        wallet_address: wallet,
        username: username || null,
        avatar: avatar || null,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
      })
      .select()
      .single(),
    wallet,
  );
  if (insertError) throw insertError;

  onProgress?.(100);
  return data as Story;
}

export async function deleteStory(storyId: string, walletAddress: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase.from("stories").delete().eq("id", storyId),
    walletAddress,
  );
  if (error) throw error;
}

export function isStoryExpired(story: Story): boolean {
  return new Date(story.expires_at).getTime() <= Date.now();
}

export function storyExpiresInMs(story: Story): number {
  return Math.max(0, new Date(story.expires_at).getTime() - Date.now());
}

export const STORY_MAX_DURATION_SEC = 30;
export const STORY_TTL_HOURS = STORY_TTL_MS / (60 * 60 * 1000);
