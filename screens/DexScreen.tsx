import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '../components/ScreenHeader';
import { useAuthActions, useProvider, useUser } from '../context/AuthContext';
import { ChainId } from '../config/constants';
import { DEX_CHAINS, detectDhbChain, detectUsdcChain, mintSell, quoteSell, verifyPosition, withdrawSell, type DexChainId, type VerifiedPosition, type IndexedPosition } from '../libs/dex-v4';
import { aggregateBook, type BookLevel } from '../libs/dex-orderbook';
import { getSigningProvider } from '../libs/provider.registry';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { toastError, toastSuccess } from '../libs';
import { supabase } from '../services/supabase';

const PAGE_SIZE = 20;

function DepthChart({ bids, asks }: { bids: BookLevel[]; asks: BookLevel[] }) {
  const all = [...bids, ...asks];
  if (!all.length) return null;
  const min = Math.min(...all.map((level) => level.price));
  const max = Math.max(...all.map((level) => level.price));
  const span = Math.max(max - min, min * 0.02, 0.00000001);
  const depth = Math.max(...all.map((level) => level.cumulativeDhb), 1);
  const points = (levels: BookLevel[]) => [...levels].sort((a, b) => a.price - b.price)
    .map((level) => `${((level.price - min) / span) * 600},${170 - (level.cumulativeDhb / depth) * 150}`).join(' ');
  return <View><Svg width="100%" height={180} viewBox="0 0 600 180"><Line x1="0" y1="170" x2="600" y2="170" stroke="#52525b" />
    {!!bids.length && <Polyline points={points(bids)} fill="none" stroke="#4ade80" strokeWidth="3" />}
    {!!asks.length && <Polyline points={points(asks)} fill="none" stroke="#f87171" strokeWidth="3" />}
  </Svg><View className="flex-row justify-between"><Text className="text-theme-neutrals-400">${min.toFixed(6)}</Text><Text className="text-theme-neutrals-400">${max.toFixed(6)}</Text></View></View>;
}

export default function DexScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const user = useUser();
  const { chainId: connectedChain } = useProvider();
  const { switchChain } = useAuthActions();
  const address = user?.walletAddress || user?.address || '';
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [marketChain, setMarketChain] = useState<DexChainId>(ChainId.BASE_MAINNET);
  const [chainId, setChainId] = useState<DexChainId | null>(null);
  const [balance, setBalance] = useState('0');
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('0.001');
  const [maxPrice, setMaxPrice] = useState('0.0011');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [listings, setListings] = useState<VerifiedPosition[]>([]);
  const [page, setPage] = useState(0);
  const [listError, setListError] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const marketListings = useMemo(() => listings.filter((item) => item.chain_id === marketChain), [listings, marketChain]);
  const { bids, asks } = useMemo(() => aggregateBook(marketListings), [marketListings]);
  const visibleListings = useMemo(() => marketListings.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [marketListings, page]);
  const hasMoreThanOnePage = marketListings.length > PAGE_SIZE;

  useEffect(() => {
    if (!address) return;
    let active = true;
    (side === 'sell' ? detectDhbChain : detectUsdcChain)(address).then((choice) => {
      if (active) { setChainId(choice.chainId); setBalance(choice.balance); }
    }).catch((error) => toastError(error instanceof Error ? error.message : String(error)));
    return () => { active = false; };
  }, [address, side]);

  const loadListings = useCallback(async () => {
    try {
      const rows: IndexedPosition[] = [];
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await supabase.from('dex_sell_positions').select('*')
          .order('created_at', { ascending: false }).range(offset, offset + 199);
        if (error) throw error;
        rows.push(...(data || []) as IndexedPosition[]);
        if (!data || data.length < 200) break;
      }
      const checked: VerifiedPosition[] = [];
      for (let offset = 0; offset < rows.length; offset += 20) {
        const batch = await Promise.all(rows.slice(offset, offset + 20).map(verifyPosition));
        checked.push(...batch.filter((item): item is VerifiedPosition => item !== null));
      }
      setListings(checked); setListError(false);
    } catch { setListError(true); }
  }, []);

  useEffect(() => { void loadListings(); }, [loadListings]);

  async function create() {
    if (!address || !chainId) { toastError(t('dex.connectToken', { token: side === 'buy' ? 'USDC' : 'DHB' })); return; }
    if (Number(amount) <= 0 || Number(amount) > Number(balance)) {
      toastError(t('dex.checkAmount')); return;
    }
    const input = { walletAddress: address, chainId, side, amount, minPrice, maxPrice };
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
        mint_tx_hash: minted.txHash, side,
        dhb_amount: side === 'sell' ? Number(amount) : null,
        usdc_amount: side === 'buy' ? Number(amount) : null,
        min_usdc_per_dhb: Number(minPrice), max_usdc_per_dhb: Number(maxPrice),
      }), address);
      if (error) throw new Error(`Position minted but listing registration failed: ${error.message}`);
      toastSuccess(t('dex.created'));
      setAmount(''); setReview(false); setPage(0); setMarketChain(chainId);
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
      <View className="flex-row mb-5 gap-3">{([ChainId.BASE_MAINNET, ChainId.BSC_MAINNET] as DexChainId[]).map((id) =>
        <TouchableOpacity key={id} onPress={() => { setMarketChain(id); setPage(0); }} className={`rounded-lg px-4 py-2 ${marketChain === id ? 'bg-white' : 'border border-theme-neutrals-700'}`}>
          <Text className={marketChain === id ? 'text-black' : 'text-white'}>{DEX_CHAINS[id].name}</Text>
        </TouchableOpacity>)}</View>
      <View className="rounded-2xl border border-theme-neutrals-700 p-5 mb-5">
        <Text className="text-lg font-semibold text-white mb-3">{t('dex.marketDepth')}</Text>
        <DepthChart bids={bids} asks={asks} />
        {!bids.length && !asks.length && <Text className="text-theme-neutrals-400">{t('dex.noDepth')}</Text>}
        <View className="flex-row justify-between mt-3"><Text style={{ color: '#4ade80' }}>{t('dex.bids')} · {bids.at(-1)?.cumulativeDhb.toLocaleString() || 0} DHB</Text><Text style={{ color: '#f87171' }}>{t('dex.asks')} · {asks.at(-1)?.cumulativeDhb.toLocaleString() || 0} DHB</Text></View>
      </View>
      <View className="rounded-2xl border border-theme-neutrals-700 p-5 mb-5">
        <Text className="text-lg font-semibold text-white mb-3">{t('dex.orderBook')}</Text>
        {([{ name: 'dex.bids', levels: bids, color: '#4ade80' }, { name: 'dex.asks', levels: asks, color: '#f87171' }] as const).map((book) =>
          <View key={book.name} className="mb-4"><Text className="font-semibold mb-2" style={{ color: book.color }}>{t(book.name)}</Text>
            <View className="flex-row justify-between"><Text className="text-theme-neutrals-500">{t('dex.price')}</Text><Text className="text-theme-neutrals-500">DHB</Text><Text className="text-theme-neutrals-500">{t('dex.totalDhb')}</Text></View>
            {book.levels.length === 0 && <Text className="text-theme-neutrals-400 mt-2">{t('dex.noOrders')}</Text>}
            {book.levels.map((level) => <View key={level.price} className="flex-row justify-between py-2"><Text style={{ color: book.color }}>${level.price.toFixed(6)}</Text><Text className="text-white">{level.dhb.toLocaleString()}</Text><Text className="text-white">{level.cumulativeDhb.toLocaleString()}</Text></View>)}
          </View>)}
      </View>
      <View className="rounded-2xl border border-theme-neutrals-700 p-5 mb-8">
        <Text className="text-lg font-semibold text-white mb-5">{t('dex.newPosition')}</Text>
        <View className="flex-row gap-2 mb-4">{(['buy', 'sell'] as const).map((value) => <TouchableOpacity key={value} onPress={() => { setSide(value); setReview(false); setAmount(''); setMinPrice(value === 'buy' ? '0.0009' : '0.001'); setMaxPrice(value === 'buy' ? '0.001' : '0.0011'); }} className={`flex-1 items-center rounded-lg py-2 ${side === value ? value === 'buy' ? 'bg-green-500' : 'bg-red-500' : 'bg-theme-neutrals-800'}`}><Text className={side === value ? 'text-black font-semibold' : 'text-white'}>{t(value === 'buy' ? 'dex.buy' : 'dex.sell')}</Text></TouchableOpacity>)}</View>
        {field(t('dex.amountToken', { token: side === 'buy' ? 'USDC' : 'DHB' }), amount, setAmount)}
        {field(t('dex.minimum'), minPrice, setMinPrice)}
        {field(t('dex.maximum'), maxPrice, setMaxPrice)}
        <Text className="text-theme-neutrals-400 mb-3">{chainId ? t('dex.balanceToken', { chain: DEX_CHAINS[chainId].name, amount: Number(balance).toLocaleString(), token: side === 'buy' ? 'USDC' : 'DHB' }) : t('dex.noBalanceToken', { token: side === 'buy' ? 'USDC' : 'DHB' })}</Text>
        <Text className="text-theme-neutrals-400 mb-3">{t(side === 'buy' ? 'dex.buyExplanation' : 'dex.sellExplanation')}</Text>
        <Text className="text-theme-neutrals-400 mb-3">{t('dex.feeNote')}</Text>
        {review && <Text className="text-white mb-4">{t('dex.reviewToken', { amount, token: side === 'buy' ? 'USDC' : 'DHB', chain: chainId ? DEX_CHAINS[chainId].name : '', minPrice, maxPrice })}</Text>}
        <TouchableOpacity disabled={busy || !chainId} onPress={() => void create()} className="rounded-xl bg-white px-5 py-3 items-center disabled:opacity-40">
          {busy ? <ActivityIndicator color="#111" /> : <Text className="font-semibold text-black">{review ? t('dex.approve') : t('dex.review')}</Text>}
        </TouchableOpacity>
      </View>
      <Text className="text-xl font-semibold text-white mb-3">{t('dex.allListings')} · {marketListings.length}</Text>
      {listError && <Text className="text-red-300 mb-3">{t('dex.listError')}</Text>}
      {!listError && marketListings.length === 0 && <Text className="text-theme-neutrals-400 mb-3">{t('dex.noListings')}</Text>}
      {visibleListings.map((item) => <View key={`${item.chain_id}:${item.token_id}`} className="rounded-xl border border-theme-neutrals-700 p-4 mb-3">
        <Text className="text-white font-semibold">{t(item.side === 'buy' ? 'dex.buy' : 'dex.sell')} · DHB / USDC · {item.status}</Text>
        <Text className="text-theme-neutrals-300 mt-2">{item.amountDhb.toLocaleString()} DHB · {item.amountUsdc.toLocaleString()} USDC · ${item.minPrice.toFixed(6)}–${item.maxPrice.toFixed(6)} per DHB</Text>
        <Text className="text-theme-neutrals-500 mt-1">Position #{item.token_id} · {item.owner_address.slice(0, 6)}…{item.owner_address.slice(-4)}</Text>
        {address.toLowerCase() === item.owner.toLowerCase() && <TouchableOpacity disabled={!!withdrawing} onPress={() => void withdraw(item)} className="mt-3 rounded-lg border border-theme-neutrals-600 px-3 py-2">
          <Text className="text-white">{withdrawing === item.token_id ? t('dex.withdrawing') : t('dex.withdrawPosition')}</Text>
        </TouchableOpacity>}
      </View>)}
      {hasMoreThanOnePage && <View className="flex-row justify-between mt-4">
        <TouchableOpacity disabled={page === 0} onPress={() => setPage(page - 1)}><Text className="text-white">{t('dex.previous')}</Text></TouchableOpacity>
        <Text className="text-theme-neutrals-400">{page + 1} / {Math.ceil(marketListings.length / PAGE_SIZE)}</Text>
        <TouchableOpacity disabled={(page + 1) * PAGE_SIZE >= marketListings.length} onPress={() => setPage(page + 1)}><Text className="text-white">{t('dex.next')}</Text></TouchableOpacity>
      </View>}
    </ScrollView>
  </View>;
}
