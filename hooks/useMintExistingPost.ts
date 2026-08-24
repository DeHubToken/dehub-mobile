import { useCallback, useState } from "react";
import { getContractsForMint } from "../libs/contract.factory";
import { createAuthAdapter } from "../services/auth/authAdapter";
import { getMintFee, mintExistingPost } from "../services/nft.service";
import { mintNftOnChainWithFee, isShortOfMintFee } from "../services/mint.service";
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
  const [isMinting, setIsMinting] = useState(false);

  const mint = useCallback(
    async (tokenId: number, chainId: number): Promise<boolean> => {
      if (isMinting) return false;
      setIsMinting(true);
      try {
        // Only sponsored sessions are charged, so only they price it.
        const { method } = await getAuthMethod().catch(() => ({ method: null as null }));
        const fee = method === "local" ? await getMintFee(chainId) : null;

        // Checked before the signature is issued, so being short of DHB is a
        // clear message rather than a reverted transaction.
        if (fee?.chargeable && fee.amount > 0 && !fee.isNative) {
          if (await isShortOfMintFee(fee, chainId)) {
            toastError(`Minting costs ${fee.amount} ${fee.symbol} — top up and try again.`);
            return false;
          }
        }

        const sig = await mintExistingPost(tokenId);
        const timestamp = (sig as any)?.timestamp;
        const v = (sig as any)?.v;
        const r = (sig as any)?.r;
        const s = (sig as any)?.s;
        if (timestamp == null || v == null || !r || !s) {
          throw new Error("Mint signature payload missing from server response");
        }

        const { collectionContract } = await getContractsForMint(chainId);
        const provider = await createAuthAdapter().getProvider();

        const tx = await mintNftOnChainWithFee(
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

        toastSuccess("Post minted");
        return true;
      } catch (e: any) {
        console.error("[useMintExistingPost] failed", e);
        toastError(e?.message || "Could not mint this post");
        return false;
      } finally {
        setIsMinting(false);
      }
    },
    [isMinting],
  );

  return { mint, isMinting };
}
