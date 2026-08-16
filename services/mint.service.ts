import { ethers } from "ethers";
import { applyGasMargin } from "../libs/web3.util";
import { writeContractAA, writeBatchAA } from "../libs/aa.write";

export type MinimalToken = {
  address: string;
  symbol?: string;
  decimals?: number;
};

export function toBigAmount(amount: string | number, token?: MinimalToken) {
  const dec = token?.decimals ?? 18;
  const val = String(amount ?? 0);
  return ethers.utils.parseUnits(val, dec);
}

export async function mintWithBounty(
  controllerContract: any,
  createdTokenId: number,
  timestamp: number,
  v: number,
  r: string,
  s: string,
  bountyToken: MinimalToken,
  bountyAmount: string | number,
  countOfViewers: number,
  countOfCommentor: number
) {
  if (!controllerContract) throw new Error("Controller contract unavailable");
  const amountBN = toBigAmount(bountyAmount, bountyToken);
  const path = `/${createdTokenId}.json`;
  // Use AA-aware writer; return shim with wait() for caller compatibility
  const res = await writeContractAA(
    controllerContract,
    "mintWithBounty",
    [
      createdTokenId,
      timestamp,
      v,
      r,
      s,
      path,
      amountBN,
      countOfViewers,
      countOfCommentor,
      bountyToken.address,
    ],
    { context: "send" }
  );
  return res as any;
}

export async function mintNftOnChain(
  streamCollectionContract: any,
  createdTokenId: number,
  timestamp: number,
  v: number,
  r: string,
  s: string
) {
  if (!streamCollectionContract) throw new Error("Collection contract unavailable");
  const path = `${createdTokenId}.json`;
  const res = await writeContractAA(
    streamCollectionContract,
    "mint",
    [createdTokenId, timestamp, v, r, s, [], 1000, path],
    { context: "send" }
  );
  return res as any;
}

/** What minting costs, as quoted by GET /mint_fee. */
export type MintFeeQuote = {
  amount: number;
  symbol: string;
  tokenAddress: string;
  recipient?: string;
  chargeable: boolean;
  decimals: number;
  isNative: boolean;
};

const ERC20_TRANSFER_IFACE = new ethers.utils.Interface([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

/**
 * Mint, and pay the mint fee, in a single sponsored transaction.
 *
 * Falls back to the ordinary unbatched mint whenever there is nothing to
 * charge, or the session cannot batch. Losing the fee always beats losing the
 * post, so no path here refuses to mint.
 */
export async function mintNftOnChainWithFee(
  streamCollectionContract: any,
  provider: any,
  createdTokenId: number,
  timestamp: number,
  v: number,
  r: string,
  s: string,
  fee: MintFeeQuote | null,
) {
  const collectable = !!fee && fee.chargeable && !!fee.recipient && fee.amount > 0;
  if (!collectable) {
    return mintNftOnChain(streamCollectionContract, createdTokenId, timestamp, v, r, s);
  }
  if (!streamCollectionContract) throw new Error("Collection contract unavailable");

  const amountBN = ethers.utils.parseUnits(fee!.amount.toFixed(fee!.decimals), fee!.decimals);
  const path = `${createdTokenId}.json`;
  const mintData = streamCollectionContract.interface.encodeFunctionData("mint", [
    createdTokenId,
    timestamp,
    v,
    r,
    s,
    [],
    1000,
    path,
  ]);

  const feeCall = fee!.isNative
    ? { to: fee!.recipient!, data: "0x" as `0x${string}`, value: amountBN }
    : {
        to: fee!.tokenAddress,
        data: ERC20_TRANSFER_IFACE.encodeFunctionData("transfer", [
          fee!.recipient,
          amountBN,
        ]) as `0x${string}`,
      };

  try {
    const res = await writeBatchAA(
      provider,
      [feeCall, { to: streamCollectionContract.address, data: mintData as `0x${string}` }],
      { context: "send" },
    );
    // Shaped like writeContractAA's result so callers can await wait() either way.
    return { hash: res.hash, wait: async () => ({ transactionHash: res.hash }) } as any;
  } catch (err: any) {
    if (err?.message === "BATCH_UNSUPPORTED") {
      // A session with no bundler is not a failed mint — send it unbatched and
      // forgo the fee rather than blocking the creator.
      return mintNftOnChain(streamCollectionContract, createdTokenId, timestamp, v, r, s);
    }
    throw err;
  }
}
