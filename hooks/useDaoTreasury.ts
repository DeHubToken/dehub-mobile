/**
 * DAO treasury on native: the same on-chain read as web, plus a contribute
 * action that signs one DHB transfer to the treasury.
 *
 * Same deliberate difference from web as `useJobPayment`: web picks Base or
 * BNB by balance and switches chain; this app has no chain-switch path in its
 * provider, so it pays on whichever of the two is connected and says so when
 * it is neither.
 */

import { useCallback, useEffect, useState } from 'react';
import * as ethersImport from 'ethers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWeb3Provider, useERC20Contract } from './use-web3';
import { writeContractAA } from '../libs/aa.write';
import { DHB_ADDRESSESS } from '../config/constants';
import {
  fetchDaoTreasury,
  DAO_TREASURY_ADDRESS,
  DAO_CONTRIBUTION_CHAINS,
  DAO_CHAIN_META,
} from '../libs/dao-treasury';

export const DAO_TREASURY_QUERY_KEY = ['dao-treasury'] as const;

export function useDaoTreasury() {
  return useQuery({
    queryKey: DAO_TREASURY_QUERY_KEY,
    queryFn: fetchDaoTreasury,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export interface DaoContributeState {
  /** DHB held on the connected chain, or 0 while unknown. */
  walletDhb: number;
  chainName: string | null;
  /** Null when the connected chain is one contributions are counted on. */
  unsupportedChain: string | null;
  isPending: boolean;
  contribute: (amountDhb: number) => Promise<{ txHash: string; chainId: number }>;
  refreshBalance: () => void;
}

export function useContributeToDao(enabled: boolean): DaoContributeState {
  const { account, chainId } = useWeb3Provider();
  const dhbAddress = chainId ? DHB_ADDRESSESS[chainId] : undefined;
  const tokenContract = useERC20Contract(dhbAddress);
  const queryClient = useQueryClient();
  const [walletDhb, setWalletDhb] = useState(0);

  const supported = !!chainId && DAO_CONTRIBUTION_CHAINS.includes(chainId);
  const chainName = chainId ? DAO_CHAIN_META[chainId]?.name ?? null : null;
  const unsupportedChain = supported ? null : 'Base or BNB';

  const refreshBalance = useCallback(async () => {
    if (!tokenContract || !account || !supported || !enabled) {
      setWalletDhb(0);
      return;
    }
    try {
      const raw = await tokenContract.balanceOf(account);
      const ethers = (ethersImport as any).ethers || ethersImport;
      setWalletDhb(Number(ethers.utils.formatUnits(raw, 18)));
    } catch {
      setWalletDhb(0);
    }
  }, [tokenContract, account, supported, enabled]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const mutation = useMutation({
    mutationFn: async (amountDhb: number) => {
      if (!supported || !chainId) throw new Error(`Switch to Base or BNB to contribute.`);
      if (!tokenContract || !account) throw new Error('Connect your wallet to contribute.');
      const amount = Math.floor(amountDhb);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nothing to send.');
      if (walletDhb > 0 && amount > walletDhb) {
        throw new Error(`Not enough DHB. You hold ${Math.floor(walletDhb).toLocaleString()}.`);
      }
      const ethers = (ethersImport as any).ethers || ethersImport;
      const amountWei = ethers.utils.parseUnits(String(amount), 18);
      const tx = await writeContractAA(tokenContract, 'transfer', [DAO_TREASURY_ADDRESS, amountWei], {
        context: 'DAO contribution',
      });
      // wait() resolves with status 0 for a REVERTED transaction rather than
      // throwing, so ignoring the receipt would report a failed transfer as sent.
      const receipt = await tx.wait(1);
      if (receipt?.status !== 1) throw new Error('The transfer did not go through. Nothing was sent.');
      return { txHash: String(receipt.transactionHash || tx.hash), chainId };
    },
    onSuccess: () => {
      refreshBalance();
      queryClient.invalidateQueries({ queryKey: DAO_TREASURY_QUERY_KEY });
      // The log index trails the head by a block or two.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: DAO_TREASURY_QUERY_KEY }), 8_000);
    },
  });

  return {
    walletDhb,
    chainName,
    unsupportedChain,
    isPending: mutation.isPending,
    contribute: mutation.mutateAsync,
    refreshBalance,
  };
}
