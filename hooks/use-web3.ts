import i18n from "i18next";
import { useEffect, useMemo, useState, useCallback } from "react";
import STREAM_CONTROLLER_ABI from "../config/abis/stream-controller.json";
import STREAMNFT_ABI from "../config/abis/erc1155.json";
import ERC20_ABI from "../config/abis/erc20.json";
import SUBSCRIPTION_ABI from "../config/abis/subscription.json";
import { useUser, useProvider } from "../context/AuthContext";
import {
  STREAM_CONTROLLER_CONTRACT_ADDRESSES,
  STREAM_COLLECTION_CONTRACT_ADDRESSES,
  SUBSCRIPTION_CONTRACT_ADDRESSES,
} from "../config/web3.constants";
import { ChainId } from "../config/constants";
import { SWAP_ROUTER_ABI, UNISWAP_SWAP_ROUTER } from "../services/swap.service";
import { PAYMENT_ROUTER_ABI } from "../services/payment-router.service";
import { ethers } from "ethers";
import { getAuthMethod } from "../libs/auth.utils";
import { writeContractAA } from "../libs/aa.write";

// Generic contract factory using ethers if available
async function loadEthers() {
  return await import("ethers");
}

export interface Web3State {
  account?: string;
  chainId?: number;
  provider?: any; // EIP-1193
}

export function useWeb3Provider(): Web3State {
  const user = useUser();
  const { provider, chainId } = useProvider();
  return { provider, account: user?.walletAddress || user?.address, chainId };
}

interface ContractParams {
  address?: string;
  abi: any;
  withSigner?: boolean;
}

async function buildContract(
  provider: any,
  abi: any,
  address?: string,
  withSigner = true
) {
  try {
    if (!provider) throw new Error("Provider is missing");
    if (!address || typeof address !== "string")
      throw new Error(`Invalid contract address: ${address}`);
    if (!abi) throw new Error("ABI is missing");

    const { signerOrProvider } = await deriveSignerOrProvider(
      provider,
      withSigner
    );

    if (signerOrProvider._isSigner) {
      try {
        const signerAddy = await signerOrProvider.getAddress();
        const signerChainId= await signerOrProvider.getChainId?.();
        // console.log("[buildContract] Signer validation params", {signerAddy, signerChainId, signerOrProvider: signerOrProvider.provider?.writeContract});
      } catch (e) {
        console.warn("[buildContract] Signer validation failed, retrying", e);
        const { signerOrProvider: newSigner } = await deriveSignerOrProvider(
          provider,
          withSigner
        );
        return new ethers.Contract(address, abi, newSigner);
      }
    }
    const contract = new ethers.Contract(address, abi, signerOrProvider);
    return contract;
  } catch (err) {
    console.error("[buildContract] Failed to build contract", err);
    return undefined;
  }
}

/**
 * Try to derive an ethers Signer the "former" simple way first (Web3Provider + getSigner()),
 * only falling back to provider-specific/local logic if that fails. Verbose logs at each step.
 */
async function deriveSignerOrProvider(eip1193: any, withSigner: boolean) {
  const logPrefix = "[use-web3][derive]";
  try {
    // Check persisted auth method (used by the local-provider fallback below)
    let authMethod: 'local' | null = null;
    try {
      const { method } = await getAuthMethod();
      authMethod = method;
    } catch {}

    // Fast-path: if we were given an ethers Signer or Provider directly, just return it
    if ((eip1193 as any)?._isSigner) {
      console.log(`${logPrefix} detected ethers Signer; returning as-is`);
      return { signerOrProvider: eip1193 };
    }
    if ((eip1193 as any)?._isProvider) {
      if (!withSigner) return { signerOrProvider: eip1193 };
      // If a signer was requested but only a provider was provided, proceed with normal flow below
    }

    if (typeof eip1193.getSigner === "function") {
      console.log(`${logPrefix} detected getSigner-capable provider; returning signer`);
      const signer = eip1193.getSigner();
      return { signerOrProvider: signer };
    }

    const hasRequest = typeof eip1193?.request === "function";
    console.log(`${logPrefix} start`, {
      hasRequest,
      providerKeys: Object.keys(eip1193 || {}),
      withSigner,
    });

    if (!eip1193) throw new Error("Missing EIP-1193 provider instance");

    const ethProvider = new ethers.providers.Web3Provider(
      eip1193 as any,
      "any"
    );
    console.log(`${logPrefix} created Web3Provider`);
    if (!withSigner) {
      console.log(`${logPrefix} returning provider only (withSigner=false)`);
      return { signerOrProvider: ethProvider };
    }

    // Attempt A: Former/simple path — use default getSigner()
    try {
      const signerA = ethProvider.getSigner();
      const addrA = await signerA.getAddress();
      console.log(`${logPrefix} getSigner() success`, {
        signerA,
        address: addrA,
      });
      return { signerOrProvider: signerA };
    } catch (eA) {
      console.warn(`${logPrefix} getSigner() failed`, eA);
    }

    // Attempt B: Query eth_accounts then bind signer to first account
    let accounts: string[] = [];
    if (hasRequest) {
      try {
        const res = await eip1193.request({ method: "eth_accounts" });
        if (Array.isArray(res)) accounts = res as string[];
        console.log(`${logPrefix} eth_accounts`, {
          count: accounts.length,
          first: accounts[0],
        });
      } catch (eB1) {
        console.warn(`${logPrefix} eth_accounts failed`, eB1);
      }
    } else {
      console.warn(
        `${logPrefix} provider has no request(); skipping eth_accounts`
      );
    }

    if (accounts.length > 0) {
      try {
        const signerB = ethProvider.getSigner(accounts[0]);
        const addrB = await signerB.getAddress();
        console.log(`${logPrefix} getSigner(account[0]) success`, {
          address: addrB,
        });
        return { signerOrProvider: signerB };
      } catch (eB2) {
        console.warn(`${logPrefix} getSigner(account[0]) failed`, eB2);
      }
    } else {
      console.warn(`${logPrefix} no accounts from eth_accounts`);
    }

    // Attempt C: Some providers require explicit authorization
    if (hasRequest) {
      try {
        const req = await eip1193.request({ method: "eth_requestAccounts" });
        const reqAccounts = Array.isArray(req) ? (req as string[]) : [];
        console.log(`${logPrefix} eth_requestAccounts`, {
          count: reqAccounts.length,
          first: reqAccounts[0],
        });
        if (reqAccounts.length > 0) {
          try {
            const signerC = ethProvider.getSigner(reqAccounts[0]);
            const addrC = await signerC.getAddress();
            console.log(`${logPrefix} getSigner(requested[0]) success`, {
              address: addrC,
            });
            return { signerOrProvider: signerC };
          } catch (eC2) {
            console.warn(`${logPrefix} getSigner(requested[0]) failed`, eC2);
          }
        }
      } catch (eC1) {
        console.warn(`${logPrefix} eth_requestAccounts failed`, eC1);
      }
    }

    // Attempt D (local-provider specific): request private key and construct a Wallet signer
    if (hasRequest && authMethod === 'local') {
      try {
        const privateKey = await eip1193.request({ method: "private_key" });
        if (privateKey) {
          const signerD = new ethers.Wallet(privateKey, ethProvider);
          const addrD = await signerD.getAddress();
          console.log(`${logPrefix} local fallback via private_key success`, {
            address: addrD,
          });
          return { signerOrProvider: signerD };
        } else {
          console.warn(`${logPrefix} private_key returned empty value`);
        }
      } catch (eD) {
        console.warn(`${logPrefix} private_key fallback failed`, eD);
      }
    }

    // Out of options — throw with context
    const error = new Error(
      "Unable to derive signer: default getSigner + accounts + requestAccounts + local fallback all failed"
    );
    console.error(`${logPrefix} final failure`, error);
    throw error;
  } catch (e) {
    console.error("[use-web3] Failed to derive signer from provider", {
      hasRequest: typeof eip1193?.request === "function",
      providerKeys: Object.keys(eip1193 || {}),
      error: (e as any)?.message || String(e),
    });
    throw e;
  }
}

function useEthersContract({
  address,
  abi,
  withSigner = true,
}: ContractParams) {
  const { provider } = useWeb3Provider();
  // Not exposing generic yet to avoid misuse; dedicated hooks below
  return null;
}

export function useERC20Contract(tokenAddress?: string) {
  const { provider } = useWeb3Provider();
  // console.log({provider})
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || !tokenAddress) {
      setContract(undefined);
      return;
    }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(provider, ERC20_ABI, tokenAddress, true);
        if (!stale) setContract(c);
      } catch (e) {
        console.warn("[useERC20Contract]", e);
      }
    })();
    return () => {
      stale = true;
    };
  }, [provider, tokenAddress]);
  return contract;
}

export function useStreamControllerContract() {
  const { provider, chainId } = useWeb3Provider();
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || !chainId) {
      setContract(undefined);
      return;
    }
    const address = STREAM_CONTROLLER_CONTRACT_ADDRESSES[chainId];
    if (!address) {
      setContract(undefined);
      return;
    }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(
          provider,
          STREAM_CONTROLLER_ABI,
          address,
          true
        );
        if (!stale) setContract(c);
      } catch (e) {
        console.warn("[useStreamControllerContract]", e);
      }
    })();
    return () => {
      stale = true;
    };
  }, [provider, chainId]);
  return contract;
}

export function useStreamCollectionContract() {
  const { provider, chainId } = useWeb3Provider();
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || !chainId) {
      setContract(undefined);
      return;
    }
    const address = STREAM_COLLECTION_CONTRACT_ADDRESSES[chainId];
    if (!address) {
      setContract(undefined);
      return;
    }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(provider, STREAMNFT_ABI, address, true);
        if (!stale) setContract(c);
      } catch (e) {
        console.warn("[useStreamCollectionContract]", e);
      }
    })();
    return () => {
      stale = true;
    };
  }, [provider, chainId]);
  return contract;
}

/**
 * Creator subscription contract for the connected chain.
 *
 * Undefined on a chain where it is not deployed, which the plan card reads as
 * "not buyable here" rather than offering a button that reverts.
 */
export function useSubscriptionContract() {
  const { provider, chainId } = useWeb3Provider();
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || !chainId) {
      setContract(undefined);
      return;
    }
    const address = SUBSCRIPTION_CONTRACT_ADDRESSES[chainId];
    if (!address) {
      setContract(undefined);
      return;
    }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(provider, SUBSCRIPTION_ABI, address, true);
        if (!stale) setContract(c);
      } catch (e) {
        console.warn("[useSubscriptionContract]", e);
      }
    })();
    return () => {
      stale = true;
    };
  }, [provider, chainId]);
  return contract;
}

// Uniswap V3 SwapRouter (Base) — used for ETH→DHB auto-swap on PPV unlock (#44)
export function useSwapRouterContract() {
  const { provider, chainId } = useWeb3Provider();
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || chainId !== ChainId.BASE_MAINNET) {
      setContract(undefined);
      return;
    }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(provider, SWAP_ROUTER_ABI, UNISWAP_SWAP_ROUTER, true);
        if (!stale) setContract(c);
      } catch (e) {
        console.warn("[useSwapRouterContract]", e);
      }
    })();
    return () => {
      stale = true;
    };
  }, [provider, chainId]);
  return contract;
}

// DeHubPaymentRouter — atomic ETH→DHB swap + PPV + tip in one tx (#45).
// Address is dynamic (from GET /config/payments) and only deployed on Base.
export function usePaymentRouterContract(routerAddress?: string) {
  const { provider, chainId } = useWeb3Provider();
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || !routerAddress || chainId !== ChainId.BASE_MAINNET) {
      setContract(undefined);
      return;
    }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(provider, PAYMENT_ROUTER_ABI, routerAddress, true);
        if (!stale) setContract(c);
      } catch (e) {
        console.warn("[usePaymentRouterContract]", e);
      }
    })();
    return () => {
      stale = true;
    };
  }, [provider, chainId, routerAddress]);
  return contract;
}

/**
 * Get a wallet ready to have DHB pulled out of it by a contract.
 *
 * Every STF revert this app has produced came from skipping one of these three
 * steps. STF is TransferHelper's safeTransferFrom failure — the contract asked
 * for tokens and the allowance or the balance was short — and it surfaces as a
 * simulation revert at the bundler, a long way from the cause.
 *
 * 1. The owner is the address that will SIGN, read off the contract's own
 *    signer. It used to be the address on the cached user record. Those are
 *    normally the same, but an identity that signed in while the smart-account
 *    provider was unavailable is registered as the raw EOA while every write
 *    afterwards comes from the Safe — so we were reading one wallet's
 *    allowance and spending from another's.
 *
 * 2. The balance is read from the chain, every time, and refused here. The tip
 *    sheet used to gate on `user.tokenBalances.DHB`: a number fetched once per
 *    session, stored under a single key with no chain dimension, persisted to
 *    disk, and never reduced when the wallet spends. Someone who had just paid
 *    for a post was still shown the figure from before they paid, and every
 *    retry failed identically because nothing about it changed until the app
 *    was relaunched.
 *
 * 3. The approval is for the maximum and is awaited. Approving the exact
 *    amount leaves nothing for a fee on top, and returning before the approval
 *    is mined lets the transfer race it.
 *
 * Returns the signing address so callers can use the same one downstream.
 */
export async function prepareDhbSpend(
  tokenContract: any,
  spender: string,
  amountWei: any,
): Promise<string> {
  const ethers = await loadEthers();
  if (!tokenContract || !spender) {
    throw new Error(i18n.t("wallet.notReady"));
  }

  const amount = ethers.BigNumber.from(amountWei);

  const owner: string | undefined = await tokenContract.signer?.getAddress?.();
  if (!owner) throw new Error(i18n.t("wallet.notReady"));

  const balance = await tokenContract.balanceOf(owner);
  if (ethers.BigNumber.from(balance).lt(amount)) {
    throw new Error(i18n.t("wallet.insufficientBalance", { symbol: "DHB" }));
  }

  const allowance = await tokenContract.allowance(owner, spender);
  if (ethers.BigNumber.from(allowance).lt(amount)) {
    const approval = await writeContractAA(
      tokenContract,
      "approve",
      [spender, ethers.constants.MaxUint256],
      { context: "approve" },
    );
    // Wait for it. The AA provider usually waits internally, but the plain-EOA
    // fallback returns at broadcast, and that is the path where the transfer
    // can outrun its own approval.
    await approval?.wait?.(1);
  }

  return owner;
}

// Utility for allowance check and approve via the AA-aware write path
export async function ensureAllowance(
  tokenContract: any,
  owner: string,
  spender: string,
  amountWei: string
) {
  const ethers = await loadEthers();
  if (!tokenContract || !owner || !spender) return false;
  try {
    const allowance: any = await tokenContract.allowance(owner, spender);
    if (ethers.BigNumber.from(allowance).gte(ethers.BigNumber.from(amountWei)))
      return true;
    await writeContractAA(tokenContract, "approve", [spender, amountWei], { context: "approve" });
    return true;
  } catch (e) {
    console.warn("[ensureAllowance]", e);
    return false;
  }
}
