/**
 * An upload queue belongs to the account that made it.
 *
 * The queue is persisted under a per-wallet key, but the key was swapped while
 * the store still held the previous account's jobs — and hydrate returned early
 * when the incoming account had nothing stored, leaving them there. The next
 * debounced write then filed one account's pending uploads, mint params and
 * quota charge under another account's key.
 *
 * These pin the switch itself: the outgoing queue is saved under the outgoing
 * key, and the incoming account never inherits it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UploadJob } from '../../store/upload.store';
import {
  uploadState,
  uploadActions,
  setUploadCacheKey,
  hydrateUploadStore,
} from '../../store/upload.store';

const A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const keyFor = (addr: string) => `upload-queue-v1:${addr.toLowerCase()}`;

const job = (id: string, walletAddress = A): UploadJob => ({
  id,
  status: 'queued',
  progress: 0,
  retryCount: 0,
  createdAt: 1_700_000_000_000,
  title: id,
  payload: {} as UploadJob['payload'],
  chainId: 8453,
  walletAddress,
  isBounty: false,
  isQuote: false,
});

const stored = async (addr: string) => {
  const raw = await AsyncStorage.getItem(keyFor(addr));
  return raw ? JSON.parse(raw) : null;
};

/** The store persists on an 800ms debounce; let it land. */
const settle = () => new Promise((r) => setTimeout(r, 900));

beforeEach(async () => {
  await AsyncStorage.removeItem(keyFor(A));
  await AsyncStorage.removeItem(keyFor(B));
  uploadState.jobs = [];
});

describe('switching accounts', () => {
  it("does not carry the previous account's jobs into an empty account", async () => {
    setUploadCacheKey(A);
    await hydrateUploadStore();
    uploadActions.enqueue(job('a1'));
    await settle();

    // B has never uploaded anything.
    setUploadCacheKey(B);
    await hydrateUploadStore();

    expect(uploadState.jobs).toEqual([]);
    await settle();
    const bStored = await stored(B);
    expect(bStored?.jobs ?? []).toEqual([]);
  });

  it("keeps the outgoing account's queue under its own key", async () => {
    setUploadCacheKey(A);
    await hydrateUploadStore();
    uploadActions.enqueue(job('a1'));
    await settle();

    setUploadCacheKey(B);
    await hydrateUploadStore();
    await settle();

    const aStored = await stored(A);
    expect(aStored.jobs.map((j: { id: string }) => j.id)).toEqual(['a1']);
  });

  it('gives each account back its own queue on the way back', async () => {
    setUploadCacheKey(A);
    await hydrateUploadStore();
    uploadActions.enqueue(job('a1'));
    await settle();

    setUploadCacheKey(B);
    await hydrateUploadStore();
    uploadActions.enqueue(job('b1', B));
    await settle();

    setUploadCacheKey(A);
    await hydrateUploadStore();
    expect(uploadState.jobs.map((j) => j.id)).toEqual(['a1']);

    setUploadCacheKey(B);
    await hydrateUploadStore();
    expect(uploadState.jobs.map((j) => j.id)).toEqual(['b1']);
  });

  it('flushes a pending write under the outgoing key, not the incoming one', async () => {
    setUploadCacheKey(A);
    await hydrateUploadStore();

    // Enqueue and switch immediately, inside the debounce window.
    uploadActions.enqueue(job('a-late'));
    setUploadCacheKey(B);
    await hydrateUploadStore();
    await settle();

    const aStored = await stored(A);
    expect(aStored.jobs.map((j: { id: string }) => j.id)).toEqual(['a-late']);
    const bStored = await stored(B);
    expect(bStored?.jobs ?? []).toEqual([]);
  });
});
