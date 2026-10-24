import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useState } from "react";
import { getContractsForMint } from "../libs/contract.factory";
import { createAuthAdapter } from "../services/auth/authAdapter";
import { getMintFee, mintExistingPost, getNFT } from "../services/nft.service";
import { mintNftOnChainWithFee, mintWithBounty, isShortOfMintFee } from "../services/mint.service";
import { supportedTokens } from "../config/constants";
import { getAuthMethod } from "../libs/auth.utils";
import { toastError, toastSuccess } from "../libs/toast";

/**
 * Put a post that was published off-chain onto the chain.
 *
 * The post already has its token id, so this is the same two steps as posting
 * — signature, then contract call — minus the upload. The fee rides in the
 * same user operation as the mint, exactly as it does in the upload queue.
 */
export function useMintExistingPost() {
  const { t: _copy } = _useCopy();
  const [isMinting, setIsMinting] = useState(false);

  const mint = useCallback(
    async (tokenId: number, chainId: number): Promise<boolean> => {
      if (isMinting) return false;
      setIsMinting(true);
      try {
        const post = (await getNFT(tokenId)).result as any;
        chainId = Number(post.chainId || chainId);
        const info = post.streamInfo;
        const hasBounty = !!info?.isAddBounty;
        const amount = Number(info?.addBountyAmount);
        const viewers = Number(info?.addBountyFirstXViewers ?? 0);
        const commenters = Number(info?.addBountyFirstXComments ?? 0);
        const bountyToken = supportedTokens.find(t => t.chainId === chainId && t.symbol === info?.addBountyTokenSymbol);
        if (hasBounty && (!bountyToken || !(amount > 0) || !Number.isFinite(amount) ||
          !Number.isInteger(viewers) || viewers < 0 || !Number.isInteger(commenters) || commenters < 0 || viewers + commenters === 0)) {
          throw new Error(_copy("copy.038a8e5ff421", { defaultValue: "Invalid bounty terms. Funding cannot be skipped." }));
        }
        // Only sponsored sessions are charged, so only they price it.
        const { method } = await getAuthMethod().catch(() => ({ method: null as null }));
        const fee = !hasBounty && method === "local" ? await getMintFee(chainId) : null;

        // Checked before the signature is issued, so being short of DHB is a
        // clear message rather than a reverted transaction.
        if (fee?.chargeable && fee.amount > 0 && !fee.isNative) {
          if (await isShortOfMintFee(fee, chainId)) {
            toastError(_copy("copy.d30dc251d1dc", { defaultValue: "Minting costs {{value1}} {{value2}} — top up and try again.", value1: fee.amount, value2: fee.symbol }));
            return false;
          }
        }

        const sig = await mintExistingPost(tokenId);
        const timestamp = (sig as any)?.timestamp;
        const v = (sig as any)?.v;
        const r = (sig as any)?.r;
        const s = (sig as any)?.s;
        if (timestamp == null || v == null || !r || !s) {
          throw new Error(_copy("copy.7e94ef2e9800", { defaultValue: "Mint signature payload missing from server response" }));
        }

        const { collectionContract, controllerContract } = await getContractsForMint(chainId);
        const provider = await createAuthAdapter().getProvider();

        const tx = hasBounty ? await mintWithBounty(
          controllerContract, Number((sig as any).createdTokenId ?? tokenId), timestamp, v, r, s,
          bountyToken!, amount, viewers, commenters, (sig as any)?.uri,
        ) : await mintNftOnChainWithFee(
          collectionContract,
          provider,
          Number((sig as any).createdTokenId ?? tokenId),
          timestamp,
          v,
          r,
          s,
          fee,
          (sig as any)?.uri,
        );
        await tx?.wait?.(1);

        toastSuccess(_copy("copy.4ae79158e4cd", { defaultValue: "Post minted" }));
        return true;
      } catch (e: any) {
        console.error("[useMintExistingPost] failed", e);
        toastError(e?.message || _copy("copy.af3e311c0946", { defaultValue: "Could not mint this post" }));
        return false;
      } finally {
        setIsMinting(false);
      }
    },
    [isMinting, _copy],
  );

  return { mint, isMinting };
}
