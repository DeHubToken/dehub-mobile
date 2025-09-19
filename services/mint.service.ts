import { ethers } from "ethers";
import { applyGasMargin } from "../libs/web3.util";

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

  // Try to estimate gas and bump; fallback to a safe upper bound
  let gasLimit: any;
  try {
    const est = await controllerContract.estimateGas.mintWithBounty(
      createdTokenId,
      timestamp,
      v,
      r,
      s,
      path,
      amountBN,
      countOfViewers,
      countOfCommentor,
      bountyToken.address
    );
    gasLimit = applyGasMargin(est);
  } catch {
    gasLimit = ethers.utils.hexlify(3_000_000);
  }

  // Bump gas price slightly if provider supports it
  let txOpts: Record<string, any> = { gasLimit };
  try {
    const provider = controllerContract.signer?.provider || controllerContract.provider;
    const gp = await provider.getGasPrice();
    txOpts.gasPrice = gp.mul(110).div(100);
  } catch {}

  const tx = await controllerContract.mintWithBounty(
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
    txOpts
  );
  return tx;
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

  // Optional gas price bump
  let gasPrice: any;
  try {
    const provider = streamCollectionContract.signer?.provider || streamCollectionContract.provider;
    const gp = await provider.getGasPrice();
    gasPrice = gp.mul(110).div(100);
  } catch {}

  let gasLimit: any;
  try {
    const est = await streamCollectionContract.estimateGas.mint(
      createdTokenId,
      timestamp,
      v,
      r,
      s,
      [],
      1000,
      path
    );
    gasLimit = applyGasMargin(est);
  } catch {}

  const tx = await streamCollectionContract.mint(
    createdTokenId,
    timestamp,
    v,
    r,
    s,
    [],
    1000,
    path,
    {
      ...(gasLimit ? { gasLimit } : {}),
      ...(gasPrice ? { gasPrice } : {}),
    }
  );
  return tx;
}
