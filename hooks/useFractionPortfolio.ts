/**
 * Fraction portfolio
 * ==================
 * Every post a wallet holds fractions of, with the live on-chain balance for
 * each. Native port of web's `use-fraction-portfolio.ts`.
 *
 * Nothing indexes "which token ids does this wallet hold" — the collection is
 * ERC-1155 and nothing enumerates a holder's positions — so the candidate set
 * is assembled from the places a position can come from: posts you uploaded
 * (you were minted all 1000), and posts traded or listed from this address.
 * One balanceOf per candidate gives the real number, and zeroes drop out.
 *
 * This replaced the profile tab's old arithmetic over trade rows, which summed
 * bought minus sold and so showed a creator none of the 1000 they were minted,
 * and kept showing a position after the fractions had moved on-chain.
 */

import { ethers } from "ethers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { ethersService } from "../services/ethers.service";
import { getMyPosts } from "../services/user.service";
import { getNFTs } from "../services/nft.service";
import { fractionImageFor } from "../libs/fractionThumb";
import { STREAM_COLLECTION_CONTRACT_ADDRESSES } from "../config/web3.constants";
import { DEFAULT_FRACTION_CHAIN, TOTAL_FRACTIONS, useFractionWallet } from "./useFractionMarket";
import env from "../config/env";

export interface PortfolioPosition {
  tokenId: string;
  chainId: number;
  balance: number;
  /** Share of the upload's 1000 fractions, 0–100. */
  percentage: number;
  title: string | null;
  imageUrl: string | null;
  postType: string | null;
  /** True when this is a post you uploaded, not one you bought into. */
  isCreator: boolean;
  /**
   * The post behind these fractions was deleted. The fractions still exist
   * on-chain, so the position is kept, but every surface hides it by default.
   */
  postDeleted?: boolean;
}

/** Positions whose post still exists, which is what the portfolio shows by default. */
export function livePositions(positions: PortfolioPosition[]): PortfolioPosition[] {
  return positions.filter((p) => !p.postDeleted);
}

type Candidate = Omit<PortfolioPosition, "balance" | "percentage" | "postDeleted">;

/**
 * Flag positions whose post was deleted.
 *
 * Deleting a post does not burn its fractions, so the balance read still finds
 * them and they sat in the portfolio as tiles that open nothing. The post API
 * answers 404 for a deleted post and only that counts: any other failure leaves
 * the position showing, so an outage never hides real holdings.
 */
async function markDeletedPosts(positions: PortfolioPosition[]): Promise<void> {
  const base = env.API_URL || "https://api.dehub.io/api";
  const STEP = 8;
  for (let i = 0; i < positions.length; i += STEP) {
    await Promise.all(
      positions.slice(i, i + STEP).map(async (position) => {
        try {
          const res = await fetch(`${base}/nft_info/${encodeURIComponent(position.tokenId)}`);
          if (res.status === 404) position.postDeleted = true;
        } catch {
          // Unknown is not deleted.
        }
      }),
    );
  }
}

const BALANCE_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])",
];

/**
 * One wallet's balance of many tokens on one chain, one eth_call per 100 ids
 * (ERC-1155 balanceOfBatch). Null when the read fails.
 */
async function readFractionBalances(
  address: string,
  tokenIds: string[],
  chainId: number,
): Promise<Map<string, number> | null> {
  const collection =
    STREAM_COLLECTION_CONTRACT_ADDRESSES[chainId as keyof typeof STREAM_COLLECTION_CONTRACT_ADDRESSES];
  if (!collection || !address) return null;
  try {
    const contract = new ethers.Contract(collection, BALANCE_ABI, ethersService.getProvider(chainId));
    const out = new Map<string, number>();
    for (let i = 0; i < tokenIds.length; i += 100) {
      const ids = tokenIds.slice(i, i + 100);
      const bals: ethers.BigNumber[] = await contract.balanceOfBatch(ids.map(() => address), ids);
      ids.forEach((id, k) => out.set(id, bals[k] ? bals[k].toNumber() : 0));
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * How many fractions of `tokenId` does `address` hold right now? Null when the
 * read fails — callers treat that as "cannot confirm", never as zero.
 */
export async function readFractionBalance(
  address: string,
  tokenId: string,
  chainId: number = DEFAULT_FRACTION_CHAIN,
): Promise<number | null> {
  const collection =
    STREAM_COLLECTION_CONTRACT_ADDRESSES[chainId as keyof typeof STREAM_COLLECTION_CONTRACT_ADDRESSES];
  if (!collection || !address) return null;
  try {
    const contract = new ethers.Contract(collection, BALANCE_ABI, ethersService.getProvider(chainId));
    const bal: ethers.BigNumber = await contract.balanceOf(address, tokenId);
    return bal.toNumber();
  } catch {
    return null;
  }
}

/** Live balance for one token — the number a sell sheet has to be fresh on. */
export function useFractionBalance(tokenId: string | undefined, chainId?: number) {
  const wallet = useFractionWallet();
  return useQuery({
    queryKey: ["fraction-balance", wallet, tokenId, chainId],
    queryFn: () => readFractionBalance(wallet, tokenId!, chainId),
    enabled: !!wallet && !!tokenId,
    staleTime: 15_000,
  });
}

/**
 * One balanceOfBatch per chain reads every candidate at once, cheap enough for
 * the profile tab badge to show the real count. A chain whose batch read fails
 * falls back to one balanceOf per candidate, a few at a time.
 *
 * One failed read is skipped so a single bad token does not blank the list. If
 * every read failed, nothing here is known, and returning [] would tell a holder
 * they own nothing (and overwrite their cached holdings), so it throws instead.
 */
async function resolveBalances(candidates: Candidate[], address: string): Promise<PortfolioPosition[]> {
  const positions: PortfolioPosition[] = [];
  let failed = 0;
  const byChain = new Map<number, Candidate[]>();
  for (const c of candidates) byChain.set(c.chainId, [...(byChain.get(c.chainId) || []), c]);

  const take = (c: Candidate, balance: number | null) => {
    if (balance === null) failed += 1;
    if (!balance || balance <= 0) return;
    positions.push({ ...c, balance, percentage: (balance / TOTAL_FRACTIONS) * 100 });
  };

  for (const [chainId, list] of byChain) {
    const batch = await readFractionBalances(address, list.map((c) => c.tokenId), chainId);
    if (batch) {
      list.forEach((c) => take(c, batch.get(c.tokenId) ?? 0));
      continue;
    }
    const STEP = 8;
    for (let i = 0; i < list.length; i += STEP) {
      const slice = list.slice(i, i + STEP);
      const balances = await Promise.all(slice.map((c) => readFractionBalance(address, c.tokenId, c.chainId)));
      slice.forEach((c, idx) => take(c, balances[idx]));
    }
  }
  if (candidates.length > 0 && failed === candidates.length) {
    throw new Error("Fraction balance reads failed");
  }
  await markDeletedPosts(positions);
  return positions.sort((a, b) => b.balance - a.balance);
}

export function useFractionPortfolio(
  address: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const key = (address || "").toLowerCase();
  const wallet = useFractionWallet();
  // /myPosts is scoped to the signed-in token, so it may only contribute to
  // your OWN portfolio — reading it on someone else's profile would file your
  // uploads under their name.
  const isSelf = !!key && key === wallet;

  return useQuery({
    queryKey: ["fraction-portfolio", key, isSelf],
    queryFn: async (): Promise<PortfolioPosition[]> => {
      const candidates = new Map<string, Candidate>();

      if (isSelf) {
        try {
          const mine = await getMyPosts({ page: 0, unit: 50 });
          for (const post of (mine.result || []) as any[]) {
            if (post?.tokenId == null) continue;
            const tokenId = String(post.tokenId);
            candidates.set(tokenId, {
              tokenId,
              chainId: Number(post.chainId) || DEFAULT_FRACTION_CHAIN,
              title: post.name || post.title || null,
              imageUrl: fractionImageFor(post, 200) || null,
              postType: post.postType || null,
              isCreator: true,
            });
          }
        } catch {
          // The market half of the portfolio is still worth showing.
        }
      } else {
        // Someone else's profile: their minted uploads are positions too (a
        // creator is minted all 1000). Without this a creator who never
        // traded showed "no fractions" on their profile tab.
        try {
          const theirs = await getNFTs({ minter: key, unit: 50, sortMode: "new" });
          for (const post of (theirs.result || []) as any[]) {
            if (post?.tokenId == null || (post.status && post.status !== "minted")) continue;
            const tokenId = String(post.tokenId);
            candidates.set(tokenId, {
              tokenId,
              chainId: Number(post.chainId) || DEFAULT_FRACTION_CHAIN,
              title: post.name || post.title || null,
              imageUrl: fractionImageFor(post, 200) || null,
              postType: post.postType || null,
              isCreator: true,
            });
          }
        } catch {
          // The market half of the portfolio is still worth showing.
        }
      }

      const [trades, ownListings, listings] = await Promise.all([
        supabase
          .from("fraction_trades")
          .select("token_id, chain_id")
          .or(`seller_address.ilike.${key},buyer_address.ilike.${key}`)
          .limit(200),
        supabase.from("fraction_listings").select("token_id, chain_id").ilike("seller_address", key).limit(200),
        supabase
          .from("fraction_listings")
          .select("token_id, chain_id, post_title, post_image_url, post_type")
          .limit(200),
      ]);

      // The client returns errors rather than throwing them. With both position
      // sources down there is nothing to go on, and an empty success would read
      // as "you hold nothing". `listings` only adds titles, so it stays optional.
      if (trades.error && ownListings.error) throw trades.error;

      // Listings carry the post snapshot, so a bought-into position gets a
      // title and thumbnail without a /feed call.
      const snapshots = new Map<string, { title: string | null; imageUrl: string | null; type: string | null }>();
      for (const l of (listings.data || []) as any[]) {
        const id = String(l.token_id);
        if (!snapshots.has(id)) {
          snapshots.set(id, { title: l.post_title, imageUrl: l.post_image_url, type: l.post_type });
        }
      }

      for (const row of [...((trades.data || []) as any[]), ...((ownListings.data || []) as any[])]) {
        const tokenId = String(row.token_id);
        if (candidates.has(tokenId)) continue;
        const snap = snapshots.get(tokenId);
        candidates.set(tokenId, {
          tokenId,
          chainId: Number(row.chain_id) || DEFAULT_FRACTION_CHAIN,
          title: snap?.title || null,
          imageUrl: snap?.imageUrl || null,
          postType: snap?.type || null,
          isCreator: false,
        });
      }

      return resolveBalances(Array.from(candidates.values()), key);
    },
    enabled: !!key && options.enabled !== false,
    // Every refresh reads each position's balance, so this is deliberately long; the
    // sell sheet reads the single-token balance, which is the one that must be
    // fresh.
    staleTime: 2 * 60_000,
  });
}
