import { ethers } from "ethers";
import { applyGasMargin } from "../libs/web3.util";
import { writeContractAA } from "../libs/aa.write";

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
