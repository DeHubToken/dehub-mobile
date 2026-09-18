import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ethers } from 'ethers';
import ScreenHeader from '../components/ScreenHeader';
import DexMarketChart from '../components/DexMarketChart';
import { useAuthActions, useProvider, useUser } from '../context/AuthContext';
import { ChainId } from '../config/constants';
import { DEX_CHAINS, detectDhbChain, detectUsdcChain, dexProvider, mintSell, quoteSell, recoverMint, verifyPosition, withdrawSell, type SellInput, type DexChainId, type VerifiedPosition, type IndexedPosition } from '../libs/dex-v4';
import { aggregateBook, balanceFraction, formatPrice, formatSize, type BookLevel } from '../libs/dex-orderbook';
import { fetchMarketData, type ChartPeriod, type MarketData } from '../libs/dex-market-data';
import { readWithTimeout, type OrderStage } from '../libs/dex-read-timeout';
import { getSigningProvider } from '../libs/provider.registry';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { toastError, toastSuccess } from '../libs';
import { supabase } from '../services/supabase';

const PAGE_SIZE = 15;
type Pending = { input: SellInput; txHash: string; tokenId?: string };
const storageKey = (wallet: string) => `dex-pending:${wallet.toLowerCase()}`;
const explorer = (id: number) => id === ChainId.BASE_MAINNET ? 'https://basescan.org' : 'https://bscscan.com';

export default function DexScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const user = useUser();
  const { chainId: connectedChain, authMethod } = useProvider();
  const { switchChain } = useAuthActions();
  const address = user?.walletAddress || user?.address || '';
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [tab, setTab] = useState<'chart' | 'book' | 'trade'>('chart');
  const [chainId, setChainId] = useState<DexChainId | null>(null);
  const [balance, setBalance] = useState('0');
  const [checking, setChecking] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('0.001');
  const [maxPrice, setMaxPrice] = useState('0.001001');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [stage, setStage] = useState<OrderStage | 'index'>('quote');
  const [review, setReview] = useState<Awaited<ReturnType<typeof quoteSell>> | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [formError, setFormError] = useState('');
  const [listings, setListings] = useState<VerifiedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [mine, setMine] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>('1W');
  const [market, setMarket] = useState<MarketData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [marketRevision, setMarketRevision] = useState(0);
  const [depth, setDepth] = useState(false);
  const [increment, setIncrement] = useState(.000001);
  const loadLock = useRef(false);
  const token = side === 'buy' ? 'USDC' : 'DHB';
  const locked = busy || !!pending || !!withdrawing;
  const decimals = side === 'sell' ? 18 : chainId ? DEX_CHAINS[chainId].usdcDecimals : 6;
  const { bids, asks } = useMemo(() => aggregateBook(listings, increment), [listings, increment]);
  const shown = useMemo(() => mine ? listings.filter((item) => item.owner.toLowerCase() === address.toLowerCase()) : listings, [listings, mine, address]);
  const visible = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasMorePages = shown.length > PAGE_SIZE;
  const bidTotal = bids.at(-1)?.cumulativeDhb || 0, askTotal = asks.at(-1)?.cumulativeDhb || 0;
  const spread = bids.length && asks.length ? asks[0].price - bids[0].price : null;
  const estimate = Number(amount) > 0 && Number(minPrice) > 0 && Number(maxPrice) > Number(minPrice)
    ? side === 'buy' ? Number(amount) / Math.sqrt(Number(minPrice) * Number(maxPrice)) : Number(amount) * Math.sqrt(Number(minPrice) * Number(maxPrice)) : 0;

  useEffect(() => {
    let active = true; setChainId(null); setBalance('0'); setReview(null); setBalanceError(false);
    if (!address) { setChecking(false); return; }
    setChecking(true);
    (side === 'sell' ? detectDhbChain : detectUsdcChain)(address).then((choice) => {
      if (active) { setChainId(choice.chainId); setBalance(choice.balance); }
    }).catch(() => { if (active) setBalanceError(true); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [address, side, balanceRevision]);

  useEffect(() => {
    let active = true; setPending(null);
    if (address) void AsyncStorage.getItem(storageKey(address)).then((raw) => {
      const saved = raw ? JSON.parse(raw) as Pending : null;
      if (active && saved?.input.walletAddress.toLowerCase() === address.toLowerCase() &&
          [56, 8453].includes(saved.input.chainId) && /^0x[0-9a-f]{64}$/i.test(saved.txHash)) setPending(saved);
    }).catch(() => {});
    return () => { active = false; };
  }, [address]);
  const savePending = (value: Pending | null) => {
    setPending(value); const owner = value?.input.walletAddress || address;
    if (owner) void (value ? AsyncStorage.setItem(storageKey(owner), JSON.stringify(value)) : AsyncStorage.removeItem(storageKey(owner))).catch(() => toastError(t('dex.keepOpen')));
  };

  const loadListings = useCallback(async () => {
    if (loadLock.current) return; loadLock.current = true; setLoading(true);
    try {
      const rows: IndexedPosition[] = [];
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await readWithTimeout(Promise.resolve(supabase.from('dex_sell_positions').select('*')
          .order('created_at', { ascending: false }).order('chain_id').order('token_id').range(offset, offset + 199)), 'Listing index');
        if (error) throw error; rows.push(...(data || []) as IndexedPosition[]);
        if (!data || data.length < 200) break;
      }
      const chains = [...new Set(rows.map((row) => row.chain_id as DexChainId))];
      const blocks = new Map(await Promise.all(chains.map(async (id) => [id, await readWithTimeout(dexProvider(id).getBlockNumber(), 'Network snapshot')] as const)));
      const checked: VerifiedPosition[] = [];
      for (let offset = 0; offset < rows.length; offset += 8) {
        const batch = await Promise.all(rows.slice(offset, offset + 8).map((row) => readWithTimeout(verifyPosition(row, blocks.get(row.chain_id as DexChainId)), 'Position verification')));
        checked.push(...batch.filter((item): item is VerifiedPosition => item !== null));
      }
      setListings(checked); setListError(false); setUpdated(Date.now());
    } catch { setListError(true); }
    finally { loadLock.current = false; setLoading(false); }
  }, []);
  useEffect(() => {
    if (!focused) return;
    void loadListings();
    const timer = setInterval(() => { if (AppState.currentState === 'active' && !busyRef.current) void loadListings(); }, 45000);
    return () => clearInterval(timer);
  }, [loadListings, focused]);
  useEffect(() => {
    let active = true; setChartLoading(true); setChartError(false); setMarket(null);
    fetchMarketData(period).then((data) => { if (active) setMarket(data); })
      .catch(() => { if (active) setChartError(true); }).finally(() => { if (active) setChartLoading(false); });
    return () => { active = false; };
  }, [period, marketRevision]);
  useEffect(() => { setPage((value) => Math.min(value, Math.max(0, Math.ceil(shown.length / PAGE_SIZE) - 1))); }, [shown.length]);

  function choosePrice(price: number, next = side) {
    if (locked) return; setSide(next); setReview(null); setFormError('');
    setMinPrice((next === 'buy' ? price * .999 : price).toFixed(8));
    setMaxPrice((next === 'buy' ? price : price * 1.001).toFixed(8));
  }
  async function register(saved: Pending) {
    setStage('index');
    const minted = saved.tokenId ? { tokenId: saved.tokenId, txHash: saved.txHash } : await recoverMint(saved.input, saved.txHash);
    savePending({ ...saved, ...minted }); const input = saved.input;
    const { error } = await readWithTimeout(Promise.resolve(withWalletHeader(supabase.from('dex_sell_positions').upsert({
      chain_id: input.chainId, token_id: minted.tokenId, owner_address: input.walletAddress, mint_tx_hash: minted.txHash,
      side: input.side, dhb_amount: input.side === 'sell' ? Number(input.amount) : null, usdc_amount: input.side === 'buy' ? Number(input.amount) : null,
      min_usdc_per_dhb: Number(input.minPrice), max_usdc_per_dhb: Number(input.maxPrice),
    }, { onConflict: 'chain_id,token_id', ignoreDuplicates: true }), input.walletAddress)), 'Listing registration');
    if (error) throw new Error(t('dex.registrationFailed'));
    savePending(null); setAmount(''); setReview(null); setMine(true); setPage(0); setBalanceRevision((n) => n + 1);
    toastSuccess(t('dex.created')); await loadListings();
  }
  async function create() {
    if (busyRef.current || checking || withdrawing) return;
    if (!address || (!chainId && !pending)) { setFormError(t('dex.connectToken', { token })); return; }
    busyRef.current = true; setBusy(true); setFormError(''); setStage('quote');
    try {
      if (pending) { await register(pending); return; }
      if (!/^\d+(\.\d+)?$/.test(amount) || ethers.utils.parseUnits(amount, decimals).lte(0) || ethers.utils.parseUnits(amount, decimals).gt(ethers.utils.parseUnits(balance, decimals))) throw new Error(t('dex.checkAmount'));
      const input: SellInput = { walletAddress: address, chainId: chainId!, side, amount, minPrice, maxPrice };
      if (!review) { setReview(await quoteSell(input)); return; }
      setStage('wallet');
      if (connectedChain !== chainId) await readWithTimeout(Promise.resolve(switchChain(chainId!)), 'Wallet network', 60000);
      const provider = getSigningProvider();
      if (!provider) throw new Error(t('dex.unlockWallet'));
      const minted = await mintSell(input, provider, setStage, (txHash) => savePending({ input, txHash }));
      await register({ input, ...minted });
    } catch (error) { if ((error as { code?: string }).code === 'DEX_REVERTED') { savePending(null); setReview(null); } setFormError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); busyRef.current = false; }
  }
  async function withdraw(item: VerifiedPosition) {
    if (!address || locked) return;
    setWithdrawing(`${item.chain_id}:${item.token_id}`);
    try {
      if (connectedChain !== item.chain_id) await readWithTimeout(Promise.resolve(switchChain(item.chain_id)), 'Wallet network', 60000);
      const provider = getSigningProvider(); if (!provider) throw new Error(t('dex.unlockWallet'));
      await withdrawSell(item, address, provider); toastSuccess(t('dex.withdrawn'));
      await loadListings(); setBalanceRevision((n) => n + 1);
    } catch (error) { toastError(error instanceof Error ? error.message : String(error)); }
    finally { setWithdrawing(null); }
  }
  const field = (label: string, value: string, setValue: (value: string) => void, unit: string) => <View style={s.field}><Text style={s.muted}>{label}</Text><View style={s.inputWrap}><TextInput accessibilityLabel={label} editable={!locked} value={value} keyboardType="decimal-pad" onChangeText={(next) => { setValue(next); setReview(null); }} style={s.input} placeholder="0.00" placeholderTextColor="#596675" /><Text style={s.unit}>{unit}</Text></View></View>;
  const book = (levels: BookLevel[], bid: boolean) => <View><Text style={[s.bookLabel, { color: bid ? '#20c997' : '#f05b72' }]}>{t(bid ? 'dex.bids' : 'dex.asks')}</Text>{!levels.length ? <Text style={s.empty}>{t('dex.noOrders')}</Text> : levels.map((level) => <TouchableOpacity accessibilityLabel={t('dex.usePrice', { price: formatPrice(level.price) })} disabled={locked} key={level.price} onPress={() => { choosePrice(level.price, bid ? 'buy' : 'sell'); setTab('trade'); }} style={s.bookRow}><View pointerEvents="none" style={[s.depthBar, { width: `${level.cumulativeDhb / (levels.at(-1)?.cumulativeDhb || 1) * 100}%`, backgroundColor: bid ? '#20c997' : '#f05b72' }]} /><Text style={[s.cell, { color: bid ? '#20c997' : '#f05b72' }]}>{formatPrice(level.price)}</Text><Text style={[s.cell, s.right]}>{formatSize(level.dhb)}</Text><Text style={[s.cell, s.right]}>{formatSize(level.cumulativeDhb)}</Text></TouchableOpacity>)}</View>;

  return <View style={s.root}><ScreenHeader title={t('dex.title')} onBackPress={() => navigation.goBack()} /><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.header}><View><Text style={s.pair}>{t('dex.title')}</Text><Text style={s.muted}>{t('dex.combined')}</Text></View><TouchableOpacity disabled={loading || busy} onPress={() => { void loadListings(); setMarketRevision((n) => n + 1); setBalanceRevision((n) => n + 1); }}><Text style={s.link}>{t(loading ? 'dex.updating' : 'dex.refresh')}</Text></TouchableOpacity></View>
    <View style={s.stats}><View><Text style={s.muted}>{t('dex.reference')}</Text><Text style={s.price}>{market?.price ? `$${formatPrice(market.price)}` : '—'}</Text></View><View><Text style={s.muted}>{t('dex.change24')}</Text><Text style={[s.statValue, { color: (market?.change || 0) >= 0 ? '#20c997' : '#f05b72' }]}>{market?.change != null ? `${market.change >= 0 ? '+' : ''}${market.change.toFixed(2)}%` : '—'}</Text></View></View>
    {listError && <Text style={s.alert}>{t('dex.snapshotError')}</Text>}
    <View style={s.tabs}>{(['chart', 'book', 'trade'] as const).map((value) => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[s.tab, tab === value && s.tabActive]}><Text style={tab === value ? s.white : s.muted}>{t(`dex.tab.${value}`)}</Text></TouchableOpacity>)}</View>
    {tab === 'chart' && <View style={s.panel}><View style={s.toolbar}><View style={s.inline}>{[false, true].map((value) => <TouchableOpacity key={String(value)} style={[s.smallTab, depth === value && s.selected]} onPress={() => setDepth(value)}><Text style={s.white}>{t(value ? 'dex.depth' : 'dex.price')}</Text></TouchableOpacity>)}</View>{!depth && <View style={s.inline}>{(['1D', '1W', '1M'] as const).map((value) => <TouchableOpacity style={[s.smallTab, period === value && s.selected]} key={value} onPress={() => setPeriod(value)}><Text style={s.white}>{value}</Text></TouchableOpacity>)}</View>}</View>
      {!depth && chartLoading ? <ActivityIndicator style={{ height: 250 }} color="#20c997" /> : !depth && chartError ? <View style={s.emptyWrap}><Text style={s.empty}>{t('dex.chartError')}</Text><TouchableOpacity onPress={() => setMarketRevision((n) => n + 1)}><Text style={s.link}>{t('dex.retry')}</Text></TouchableOpacity></View> : <DexMarketChart points={market?.points || []} bids={bids} asks={asks} depth={depth} />}
      <Text style={s.note}>{t(depth ? 'dex.depthNote' : 'dex.referenceNote')}{market?.partial && !depth ? ` ${t('dex.partialHistory')}` : ''}</Text>
      {!depth && <View style={[s.inline, { padding: 12 }]}>{market?.sources.map((source) => <TouchableOpacity key={source.name} onPress={() => void Linking.openURL(source.url)}><Text style={s.link}>{t('dex.source', { name: source.name })}</Text></TouchableOpacity>)}</View>}
    </View>}
    {tab === 'book' && <View style={s.panel}><View style={s.toolbar}><Text style={s.heading}>{t('dex.orderBook')}</Text><TouchableOpacity onPress={() => setIncrement((value) => value === .000001 ? .0000001 : value === .0000001 ? .00000001 : .000001)}><Text style={s.muted}>{increment.toFixed(8)}</Text></TouchableOpacity></View><View style={s.bookHead}><Text style={[s.cell, s.muted]}>{t('dex.price')}</Text><Text style={[s.cell, s.muted, s.right]}>DHB</Text><Text style={[s.cell, s.muted, s.right]}>{t('dex.totalDhb')}</Text></View>{book(asks, false)}<View style={s.spread}><Text style={s.muted}>{t(spread != null && spread < 0 ? 'dex.overlap' : 'dex.spread')}</Text><Text style={s.white}>{spread == null ? '—' : formatPrice(Math.abs(spread))} USDC</Text></View>{book(bids, true)}<View style={s.ratio}><View style={{ width: `${bidTotal + askTotal ? bidTotal / (bidTotal + askTotal) * 100 : 50}%`, height: 3, backgroundColor: '#20c997' }} /></View><Text style={s.note}>{t('dex.depthNote')}{updated ? ` · ${new Date(updated).toLocaleTimeString()}` : ''}</Text></View>}
    {tab === 'trade' && <View style={[s.panel, s.ticket]}><View style={s.side}>{(['buy', 'sell'] as const).map((value) => <TouchableOpacity disabled={locked} key={value} onPress={() => { setAmount(''); choosePrice(.001, value); }} style={[s.sideButton, side === value && { backgroundColor: value === 'buy' ? '#20c997' : '#f05b72' }]}><Text style={side === value ? s.darkText : s.muted}>{t(value === 'buy' ? 'dex.buy' : 'dex.sell')}</Text></TouchableOpacity>)}</View>
      {field(t(side === 'buy' ? 'dex.maxBuy' : 'dex.minSell'), side === 'buy' ? maxPrice : minPrice, (value) => { if (side === 'buy') { setMaxPrice(value); setMinPrice((Number(value) * .999).toFixed(8)); } else { setMinPrice(value); setMaxPrice((Number(value) * 1.001).toFixed(8)); } }, 'USDC')}
      {field(t('dex.amountToken', { token }), amount, setAmount, token)}<View style={s.header}><Text style={s.muted}>{t('dex.available')}</Text><Text style={s.white}>{checking ? t('dex.checking') : `${formatSize(Number(balance))} ${token}`}</Text></View><View style={s.fractions}>{[25, 50, 75, 100].map((percent) => <TouchableOpacity disabled={locked || checking || !chainId} style={s.fraction} key={percent} onPress={() => { setAmount(balanceFraction(balance, percent, decimals)); setReview(null); }}><Text style={s.muted}>{percent === 100 ? t('dex.max') : `${percent}%`}</Text></TouchableOpacity>)}</View>
      <TouchableOpacity onPress={() => setAdvanced(!advanced)}><Text style={[s.link, { marginTop: 20 }]}>{t('dex.adjustRange')}</Text></TouchableOpacity>{advanced && <>{field(t('dex.minimum'), minPrice, setMinPrice, 'USDC')}{field(t('dex.maximum'), maxPrice, setMaxPrice, 'USDC')}</>}
      <View style={s.summary}><View style={s.header}><Text style={s.muted}>{t('dex.estimated')}</Text><Text style={s.white}>{formatSize(estimate)} {side === 'buy' ? 'DHB' : 'USDC'}</Text></View><View style={s.header}><Text style={s.muted}>{t('dex.network')}</Text><Text style={s.white}>{chainId ? DEX_CHAINS[chainId].name : t('dex.automatic')}</Text></View><Text style={s.muted}>{t('dex.feeNote')}</Text></View>
      {balanceError && <TouchableOpacity disabled={busy} onPress={() => setBalanceRevision((n) => n + 1)}><Text style={s.alert}>{t('dex.balanceError')}</Text></TouchableOpacity>}
      {!!review && !pending && <Text style={s.review}>{t('dex.reviewToken', { amount, token, chain: chainId ? DEX_CHAINS[chainId].name : '', minPrice, maxPrice })}{review.createPool ? ` ${t('dex.initializes')}` : ''}</Text>}
      {!!pending && <TouchableOpacity onPress={() => void Linking.openURL(`${explorer(pending.input.chainId)}/tx/${pending.txHash}`)}><Text style={s.review}>{t('dex.pendingNote')}</Text></TouchableOpacity>}
      {!!formError && <Text accessibilityRole="alert" style={s.alert}>{formError}</Text>}
      <TouchableOpacity disabled={busy || checking || !!withdrawing || (!chainId && !pending)} onPress={() => void create()} style={[s.submit, { backgroundColor: side === 'buy' ? '#20c997' : '#f05b72', opacity: busy || checking || (!chainId && !pending) ? .5 : 1 }]}>{busy && <ActivityIndicator color="#061410" />}<Text style={s.darkText}>{busy ? t(`dex.${authMethod === 'local' && ['tokenApproval', 'permitApproval', 'submit'].includes(stage) ? 'automaticStage' : 'stage'}.${stage}`) : pending ? t('dex.resume') : review ? t('dex.approve') : t('dex.review')}</Text></TouchableOpacity><Text style={s.note}>{t('dex.reversalNote')}</Text>
    </View>}
    <View style={[s.panel, { marginTop: 18 }]}><View style={s.toolbar}><View style={s.inline}>{[false, true].map((value) => <TouchableOpacity key={String(value)} style={[s.smallTab, mine === value && s.selected]} onPress={() => { setMine(value); setPage(0); }}><Text style={s.white}>{t(value ? 'dex.myPositions' : 'dex.allListings')}</Text></TouchableOpacity>)}</View><Text style={s.muted}>{shown.length}</Text></View>
      {!shown.length && <Text style={s.empty}>{t(loading ? 'dex.verifying' : mine ? 'dex.noMyPositions' : 'dex.noListings')}</Text>}
      {visible.map((item) => <View style={s.position} key={`${item.chain_id}:${item.token_id}`}><View style={s.header}><Text style={{ color: item.side === 'buy' ? '#20c997' : '#f05b72', fontWeight: '600' }}>{t(item.side === 'buy' ? 'dex.buy' : 'dex.sell')}</Text><Text style={s.muted}>{DEX_CHAINS[item.chain_id as DexChainId].name}</Text></View><Text style={[s.white, { marginVertical: 8 }]}>{formatPrice(item.minPrice)} – {formatPrice(item.maxPrice)} USDC</Text><Text style={s.muted}>{formatSize(item.amountDhb)} DHB · {formatSize(item.amountUsdc)} USDC</Text><View style={[s.header, { marginTop: 12 }]}><Text style={s.muted}>{t(item.status === 'Filled' ? 'dex.ready' : item.status === 'In range' ? 'dex.converting' : 'dex.waiting')}</Text>{address.toLowerCase() === item.owner.toLowerCase() ? <TouchableOpacity disabled={locked} onPress={() => Alert.alert(t('dex.withdrawPosition'), t('dex.withdrawReview', { dhb: formatSize(item.amountDhb), usdc: formatSize(item.amountUsdc), chain: DEX_CHAINS[item.chain_id as DexChainId].name }), [{ text: t('dex.cancel'), style: 'cancel' }, { text: t('dex.withdrawPosition'), onPress: () => void withdraw(item) }])}><Text style={s.link}>{t(withdrawing === `${item.chain_id}:${item.token_id}` ? 'dex.withdrawing' : 'dex.withdrawPosition')}</Text></TouchableOpacity> : <TouchableOpacity onPress={() => void Linking.openURL(`${explorer(item.chain_id)}/tx/${item.mint_tx_hash}`)}><Text style={s.link}>{t('dex.onchain')}</Text></TouchableOpacity>}</View></View>)}
      {hasMorePages && <View style={[s.header, { padding: 14 }]}><TouchableOpacity disabled={!page} onPress={() => setPage(page - 1)}><Text style={s.link}>{t('dex.previous')}</Text></TouchableOpacity><Text style={s.muted}>{page + 1} / {Math.ceil(shown.length / PAGE_SIZE)}</Text><TouchableOpacity disabled={(page + 1) * PAGE_SIZE >= shown.length} onPress={() => setPage(page + 1)}><Text style={s.link}>{t('dex.next')}</Text></TouchableOpacity></View>}
    </View>
  </ScrollView></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0e11' }, content: { padding: 12, paddingBottom: 80 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pair: { color: '#edf1f6', fontSize: 23, fontWeight: '600', marginBottom: 4 }, muted: { color: '#919ca9', fontSize: 11 },
  white: { color: '#e9edf2', fontSize: 12, fontVariant: ['tabular-nums'] }, darkText: { color: '#061410', fontSize: 12, fontWeight: '700' },
  link: { color: '#b6c4d4', fontSize: 11, textDecorationLine: 'underline' }, stats: { flexDirection: 'row', gap: 32, paddingVertical: 20 },
  price: { fontSize: 24, fontWeight: '500', color: '#e9edf2', marginTop: 5, fontVariant: ['tabular-nums'] }, statValue: { fontSize: 17, marginTop: 8 },
  tabs: { flexDirection: 'row', marginBottom: 12 }, tab: { flex: 1, alignItems: 'center', padding: 12, borderBottomWidth: 2, borderColor: 'transparent' }, tabActive: { borderColor: '#e9edf2' },
  panel: { backgroundColor: '#11151b', borderWidth: 1, borderColor: '#252b34', borderRadius: 8, overflow: 'hidden' },
  toolbar: { padding: 12, borderBottomWidth: 1, borderColor: '#252b34', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', gap: 8 }, smallTab: { paddingVertical: 7, paddingHorizontal: 8, borderRadius: 4 }, selected: { backgroundColor: '#29313b' }, heading: { color: '#e9edf2', fontWeight: '600' },
  note: { color: '#919ca9', fontSize: 10, lineHeight: 16, padding: 12 }, empty: { color: '#919ca9', padding: 30, textAlign: 'center', fontSize: 12 }, emptyWrap: { minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  bookHead: { flexDirection: 'row', padding: 12 }, cell: { flex: 1, color: '#c5ced8', fontSize: 10, fontVariant: ['tabular-nums'] }, right: { textAlign: 'right' },
  bookLabel: { padding: 12, paddingBottom: 6, fontSize: 10 }, bookRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 7, position: 'relative' }, depthBar: { position: 'absolute', right: 0, top: 1, bottom: 1, opacity: .09 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#252b34' }, ratio: { height: 3, margin: 12, backgroundColor: '#f05b72' },
  ticket: { padding: 16 }, side: { flexDirection: 'row', padding: 3, backgroundColor: '#090d12', borderRadius: 6 }, sideButton: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 4 },
  field: { marginTop: 18 }, inputWrap: { marginTop: 8, borderColor: '#343e4b', borderWidth: 1, borderRadius: 6, backgroundColor: '#0b0e13', flexDirection: 'row', alignItems: 'center' }, input: { color: '#f4f6f8', flex: 1, padding: 12, fontSize: 16 }, unit: { color: '#919ca9', paddingRight: 12, fontSize: 11 },
  fractions: { flexDirection: 'row', gap: 6, marginTop: 10 }, fraction: { flex: 1, padding: 7, alignItems: 'center', borderColor: '#252b34', borderWidth: 1, borderRadius: 4 },
  summary: { gap: 12, marginVertical: 20 }, submit: { padding: 14, borderRadius: 6, alignItems: 'center', gap: 8 },
  alert: { color: '#ff9eac', backgroundColor: '#25151b', borderColor: '#743443', borderWidth: 1, padding: 12, marginVertical: 10, borderRadius: 6, fontSize: 12, lineHeight: 18 },
  review: { color: '#d2e4ee', backgroundColor: '#132028', borderColor: '#3c5661', borderWidth: 1, padding: 12, marginVertical: 12, borderRadius: 6, fontSize: 11, lineHeight: 18 },
  position: { padding: 16, borderBottomWidth: 1, borderColor: '#252b34' },
});
