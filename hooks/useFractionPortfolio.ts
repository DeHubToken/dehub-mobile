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
import { buildImageUrl } from "../libs/misc";
import { STREAM_COLLECTION_CONTRACT_ADDRESSES } from "../config/web3.constants";
import { DEFAULT_FRACTION_CHAIN, TOTAL_FRACTIONS, useFractionWallet } from "./useFractionMarket";

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
}

type Candidate = Omit<PortfolioPosition, "balance" | "percentage">;

const BALANCE_ABI = ["function balanceOf(address account, uint256 id) view returns (uint256)"];

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

/** Read balances a few at a time — sixty positions should not open sixty sockets. */
async function resolveBalances(candidates: Candidate[], address: string): Promise<PortfolioPosition[]> {
  const positions: PortfolioPosition[] = [];
  const BATCH = 8;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const balances = await Promise.all(
      batch.map((c) => readFractionBalance(address, c.tokenId, c.chainId)),
    );
    batch.forEach((c, idx) => {
      const balance = balances[idx];
      if (!balance || balance <= 0) return;
      positions.push({ ...c, balance, percentage: (balance / TOTAL_FRACTIONS) * 100 });
    });
  }
  return positions.sort((a, b) => b.balance - a.balance);
}

export function useFractionPortfolio(address: string | null | undefined) {
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
              imageUrl: buildImageUrl(post.tokenId, post.imageUrl, 200) || null,
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
    enabled: !!key,
    // One eth_call per position per refresh, so this is deliberately long; the
    // sell sheet reads the single-token balance, which is the one that must be
    // fresh.
    staleTime: 2 * 60_000,
  });
}
