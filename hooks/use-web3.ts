import { useEffect, useMemo, useState, useCallback } from 'react';
import { web3AuthService } from '../services/web3auth.service';
import STREAM_CONTROLLER_ABI from '../config/abis/stream-controller.json';
import STREAMNFT_ABI from '../config/abis/erc1155.json';
import ERC20_ABI from '../config/abis/erc20.json';
import { useAuth } from '../context/AuthContext';
import { STREAM_CONTROLLER_CONTRACT_ADDRESSES, STREAM_COLLECTION_CONTRACT_ADDRESSES } from '../config/web3.constants';

// Minimal ERC20 ABI subset required for allowance/approve/balance
const ERC20_MIN_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

// Generic contract factory using ethers if available
async function loadEthers() { return await import('ethers'); }

export interface Web3State {
  account?: string;
  chainId?: number;
  provider?: any; // EIP-1193
}

export function useWeb3Provider(): Web3State {
  const { provider, user, chainId } = useAuth();
  return { provider, account: user?.walletAddress || user?.address, chainId };
}

interface ContractParams { address?: string; abi: any; withSigner?: boolean; }

async function buildContract(provider: any, abi: any, address?: string, withSigner = true) {
  if (!provider || !address) return undefined;
  const ethers = await loadEthers();
  const ethProvider = new ethers.providers.Web3Provider(provider as any);
  const signerOrProvider = withSigner ? ethProvider.getSigner() : ethProvider;
  return new ethers.Contract(address, abi, signerOrProvider);
}

function useEthersContract({ address, abi, withSigner = true }: ContractParams) {
  const { provider } = useWeb3Provider();
  // Not exposing generic yet to avoid misuse; dedicated hooks below
  return null;
}

export function useERC20Contract(tokenAddress?: string) {
  const { provider } = useWeb3Provider();
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || !tokenAddress) { setContract(undefined); return; }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(provider, ERC20_ABI, tokenAddress, true);
        if (!stale) setContract(c);
      } catch (e) { console.warn('[useERC20Contract]', e); }
    })();
    return () => { stale = true; };
  }, [provider, tokenAddress]);
  return contract;
}

export function useStreamControllerContract() {
  const { provider, chainId } = useWeb3Provider();
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || !chainId) { setContract(undefined); return; }
    const address = STREAM_CONTROLLER_CONTRACT_ADDRESSES[chainId];
    if (!address) { setContract(undefined); return; }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(provider, STREAM_CONTROLLER_ABI, address, true);
        if (!stale) setContract(c);
      } catch (e) { console.warn('[useStreamControllerContract]', e); }
    })();
    return () => { stale = true; };
  }, [provider, chainId]);
  return contract;
}

export function useStreamCollectionContract() {
  const { provider, chainId } = useWeb3Provider();
  const [contract, setContract] = useState<any>();
  useEffect(() => {
    if (!provider || !chainId) { setContract(undefined); return; }
    const address = STREAM_COLLECTION_CONTRACT_ADDRESSES[chainId];
    if (!address) { setContract(undefined); return; }
    let stale = false;
    (async () => {
      try {
        const c = await buildContract(provider, STREAMNFT_ABI, address, true);
        if (!stale) setContract(c);
      } catch (e) { console.warn('[useStreamCollectionContract]', e); }
    })();
    return () => { stale = true; };
  }, [provider, chainId]);
  return contract;
}

// Utility for allowance check and approve via web3AuthService provider level
export async function ensureAllowance(tokenContract: any, owner: string, spender: string, amountWei: string) {
  const ethers = await loadEthers();
  if (!tokenContract || !owner || !spender) return false;
  try {
    const allowance: any = await tokenContract.allowance(owner, spender);
    if (ethers.BigNumber.from(allowance).gte(ethers.BigNumber.from(amountWei))) return true;
    const tx = await tokenContract.approve(spender, amountWei);
    await tx.wait?.(1);
    return true;
  } catch (e) {
    console.warn('[ensureAllowance]', e);
    return false;
  }
}
