import { useEffect, useMemo, useState, useCallback } from "react";
import { web3AuthService } from "../services/web3auth.service";
import STREAM_CONTROLLER_ABI from "../config/abis/stream-controller.json";
import STREAMNFT_ABI from "../config/abis/erc1155.json";
import ERC20_ABI from "../config/abis/erc20.json";
import { useAuth } from "../context/AuthContext";
import {
  STREAM_CONTROLLER_CONTRACT_ADDRESSES,
  STREAM_COLLECTION_CONTRACT_ADDRESSES,
} from "../config/web3.constants";
import { ethers } from "ethers";

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
  const { provider, user, chainId } = useAuth();
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

    const { signerOrProvider } = await deriveSignerOrProvider(provider, withSigner);
    const contract = new ethers.Contract(address, abi, signerOrProvider);
    return contract;
  } catch (err) {
    console.error("[buildContract] Failed to build contract", err);
    return undefined;
  }
}

/**
 * Try to derive an ethers Signer from an EIP-1193 provider. Logs detailed diagnostics on failure.
 */
async function deriveSignerOrProvider(eip1193: any, withSigner: boolean) {
  try {
    const hasRequest = typeof eip1193?.request === "function";
    if (!hasRequest) {
      console.warn("[use-web3] Provider missing request() method", { keys: Object.keys(eip1193 || {}) });
      throw new Error("Provider missing request method");
    }

    // First, get the accounts to ensure the provider is properly connected
    let accounts: string[] = [];
    try {
      accounts = await eip1193.request({ method: "eth_accounts" });
      // console.log("[use-web3] Retrieved accounts:", accounts);
    } catch (e) {
      console.warn("[use-web3] Failed to get accounts:", e);
      // Try alternative method for Web3Auth
      try {
        const privateKey = await eip1193.request({ method: "private_key" });
        if (privateKey) {
          // Derive address from private key
          const wallet = new ethers.Wallet(privateKey);
          accounts = [wallet.address];
          // console.log("[use-web3] Derived address from private key:", accounts[0]);
        }
      } catch (pkError) {
        console.warn("[use-web3] Failed to get private key:", pkError);
      }
    }

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts available from provider");
    }

    // Create the ethers provider
    const ethProvider = new ethers.providers.Web3Provider(eip1193 as any);
    
    if (!withSigner) {
      return { signerOrProvider: ethProvider };
    }

    // Get signer and verify it has an address
    const signer = ethProvider.getSigner();
    
    try {
      // Force the address to be the first account we retrieved
      const signerWithAddress = signer.connect(ethProvider);
      
      // Verify we can get the address
      const addr = await signerWithAddress.getAddress();
      // console.log("[use-web3] Signer verified with address:", addr);
      
      return { signerOrProvider: signerWithAddress };
    } catch (addressError) {
      console.warn("[use-web3] Signer address verification failed:", addressError);
      
      // Fallback: create signer directly from private key
      try {
        const privateKey = await eip1193.request({ method: "private_key" });
        if (privateKey) {
          const directSigner = new ethers.Wallet(privateKey, ethProvider);
          // console.log("[use-web3] Created direct signer with address:", directSigner.address);
          return { signerOrProvider: directSigner };
        }
      } catch (pkError) {
        console.error("[use-web3] Failed to create direct signer:", pkError);
      }
      
      throw addressError;
    }
    
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

// Utility for allowance check and approve via web3AuthService provider level
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
    const tx = await tokenContract.approve(spender, amountWei);
    await tx.wait?.(1);
    return true;
  } catch (e) {
    console.warn("[ensureAllowance]", e);
    return false;
  }
}
