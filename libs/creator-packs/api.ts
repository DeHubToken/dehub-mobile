/**
 * Creator packs — emoji, sticker and GIF packs people publish and share.
 * The mobile twin of dehubweb's src/lib/creator-packs/api.ts.
 *
 * Reads go straight to the tables (public SELECT). Every write to a pack goes
 * through the `creator-packs` edge function, which checks the caller's badge
 * tier and its limits on the server; the numbers in ./limits are only for
 * showing. Saving someone else's pack into your picker is open to anyone
 * signed in and goes through RLS on `saved_creator_packs`, with the
 * x-wallet-address header telling RLS who is saving.
 *
 * Emoji packs store their items in `custom_emojis` (one global `:shortcode:`
 * namespace, so a name means the same image in every message). Sticker and
 * GIF packs store theirs in `creator_pack_items`.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { supabase } from '../../services/supabase';
import { dehubAuthHeaders } from '../../services/ai.service';
import { withWalletHeader } from '../supabase-wallet-client';
import { contentTypeForExtension, fileExtension, uploadLocalFileToBucket } from '../storage-upload';
import { loadCustomEmojis, mergeCustomEmojis, type CustomEmoji } from '../emoji/custom-emoji';
import type { PackKind, PackLimits } from './limits';

export type { PackKind, PackLimits } from './limits';

export interface CreatorPack {
  id: string;
  kind: PackKind;
  name: string;
  slug: string;
  owner: string;
  cover_url: string | null;
  item_count: number;
  save_count: number;
  created_at: string;
}

export interface PackItem {
  id: string;
  pack_id: string;
  image_url: string;
  animated: boolean;
  /** Emoji packs: the `:shortcode:` the image answers to. */
  shortcode?: string;
  /** Sticker packs: the emoji the sticker stands for, Telegram-style. */
  emoji?: string | null;
}

export interface PackStatus {
  tier: string | null;
  limits: PackLimits;
  usage: Record<PackKind, number>;
}

export interface NewPackItem {
  imageUrl: string;
  animated: boolean;
  shortcode?: string;
  emoji?: string;
}

/** What expo-image-picker hands back, trimmed to what an upload needs. */
export interface PickedPackImage {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

const PACK_COLS = 'id, kind, name, slug, owner, cover_url, item_count, save_count, created_at';

export const PACK_UPLOAD_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];
export const MAX_PACK_UPLOAD_BYTES: Record<PackKind, number> = {
  emoji: 2 * 1024 * 1024,
  sticker: 2 * 1024 * 1024,
  gif: 8 * 1024 * 1024,
};

export class PackError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

async function callPacks<T>(wallet: string, action: string, body: Record<string, unknown> = {}): Promise<T> {
  const headers = await dehubAuthHeaders(wallet);
  if (!headers['x-dehub-token']) throw new PackError('Not signed in', 'AUTH');
  const { data, error } = await supabase.functions.invoke('creator-packs', {
    body: { action, ...body },
    headers,
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    let detail: { error?: string; code?: string } | undefined;
    try {
      detail = await context?.json();
    } catch {
      // Not JSON — fall back to the transport message.
    }
    throw new PackError(detail?.error || error.message || 'Request failed', detail?.code);
  }
  if ((data as { error?: string } | null)?.error) {
    throw new PackError((data as { error: string }).error, (data as { code?: string }).code);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Writes (server-checked)

export const getPackStatus = (wallet: string) => callPacks<PackStatus>(wallet, 'status');

export async function createPack(wallet: string, kind: PackKind, name: string): Promise<CreatorPack> {
  return (await callPacks<{ pack: CreatorPack }>(wallet, 'create_pack', { kind, name })).pack;
}

export async function renamePack(wallet: string, packId: string, name: string): Promise<CreatorPack> {
  return (await callPacks<{ pack: CreatorPack }>(wallet, 'rename_pack', { packId, name })).pack;
}

export async function deletePack(wallet: string, packId: string): Promise<void> {
  await callPacks(wallet, 'delete_pack', { packId });
  void loadCustomEmojis(true);
}

export async function addPackItems(
  wallet: string,
  packId: string,
  items: NewPackItem[],
  source?: string,
): Promise<{ added: number; skipped: number }> {
  const res = await callPacks<{ added: Array<Record<string, unknown>>; skipped: number }>(wallet, 'add_items', {
    packId,
    items,
    source,
  });
  const emoji = res.added.filter((r) => typeof r.shortcode === 'string') as unknown as CustomEmoji[];
  if (emoji.length) mergeCustomEmojis(emoji);
  return { added: res.added.length, skipped: res.skipped };
}

export async function removePackItem(wallet: string, packId: string, itemId: string): Promise<void> {
  await callPacks(wallet, 'remove_item', { packId, itemId });
  void loadCustomEmojis(true);
}

export function packImageType(image: PickedPackImage): string {
  const ext = fileExtension(image, '');
  return (image.mimeType || contentTypeForExtension(ext, '')).toLowerCase();
}

/** Throws a PackError with FILE_TYPE / FILE_SIZE when the image cannot go in a `kind` pack. */
export function checkPackImage(image: PickedPackImage, kind: PackKind): void {
  if (!PACK_UPLOAD_TYPES.includes(packImageType(image))) throw new PackError('unsupported_type', 'FILE_TYPE');
  if (image.fileSize != null && image.fileSize > MAX_PACK_UPLOAD_BYTES[kind]) throw new PackError('too_large', 'FILE_SIZE');
}

export async function uploadPackImage(image: PickedPackImage, wallet: string, kind: PackKind): Promise<string> {
  checkPackImage(image, kind);
  const type = packImageType(image);
  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  return uploadLocalFileToBucket({
    bucket: 'community-media',
    path: `creator-packs/${wallet.toLowerCase()}/${Crypto.randomUUID()}.${ext}`,
    uri: image.uri,
    contentType: type,
  });
}

// ---------------------------------------------------------------------------
// Reads

export async function fetchPackBySlug(slug: string): Promise<CreatorPack | null> {
  const { data } = await supabase
    .from('creator_packs' as never)
    .select(PACK_COLS)
    .eq('slug', slug.toLowerCase())
    .maybeSingle();
  return (data as unknown as CreatorPack) ?? null;
}

export async function fetchOwnedPacks(wallet: string): Promise<CreatorPack[]> {
  const { data, error } = await supabase
    .from('creator_packs' as never)
    .select(PACK_COLS)
    .eq('owner', wallet.toLowerCase())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CreatorPack[];
}

export async function fetchSavedPacks(wallet: string): Promise<CreatorPack[]> {
  const { data, error } = await withWalletHeader(
    supabase
      .from('saved_creator_packs' as never)
      .select(`created_at, pack:creator_packs(${PACK_COLS})`)
      .eq('wallet', wallet.toLowerCase())
      .order('created_at', { ascending: true }),
    wallet,
  );
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ pack: CreatorPack | null }>)
    .map((r) => r.pack)
    .filter((p): p is CreatorPack => !!p);
}

export async function fetchPopularPacks(kind: PackKind): Promise<CreatorPack[]> {
  const { data, error } = await supabase
    .from('creator_packs' as never)
    .select(PACK_COLS)
    .eq('kind', kind)
    .gt('item_count', 0)
    .order('save_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []) as unknown as CreatorPack[];
}

/** Items for several packs at once, grouped by pack, in pack order. */
export async function fetchPackItems(packs: Pick<CreatorPack, 'id' | 'kind'>[]): Promise<Record<string, PackItem[]>> {
  const out: Record<string, PackItem[]> = {};
  const emojiIds = packs.filter((p) => p.kind === 'emoji').map((p) => p.id);
  const otherIds = packs.filter((p) => p.kind !== 'emoji').map((p) => p.id);
  const [emoji, other] = await Promise.all([
    emojiIds.length
      ? supabase
          .from('custom_emojis' as never)
          .select('id, pack_id, image_url, animated, shortcode')
          .in('pack_id', emojiIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    otherIds.length
      ? supabase
          .from('creator_pack_items' as never)
          .select('id, pack_id, image_url, animated, emoji')
          .in('pack_id', otherIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  for (const row of [...((emoji.data ?? []) as PackItem[]), ...((other.data ?? []) as PackItem[])]) {
    (out[row.pack_id] ??= []).push(row);
  }
  return out;
}

export async function savePack(wallet: string, packId: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase
      .from('saved_creator_packs' as never)
      .insert({ wallet: wallet.toLowerCase(), pack_id: packId } as never),
    wallet,
  );
  if (error && error.code !== '23505') throw error;
}

export async function unsavePack(wallet: string, packId: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase
      .from('saved_creator_packs' as never)
      .delete()
      .eq('wallet', wallet.toLowerCase())
      .eq('pack_id', packId),
    wallet,
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Hooks

export const packKeys = {
  status: (wallet?: string | null) => ['creator-packs', 'status', wallet ?? ''] as const,
  owned: (wallet?: string | null) => ['creator-packs', 'owned', wallet ?? ''] as const,
  saved: (wallet?: string | null) => ['creator-packs', 'saved', wallet ?? ''] as const,
  popular: (kind: PackKind) => ['creator-packs', 'popular', kind] as const,
  slug: (slug?: string) => ['creator-packs', 'slug', slug ?? ''] as const,
  items: (ids: string[]) => ['creator-packs', 'items', ids.join(',')] as const,
};

export function usePackStatus(wallet?: string | null) {
  return useQuery({
    queryKey: packKeys.status(wallet),
    queryFn: () => getPackStatus(wallet!),
    enabled: !!wallet,
    staleTime: 60_000,
    retry: false,
  });
}

export function useOwnedPacks(wallet?: string | null) {
  return useQuery({
    queryKey: packKeys.owned(wallet),
    queryFn: () => fetchOwnedPacks(wallet!),
    enabled: !!wallet,
    staleTime: 30_000,
  });
}

export function useSavedPacks(wallet?: string | null) {
  return useQuery({
    queryKey: packKeys.saved(wallet),
    queryFn: () => fetchSavedPacks(wallet!),
    enabled: !!wallet,
    staleTime: 30_000,
  });
}

export function usePopularPacks(kind: PackKind) {
  return useQuery({
    queryKey: packKeys.popular(kind),
    queryFn: () => fetchPopularPacks(kind),
    staleTime: 60_000,
  });
}

export function usePackBySlug(slug?: string) {
  return useQuery({
    queryKey: packKeys.slug(slug),
    queryFn: () => fetchPackBySlug(slug!),
    enabled: !!slug,
  });
}

export function usePackItems(packs: Pick<CreatorPack, 'id' | 'kind'>[] | undefined) {
  const ids = (packs ?? []).map((p) => p.id);
  return useQuery({
    queryKey: packKeys.items(ids),
    queryFn: () => fetchPackItems(packs ?? []),
    enabled: ids.length > 0,
    staleTime: 30_000,
  });
}

/** Your own packs of one kind first, then the ones you saved, deduplicated. */
export function usePickerPacks(wallet: string | null | undefined, kind: PackKind) {
  const owned = useOwnedPacks(wallet);
  const saved = useSavedPacks(wallet);
  const seen = new Set<string>();
  const packs = [...(owned.data ?? []), ...(saved.data ?? [])].filter(
    (p) => p.kind === kind && p.item_count > 0 && !seen.has(p.id) && !!seen.add(p.id),
  );
  const items = usePackItems(packs);
  return {
    packs,
    items: items.data ?? {},
    loading: (!!wallet && (owned.isLoading || saved.isLoading)) || (packs.length > 0 && items.isLoading),
  };
}

export function useInvalidatePacks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['creator-packs'] });
}
