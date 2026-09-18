import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '../components/ScreenHeader';
import { useAuthActions, useProvider, useUser } from '../context/AuthContext';
import { ChainId } from '../config/constants';
import { DEX_CHAINS, detectDhbChain, mintSell, quoteSell, verifyPosition, withdrawSell, type DexChainId, type VerifiedPosition, type IndexedPosition } from '../libs/dex-v4';
import { getSigningProvider } from '../libs/provider.registry';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { toastError, toastSuccess } from '../libs';
import { supabase } from '../services/supabase';

const PAGE_SIZE = 20;

export default function DexScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const user = useUser();
  const { chainId: connectedChain } = useProvider();
  const { switchChain } = useAuthActions();
  const address = user?.walletAddress || user?.address || '';
  const [chainId, setChainId] = useState<DexChainId | null>(null);
  const [balance, setBalance] = useState('0');
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('0.001');
  const [maxPrice, setMaxPrice] = useState('0.0011');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [listings, setListings] = useState<VerifiedPosition[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const hasMoreThanOnePage = total > PAGE_SIZE;

  useEffect(() => {
    if (!address) return;
    let active = true;
    detectDhbChain(address).then((choice) => {
      if (active) { setChainId(choice.chainId); setBalance(choice.balance); }
    }).catch((error) => toastError(error instanceof Error ? error.message : String(error)));
    return () => { active = false; };
  }, [address]);

  const loadListings = useCallback(async () => {
    const { data, count, error } = await supabase.from('dex_sell_positions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    setListError(!!error);
    if (!error) {
      const checked = await Promise.all(((data || []) as IndexedPosition[]).map(verifyPosition));
      setListings(checked.filter((item): item is VerifiedPosition => item !== null));
      setTotal(count || 0);
    }
  }, [page]);

  useEffect(() => { void loadListings(); }, [loadListings]);

  async function create() {
    if (!address || !chainId) { toastError(t('dex.connectDhb')); return; }
    if (Number(amount) <= 0 || Number(amount) > Number(balance)) {
      toastError(t('dex.checkAmount')); return;
    }
    const input = { walletAddress: address, chainId, amount, minPrice, maxPrice };
    setBusy(true);
    try {
      if (!review) {
        await quoteSell(input);
        setReview(true);
        return;
      }
      if (connectedChain !== chainId) await switchChain(chainId);
      const provider = getSigningProvider();
      if (!provider) throw new Error('Unlock your wallet to create the position');
      const minted = await mintSell(input, provider);
      const { error } = await withWalletHeader(supabase.from('dex_sell_positions').insert({
        chain_id: chainId, token_id: minted.tokenId, owner_address: address,
        mint_tx_hash: minted.txHash, dhb_amount: Number(amount),
        min_usdc_per_dhb: Number(minPrice), max_usdc_per_dhb: Number(maxPrice),
      }), address);
      if (error) throw new Error(`Position minted but listing registration failed: ${error.message}`);
      toastSuccess(t('dex.created'));
      setAmount(''); setReview(false); setPage(0);
      await loadListings();
    } catch (error) {
      toastError(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function withdraw(item: VerifiedPosition) {
    if (!address) return;
    setWithdrawing(item.token_id);
    try {
      if (connectedChain !== item.chain_id) await switchChain(item.chain_id);
      const provider = getSigningProvider();
      if (!provider) throw new Error('Unlock your wallet to withdraw');
      await withdrawSell(item, address, provider);
      toastSuccess(t('dex.withdrawn'));
      await loadListings();
    } catch (error) {
      toastError(error instanceof Error ? error.message : String(error));
    } finally { setWithdrawing(null); }
  }

  const field = (label: string, value: string, setValue: (value: string) => void) => (
    <View className="mb-4">
      <Text className="text-theme-neutrals-300 mb-2">{label}</Text>
      <TextInput value={value} keyboardType="decimal-pad" onChangeText={(next) => { setValue(next); setReview(false); }}
        className="rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 px-4 py-3 text-white" />
    </View>
  );

  return <View className="flex-1 bg-theme-neutrals-950">
    <ScreenHeader title={t('dex.title')} onBackPress={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
      <Text className="text-2xl font-semibold text-white">{t('dex.heading')}</Text>
      <Text className="mt-2 mb-6 text-theme-neutrals-400">{t('dex.intro')}</Text>
      <View className="rounded-2xl border border-theme-neutrals-700 p-5 mb-8">
        <Text className="text-lg font-semibold text-white mb-5">{t('dex.newPosition')}</Text>
        {field(t('dex.amount'), amount, setAmount)}
        {field(t('dex.minimum'), minPrice, setMinPrice)}
        {field(t('dex.maximum'), maxPrice, setMaxPrice)}
        <Text className="text-theme-neutrals-400 mb-3">{chainId ? t('dex.balance', { chain: DEX_CHAINS[chainId].name, amount: Number(balance).toLocaleString() }) : t('dex.noBalance')}</Text>
        {review && <Text className="text-white mb-4">{t('dex.reviewDetail', { amount, chain: chainId ? DEX_CHAINS[chainId].name : '', minPrice, maxPrice })}</Text>}
        <TouchableOpacity disabled={busy || !chainId} onPress={() => void create()} className="rounded-xl bg-white px-5 py-3 items-center disabled:opacity-40">
          {busy ? <ActivityIndicator color="#111" /> : <Text className="font-semibold text-black">{review ? t('dex.approve') : t('dex.review')}</Text>}
        </TouchableOpacity>
      </View>
      <Text className="text-xl font-semibold text-white mb-3">{t('dex.allListings')} · {total}</Text>
      {listError && <Text className="text-red-300 mb-3">{t('dex.listError')}</Text>}
      {!listError && listings.length === 0 && <Text className="text-theme-neutrals-400 mb-3">{t('dex.noListings')}</Text>}
      {listings.map((item) => <View key={`${item.chain_id}:${item.token_id}`} className="rounded-xl border border-theme-neutrals-700 p-4 mb-3">
        <Text className="text-white font-semibold">DHB / USDC · {item.chain_id === ChainId.BASE_MAINNET ? 'Base' : 'BNB Chain'} · {item.status}</Text>
        <Text className="text-theme-neutrals-300 mt-2">{Number(item.dhb_amount).toLocaleString()} DHB · ${item.minPrice.toFixed(6)}–${item.maxPrice.toFixed(6)} per DHB</Text>
        <Text className="text-theme-neutrals-500 mt-1">Position #{item.token_id} · {item.owner_address.slice(0, 6)}…{item.owner_address.slice(-4)}</Text>
        {address.toLowerCase() === item.owner.toLowerCase() && <TouchableOpacity disabled={!!withdrawing} onPress={() => void withdraw(item)} className="mt-3 rounded-lg border border-theme-neutrals-600 px-3 py-2">
          <Text className="text-white">{withdrawing === item.token_id ? t('dex.withdrawing') : item.status === 'Filled' ? t('dex.withdrawUsdc') : t('dex.withdrawPosition')}</Text>
        </TouchableOpacity>}
      </View>)}
      {hasMoreThanOnePage && <View className="flex-row justify-between mt-4">
        <TouchableOpacity disabled={page === 0} onPress={() => setPage(page - 1)}><Text className="text-white">{t('dex.previous')}</Text></TouchableOpacity>
        <Text className="text-theme-neutrals-400">{page + 1} / {Math.ceil(total / PAGE_SIZE)}</Text>
        <TouchableOpacity disabled={(page + 1) * PAGE_SIZE >= total} onPress={() => setPage(page + 1)}><Text className="text-white">{t('dex.next')}</Text></TouchableOpacity>
      </View>}
    </ScrollView>
  </View>;
}
