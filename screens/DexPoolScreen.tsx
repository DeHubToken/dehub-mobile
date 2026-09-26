import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { ethers } from 'ethers';
import ScreenHeader from '../components/ScreenHeader';
import DexMarketChart from '../components/DexMarketChart';
import DexPoolPicker, { DexPoolAvatar } from '../components/DexPoolPicker';
import DexAddPoolSheet from '../components/DexAddPoolSheet';
import { useUser } from '../context/AuthContext';
import { useDexSigner } from '../hooks/useDexSigner';
import { ScreenNames } from '../navigation/ScreenNames';
import { toastError, toastInfo, toastSuccess } from '../libs';
import { runWithPermissions } from '../libs/permissions.util';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { supabase } from '../services/supabase';
import { dexActionError } from '../libs/dex-action-error';
import type { OrderStage } from '../libs/dex-read-timeout';
import { CANDLE_INTERVALS, type CandleInterval } from '../libs/dex-live-market';
import { aggregateBook, fillFraction, formatBookPrice, formatIncrement, formatPrice, formatSize, levelBook, nearestBookLevels, spreadPercent, type BookLevel } from '../libs/dex-orderbook';
import { getPool, isAcceptedPoolImage, isPoolChain, POOL_CHAIN_INFO, setPoolImage, uploadPoolImage, type DexPool } from '../libs/dex-pools';
import { incrementsFor, tokenCandles, tokenMarket } from '../libs/dex-market-data';
import { NATIVE, quoteSwap, runSwap, type SwapCall } from '../libs/dex-evm-swap';
import { evmMarket, placeEvmOrder, poolProvider, readEvmOrders, withdrawEvmOrder, type EvmOrder } from '../libs/dex-pool-v4';
import { activeSolanaOrders, cancelSolanaOrder, MIN_ORDER_USD, placeSolanaOrder, quoteSolanaSwap, runSolanaSwap, SOL_MINT, solanaBalance, solanaTrader, spendableSol, USDC_MINT, type SolanaQuote } from '../libs/dex-solana-trade';

type Side = 'buy' | 'sell';
type Mode = 'limit' | 'instant';
interface OrderRow { pool_id: string; order_ref: string; owner_address: string; maker: string; side: Side; tx_hash: string; token_amount: number; usd_amount: number; price: number; created_at: string }
interface TradeRow { tx_hash: string; pool_id: string; trader: string; side: Side; token_amount: number; usd_amount: number; price: number; created_at: string }
/** A resting order as the book and the orders list show it, whatever chain it lives on. */
interface LiveOrder { row: OrderRow; side: Side; price: number; tokenLeft: number; usdLeft: number; fill: number; status: 'Open' | 'In range' | 'Filled'; evm?: EvmOrder }
type InstantQuote = { evm?: SwapCall; sol?: SolanaQuote; out: number };

const PAGE_SIZE = 15;
const BOOK_ROWS = 12;
/** DexScreener / GeckoTerminal refresh while the pool screen is focused. */
const MARKET_POLL_MS = 120_000;
const decimalInput = (value: string) => value.replace(',', '.').trim();
const numeric = <T extends object>(row: T, keys: (keyof T)[]) => { for (const k of keys) (row as Record<string, unknown>)[k as string] = Number(row[k]); return row; };
/** Cut a decimal string to what the token can hold, so parseUnits never throws on precision. */
const clampDecimals = (value: string, decimals: number) => { const [whole, fraction = ''] = value.split('.'); return fraction ? `${whole}.${fraction.slice(0, decimals)}` : whole; };
function formatWhen(iso: string) {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DexPoolScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params ?? {}) as { chain?: string; address?: string };
  const chain = isPoolChain(params.chain) ? params.chain : null;
  const [adding, setAdding] = useState(false);
  const { data: pool, isLoading } = useQuery({
    queryKey: ['dex-pool', chain, params.address], enabled: !!chain && !!params.address,
    queryFn: () => getPool(chain!, params.address!),
  });

  if (!chain || !params.address || (!isLoading && !pool)) {
    return <View style={s.root}><ScreenHeader title={t('dex.title')} onBackPress={() => navigation.goBack()} />
      <View style={s.content}>
        <DexPoolPicker current={null} />
        <View style={[s.panel, { marginTop: 18, padding: 20 }]}>
          <Text style={[s.white, { textAlign: 'center' }]}>{t('dex.pool.missing')}</Text>
          <TouchableOpacity style={[s.submit, { backgroundColor: '#20c997', marginTop: 16 }]} onPress={() => setAdding(true)}><Text style={s.darkText}>{t('dex.pools.add')}</Text></TouchableOpacity>
        </View>
      </View>
      <DexAddPoolSheet visible={adding} onClose={() => setAdding(false)} onCreated={(created) => navigation.navigate(ScreenNames.DexPool, { chain: created.chain, address: created.token_address })} />
    </View>;
  }
  if (!pool) return <View style={s.root}><ScreenHeader title={t('dex.title')} onBackPress={() => navigation.goBack()} /><ActivityIndicator style={{ marginTop: 80 }} color="#20c997" /></View>;
  return <PoolTerminal pool={pool} key={pool.id} />;
}

function PoolTerminal({ pool }: { pool: DexPool }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const user = useUser();
  const walletAddress = user?.walletAddress || user?.address || '';
  const signer = useDexSigner();
  const info = POOL_CHAIN_INFO[pool.chain];
  const isSolana = pool.chain === 'solana';
  const market = useMemo(() => isSolana ? null : evmMarket(pool), [pool, isSolana]);
  const symbol = pool.symbol;
  const isCreator = walletAddress.toLowerCase() === pool.creator_address;

  const [tab, setTab] = useState<'chart' | 'book' | 'trade'>('chart');
  const [side, setSide] = useState<Side>('buy');
  const [mode, setMode] = useState<Mode>('limit');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const priceTouched = useRef(false);
  const [payNative, setPayNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<OrderStage | 'index' | 'swap'>('quote');
  const [formError, setFormError] = useState('');
  const [instantQuote, setInstantQuote] = useState<InstantQuote | null>(null);
  const [period, setPeriod] = useState<CandleInterval>('15m');
  const [depth, setDepth] = useState(false);
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [imageBusy, setImageBusy] = useState(false);

  // ── Market data ──
  // DexScreener and GeckoTerminal are called from the phone (the shared server
  // snapshot only covers the DHB markets, not arbitrary pool tokens), so they
  // poll slowly and only while this screen is the one in front.
  const focused = useIsFocused();
  const { data: stats, refetch: refetchStats, isFetching: statsFetching } = useQuery({
    queryKey: ['dex-pool-market', pool.chain, pool.token_address], queryFn: () => tokenMarket(pool.chain, pool.token_address),
    refetchInterval: focused ? MARKET_POLL_MS : false, staleTime: 60_000,
  });
  const { data: candles = [], isLoading: candlesLoading } = useQuery({
    queryKey: ['dex-pool-candles', pool.chain, stats?.pairAddress, period], enabled: !!stats?.pairAddress,
    queryFn: () => tokenCandles(pool.chain, stats!.pairAddress!, pool.token_address, period), refetchInterval: focused ? MARKET_POLL_MS : false, staleTime: 60_000,
  });
  const marketPrice = stats?.priceUsd ?? candles.at(-1)?.close ?? null;
  const increments = useMemo(() => incrementsFor(marketPrice), [marketPrice]);
  const [incrementIndex, setIncrementIndex] = useState(1);
  const increment = increments[Math.min(incrementIndex, increments.length - 1)];

  // ── Orders and trades ──
  const { data: rows = [], refetch: refetchRows } = useQuery({
    queryKey: ['dex-pool-orders', pool.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('dex_pool_orders' as never).select('*').eq('pool_id', pool.id).order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      return ((data ?? []) as OrderRow[]).map((r) => numeric(r, ['token_amount', 'usd_amount', 'price']));
    },
    staleTime: 10_000,
  });
  const { data: trades = [], refetch: refetchTrades } = useQuery({
    queryKey: ['dex-pool-trades', pool.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('dex_pool_trades' as never).select('*').eq('pool_id', pool.id).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return ((data ?? []) as TradeRow[]).map((r) => numeric(r, ['token_amount', 'usd_amount', 'price']));
    },
    staleTime: 10_000,
  });
  const { data: live = [], isLoading: liveLoading, refetch: refetchLive } = useQuery({
    queryKey: ['dex-pool-live', pool.id, rows.map((r) => r.order_ref).join(',')],
    queryFn: async (): Promise<LiveOrder[]> => {
      if (!rows.length) return [];
      if (market) {
        const orders = await readEvmOrders(market, rows.map((r) => ({ order_ref: r.order_ref, side: r.side })));
        const byId = new Map(orders.map((o) => [o.tokenId, o]));
        return rows.flatMap((row) => {
          const o = byId.get(row.order_ref);
          if (!o) return [];
          return [{ row, side: row.side, price: row.side === 'buy' ? o.maxPrice : o.minPrice, tokenLeft: o.amountDhb, usdLeft: o.amountUsdc, fill: fillFraction(o), status: o.status, evm: o }];
        });
      }
      const active = await activeSolanaOrders(rows.map((r) => r.maker));
      return rows.flatMap((row) => {
        const o = active.get(row.order_ref);
        if (!o) return [];
        const sell = row.side === 'sell';
        const orderPrice = sell ? o.taking / o.making : o.making / o.taking;
        const filled = o.making > 0 ? 1 - o.remainingMaking / o.making : 0;
        return [{ row, side: row.side, price: orderPrice, tokenLeft: sell ? o.remainingMaking : o.remainingTaking, usdLeft: sell ? o.remainingTaking : o.remainingMaking,
          fill: filled, status: filled > 0 ? 'In range' as const : 'Open' as const }];
      });
    },
    refetchInterval: focused ? 30_000 : false, staleTime: 10_000,
  });
  useEffect(() => {
    const channel = supabase.channel(`dex-pool-${pool.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dex_pool_orders', filter: `pool_id=eq.${pool.id}` }, () => { void refetchRows(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dex_pool_trades', filter: `pool_id=eq.${pool.id}` }, () => { void refetchTrades(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [pool.id, refetchRows, refetchTrades]);

  const { bids, asks } = useMemo(() => {
    const resting = live.filter((o) => o.status !== 'Filled');
    if (market) return aggregateBook(resting.map((o) => o.evm!), increment);
    return levelBook(resting.map((o) => ({ side: o.side, price: o.price, size: o.tokenLeft })), increment);
  }, [live, market, increment]);
  const bidTotal = bids.at(-1)?.cumulativeDhb || 0, askTotal = asks.at(-1)?.cumulativeDhb || 0;
  const gap = bids.length && asks.length ? asks[0].price - bids[0].price : null;
  const spread = gap != null && gap > 0 ? gap : null;
  const spreadShare = spread != null ? spreadPercent(bids[0].price, asks[0].price) : null;

  // ── Balances ──
  const [trader, setTrader] = useState<string | null>(null);
  useEffect(() => {
    if (!walletAddress) { setTrader(null); return; }
    if (!isSolana) { setTrader(walletAddress); return; }
    let active = true;
    void solanaTrader().then((address) => { if (active) setTrader(address); }).catch(() => {});
    return () => { active = false; };
  }, [walletAddress, isSolana]);
  const { data: balances } = useQuery({
    queryKey: ['dex-pool-balances', pool.id, trader, balanceRevision], enabled: !!trader,
    queryFn: async () => {
      if (isSolana) {
        const [token, usdc, sol] = await Promise.all([solanaBalance(trader!, pool.token_address), solanaBalance(trader!, USDC_MINT), solanaBalance(trader!, SOL_MINT)]);
        return { token, usdc, native: spendableSol(sol) };
      }
      const provider = poolProvider(market!);
      const erc20 = ['function balanceOf(address) view returns (uint256)'];
      const [token, usdc, native] = await Promise.all([
        new ethers.Contract(pool.token_address, erc20, provider).balanceOf(trader) as Promise<ethers.BigNumber>,
        new ethers.Contract(info.usdc, erc20, provider).balanceOf(trader) as Promise<ethers.BigNumber>,
        provider.getBalance(trader!),
      ]);
      return { token: Number(ethers.utils.formatUnits(token, pool.decimals)), usdc: Number(ethers.utils.formatUnits(usdc, info.usdcDecimals)), native: Number(ethers.utils.formatUnits(native, 18)) };
    },
    refetchInterval: focused ? 60_000 : false,
  });
  const nativeSymbol = isSolana ? 'SOL' : 'ETH';
  const spendSymbol = side === 'sell' ? symbol : payNative && mode === 'instant' ? nativeSymbol : 'USDC';
  const available = !balances ? null : side === 'sell' ? balances.token : spendSymbol === 'USDC' ? balances.usdc : balances.native;

  // ── Ticket ──
  useEffect(() => {
    if (priceTouched.current || marketPrice == null) return;
    const step = increment;
    const seeded = side === 'sell' ? Math.ceil(marketPrice * 1.001 / step) * step : Math.floor(marketPrice * 0.999 / step) * step;
    setPrice(String(Number(seeded.toPrecision(8))));
  }, [marketPrice, side, increment]);
  useEffect(() => { setInstantQuote(null); setFormError(''); }, [side, mode, amount, payNative]);
  // Leaving mid-order drops the step that records it once the chain confirms,
  // so the order or trade never shows up here. Hold the screen until it lands.
  useEffect(() => {
    if (!busy && !acting) return;
    return navigation.addListener('beforeRemove', (e: any) => {
      e.preventDefault();
      toastInfo(t('toasts.waiting_for_confirmation'));
    });
  }, [busy, acting, navigation, t]);

  const priceNumber = Number(price), amountNumber = Number(amount);
  const estimate = amountNumber > 0 && priceNumber > 0 ? side === 'buy' ? amountNumber / priceNumber : amountNumber * priceNumber : 0;

  const refreshAll = useCallback(() => {
    void refetchStats(); void refetchRows(); void refetchTrades(); void refetchLive(); setBalanceRevision((n) => n + 1);
  }, [refetchStats, refetchRows, refetchTrades, refetchLive]);

  async function ensureReady(): Promise<string | null> {
    if (!walletAddress) { setFormError(t('dex.connectWallet')); return null; }
    if (!isSolana) return walletAddress;
    const address = await solanaTrader();
    setTrader(address);
    return address;
  }

  async function placeLimit() {
    const maker = await ensureReady();
    if (!maker) return;
    if (!(amountNumber > 0) || (available != null && amountNumber > available)) throw new Error(t('dex.checkAmount', { token: spendSymbol }));
    if (!(priceNumber > 0)) throw new Error(t('dex.pool.enterPrice'));
    let orderRef: string, txHash: string;
    if (market) {
      // A one-tick-wide band at the asked price: a limit order, as close as a range position gets.
      const minPrice = side === 'buy' ? priceNumber * 0.999 : priceNumber;
      const maxPrice = side === 'buy' ? priceNumber : priceNumber * 1.001;
      const fmt = (v: number) => clampDecimals(v.toFixed(18).replace(/0+$/, '').replace(/\.$/, ''), 18);
      setStage('wallet');
      const provider = await signer(market.chainId, t('dex.unlockWallet'));
      const placed = await placeEvmOrder(market, { walletAddress, side, amount: clampDecimals(amount, side === 'sell' ? pool.decimals : info.usdcDecimals), minPrice: fmt(minPrice), maxPrice: fmt(maxPrice) }, provider, setStage);
      orderRef = placed.tokenId; txHash = placed.txHash;
    } else {
      setStage('submit');
      const placed = await placeSolanaOrder({ trader: maker, side, tokenMint: pool.token_address, tokenDecimals: pool.decimals, amount: amountNumber, price: priceNumber });
      orderRef = placed.order; txHash = placed.signature;
    }
    const tokenAmount = side === 'sell' ? amountNumber : amountNumber / priceNumber;
    const usdAmount = side === 'sell' ? amountNumber * priceNumber : amountNumber;
    setStage('index');
    const { error } = await withWalletHeader(supabase.from('dex_pool_orders' as never).insert({
      pool_id: pool.id, order_ref: orderRef, owner_address: walletAddress.toLowerCase(), maker: isSolana ? maker : maker.toLowerCase(), side, tx_hash: txHash,
      token_amount: tokenAmount, usd_amount: usdAmount, price: priceNumber,
    } as never), walletAddress);
    if (error) toastError(t('dex.registrationFailed'));
    toastSuccess(t('dex.created'));
    setAmount(''); priceTouched.current = false; setMine(true);
  }

  async function quoteInstant(): Promise<InstantQuote | null> {
    const taker = await ensureReady();
    if (!taker) return null;
    if (!(amountNumber > 0) || (available != null && amountNumber > available)) throw new Error(t('dex.checkAmount', { token: spendSymbol }));
    setStage('quote');
    if (isSolana) {
      const inputMint = side === 'sell' ? pool.token_address : payNative ? SOL_MINT : USDC_MINT;
      const outputMint = side === 'sell' ? USDC_MINT : pool.token_address;
      const inDecimals = side === 'sell' ? pool.decimals : payNative ? 9 : 6;
      const sol = await quoteSolanaSwap(inputMint, outputMint, BigInt(ethers.utils.parseUnits(clampDecimals(amount, inDecimals), inDecimals).toString()));
      const out = Number(ethers.utils.formatUnits(sol.outAmount.toString(), side === 'sell' ? 6 : pool.decimals));
      const quote: InstantQuote = { sol, out }; setInstantQuote(quote); return quote;
    }
    const tokenIn = side === 'sell' ? pool.token_address : payNative ? NATIVE : info.usdc;
    const tokenOut = side === 'sell' ? info.usdc : pool.token_address;
    const inDecimals = side === 'sell' ? pool.decimals : payNative ? 18 : info.usdcDecimals;
    const evm = await quoteSwap({ chainId: market!.chainId, tokenIn, tokenOut, amountIn: BigInt(ethers.utils.parseUnits(clampDecimals(amount, inDecimals), inDecimals).toString()), recipient: taker });
    const out = Number(ethers.utils.formatUnits(evm.amountOut.toString(), side === 'sell' ? info.usdcDecimals : pool.decimals));
    const quote: InstantQuote = { evm, out }; setInstantQuote(quote); return quote;
  }

  async function runInstant() {
    const taker = await ensureReady();
    if (!taker) return;
    const quote = instantQuote ?? await quoteInstant();
    if (!quote) return;
    setStage('swap');
    const hash = quote.sol ? await runSolanaSwap(quote.sol, taker) : await runSwap(quote.evm!, await signer(market!.chainId, t('dex.unlockWallet')), taker);
    const tokenAmount = side === 'sell' ? amountNumber : quote.out;
    const usdAmount = side === 'sell' ? quote.out
      : quote.sol?.usdValue ?? quote.evm?.amountInUsd ?? (spendSymbol === 'USDC' ? amountNumber : quote.out * (marketPrice ?? 0));
    setStage('index');
    if (tokenAmount > 0 && usdAmount > 0) {
      await withWalletHeader(supabase.from('dex_pool_trades' as never).insert({
        tx_hash: hash, pool_id: pool.id, owner_address: walletAddress.toLowerCase(), trader: isSolana ? taker : taker.toLowerCase(), side,
        token_amount: tokenAmount, usd_amount: usdAmount, price: usdAmount / tokenAmount,
      } as never), walletAddress);
    }
    toastSuccess(t(side === 'buy' ? 'dex.pool.bought' : 'dex.pool.sold', { amount: formatSize(tokenAmount), symbol }));
    setAmount(''); setInstantQuote(null);
  }

  async function submit() {
    if (busy) return;
    setFormError(''); setBusy(true);
    try {
      if (mode === 'limit') await placeLimit();
      else if (!instantQuote) await quoteInstant();
      else await runInstant();
      if (mode === 'limit' || instantQuote) refreshAll();
    } catch (error) {
      setFormError(dexActionError(error, t('dex.prepareFailed')));
    } finally { setBusy(false); }
  }

  async function cancel(order: LiveOrder) {
    if (acting || !walletAddress) return;
    setActing(order.row.order_ref);
    try {
      if (order.evm && market) await withdrawEvmOrder(market, order.evm, walletAddress, await signer(market.chainId, t('dex.unlockWallet')));
      else await cancelSolanaOrder(await solanaTrader(), order.row.order_ref);
      toastSuccess(t(market ? 'dex.withdrawn' : 'dex.pool.cancelled'));
      refreshAll();
    } catch (error) { toastError(dexActionError(error, t('dex.withdrawFailed'))); }
    finally { setActing(null); }
  }

  async function changeImage() {
    if (!walletAddress || imageBusy) return;
    await runWithPermissions(['photos'], async () => {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true, aspect: [1, 1] });
      const asset = pick.canceled ? null : pick.assets?.[0];
      if (!asset?.uri) return;
      const picked = { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize };
      if (!isAcceptedPoolImage(picked)) { toastError(t('dex.pools.imageRules')); return; }
      setImageBusy(true);
      try {
        const url = await uploadPoolImage(picked);
        await setPoolImage(pool.id, url, walletAddress);
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['dex-pool'] }), queryClient.invalidateQueries({ queryKey: ['dex-pools'] })]);
        toastSuccess(t('dex.pool.imageUpdated'));
      } catch (error) { toastError(dexActionError(error, t('dex.pool.imageFailed'))); }
      finally { setImageBusy(false); }
    });
  }

  const choosePrice = (value: number, next: Side) => { if (busy) return; priceTouched.current = true; setMode('limit'); setSide(next); setPrice(String(Number(value.toPrecision(8)))); setTab('trade'); };
  const shown = useMemo(() => mine ? live.filter((o) => o.row.owner_address === walletAddress.toLowerCase()) : live, [live, mine, walletAddress]);
  const visible = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const activity = useMemo(() => [
    ...trades.map((trade) => ({ key: trade.tx_hash, side: trade.side, size: trade.token_amount, price: trade.price, at: trade.created_at, hash: trade.tx_hash, instant: true })),
    ...rows.map((row) => ({ key: row.order_ref, side: row.side, size: row.token_amount, price: row.price, at: row.created_at, hash: row.tx_hash, instant: false })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 12), [trades, rows]);

  const stageText: Record<string, string> = {
    swap: t('dex.stage.swap'), quote: t('dex.stage.quote'), wallet: t('dex.stage.wallet'), balance: t('dex.stage.balance'),
    tokenApproval: t('dex.stage.tokenApproval'), permitApproval: t('dex.stage.permitApproval'), submit: t('dex.stage.submit'),
    confirm: t('dex.stage.confirm'), index: t('dex.stage.index'),
  };
  const submitLabel = busy ? stageText[stage] ?? t('dex.stage.quote')
    : !walletAddress ? t('dex.connectWallet')
    : mode === 'instant' ? instantQuote ? t(side === 'buy' ? 'dex.pool.confirmInstantBuy' : 'dex.pool.confirmInstantSell') : t(side === 'buy' ? 'dex.pool.instantBuy' : 'dex.pool.instantSell')
    : t(side === 'buy' ? 'dex.pool.placeBuy' : 'dex.pool.placeSell', { symbol });
  const sideColor = side === 'buy' ? '#20c997' : '#f05b72';

  const book = (levels: BookLevel[], bid: boolean) => !levels.length
    ? <Text style={s.empty}>{t(bid ? 'dex.noBids' : 'dex.noOrders')}</Text>
    : <View>{nearestBookLevels(levels, bid, BOOK_ROWS).map((level) => <TouchableOpacity key={level.price} disabled={busy} accessibilityLabel={t('dex.usePrice', { price: formatBookPrice(level.price, increment) })} onPress={() => choosePrice(level.price, bid ? 'buy' : 'sell')} hitSlop={{ top: 4, bottom: 4 }} style={s.bookRow}>
      <View pointerEvents="none" style={[s.depthBar, { width: `${level.cumulativeDhb / (levels.at(-1)?.cumulativeDhb || 1) * 100}%`, backgroundColor: bid ? '#20c997' : '#f05b72' }]} />
      <Text style={[s.cell, { color: bid ? '#20c997' : '#f05b72' }]}>{formatBookPrice(level.price, increment)}</Text><Text style={[s.cell, s.right]}>{formatSize(level.dhb)}</Text><Text style={[s.cell, s.right]}>{formatSize(level.cumulativeDhb)}</Text>
    </TouchableOpacity>)}</View>;

  const stat = (label: string, value: string, color?: string) => <View><Text style={s.muted}>{label}</Text><Text style={[s.statValue, color ? { color } : null]}>{value}</Text></View>;

  return <View style={s.root}><ScreenHeader title={t('dex.title')} onBackPress={() => navigation.goBack()} /><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.header}>
      <DexPoolPicker current={pool} />
      <TouchableOpacity disabled={busy} onPress={refreshAll}><Text style={s.link}>{t(statsFetching ? 'dex.updating' : 'dex.refresh')}</Text></TouchableOpacity>
    </View>
    {isCreator && <TouchableOpacity disabled={imageBusy} style={s.imageButton} onPress={() => void changeImage()}>{imageBusy ? <ActivityIndicator size="small" color="#e9edf2" /> : null}<Text style={s.white}>{t('dex.pool.changeImage')}</Text></TouchableOpacity>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stats}>
      <View><Text style={s.muted}>{t('dex.marketPrice')}</Text><Text style={s.price}>{marketPrice != null ? `$${formatPrice(marketPrice)}` : '—'}</Text></View>
      {stat(t('dex.change24'), stats?.change24h != null ? `${stats.change24h >= 0 ? '+' : ''}${stats.change24h.toFixed(2)}%` : '—', (stats?.change24h || 0) >= 0 ? '#20c997' : '#f05b72')}
      {stat(t('dex.totalLiquidity'), stats?.liquidityUsd != null ? `$${formatSize(stats.liquidityUsd)}` : '—')}
      {stat(t('dex.pool.volume24'), stats?.volume24h != null ? `$${formatSize(stats.volume24h)}` : '—')}
      <TouchableOpacity onPress={() => void Linking.openURL(info.address(pool.token_address))}>{stat(t('dex.network'), `${info.name} ↗`)}</TouchableOpacity>
    </ScrollView>
    <View style={s.tabs}>{(['chart', 'book', 'trade'] as const).map((value) => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[s.tab, tab === value && s.tabActive]}><Text style={tab === value ? s.white : s.muted}>{t(`dex.tab.${value}`)}</Text></TouchableOpacity>)}</View>

    {tab === 'chart' && <View style={s.panel}>
      <View style={s.toolbar}><View style={s.inline}>{[false, true].map((value) => <TouchableOpacity key={String(value)} style={[s.smallTab, depth === value && s.selected]} onPress={() => setDepth(value)}><Text style={s.white}>{t(value ? 'dex.depth' : 'dex.price')}</Text></TouchableOpacity>)}</View>
        {!depth && <View style={s.inline}>{CANDLE_INTERVALS.filter((v) => v !== '30m').map((value) => <TouchableOpacity style={[s.smallTab, period === value && s.selected]} key={value} onPress={() => setPeriod(value)}><Text style={s.white}>{value}</Text></TouchableOpacity>)}</View>}</View>
      {!depth && candlesLoading && !!stats?.pairAddress ? <ActivityIndicator style={{ height: 250 }} color="#20c997" /> : <DexMarketChart candles={candles} bids={bids} asks={asks} depth={depth} symbol={symbol} />}
      <View style={s.transactions}><View style={s.transactionHead}><Text style={s.muted}>{t('commandCentre.recentTransactions')}</Text></View>
        {activity.length ? activity.map((item) => <TouchableOpacity key={item.key} style={s.transaction} onPress={() => void Linking.openURL(info.tx(item.hash))}>
          <View><Text style={[s.transactionType, { color: item.side === 'buy' ? '#20c997' : '#f05b72' }]}>{item.instant ? '⚡ ' : ''}{t(item.side === 'buy' ? 'dex.buy' : 'dex.sell')} <Text style={s.white}>{formatSize(item.size)} {symbol}</Text></Text>
            <Text style={s.muted}>${formatPrice(item.price)} · {t(item.instant ? 'dex.pool.instant' : 'dex.pool.limit')}</Text></View>
          <Text style={s.muted}>{formatWhen(item.at)}</Text></TouchableOpacity>) : <Text style={s.empty}>{t('commandCentre.noTransactionsYet')}</Text>}
      </View>
    </View>}

    {tab === 'book' && <View style={s.panel}>
      <View style={s.toolbar}><Text style={s.heading}>{t('dex.orderBook')}</Text><TouchableOpacity accessibilityLabel={t('dex.price')} onPress={() => setIncrementIndex((i) => (i + 1) % increments.length)}><Text style={s.muted}>{formatIncrement(increment)}</Text></TouchableOpacity></View>
      <View style={s.bookHead}><Text style={[s.cell, s.muted]}>{t('dex.price')}</Text><Text style={[s.cell, s.muted, s.right]}>{t('dex.pool.size', { symbol })}</Text><Text style={[s.cell, s.muted, s.right]}>{t('dex.pool.total', { symbol })}</Text></View>
      {book(asks, false)}
      <View style={s.spread}><Text style={s.muted}>{t('dex.spread')}</Text><Text style={s.white}>{spread == null ? '—' : formatBookPrice(spread, increment)} USD{spreadShare != null ? ` · ${spreadShare.toFixed(2)}%` : ''}</Text></View>
      {book(bids, true)}
      <View style={s.ratio}><View style={{ width: `${bidTotal + askTotal ? bidTotal / (bidTotal + askTotal) * 100 : 50}%`, height: 3, backgroundColor: '#20c997' }} /></View>
      <View style={[s.header, { paddingHorizontal: 12, paddingBottom: 12 }]}><Text style={[s.muted, { color: '#20c997' }]}>{t('dex.pool.buyTotal', { amount: formatSize(bidTotal), symbol })}</Text><Text style={[s.muted, { color: '#f05b72' }]}>{t('dex.pool.sellTotal', { amount: formatSize(askTotal), symbol })}</Text></View>
    </View>}

    {tab === 'trade' && <View style={[s.panel, s.ticket]}>
      <View style={[s.inline, { gap: 8, marginBottom: 14 }]}>
        <TouchableOpacity disabled={busy} style={[s.instant, { borderColor: '#20c997' }, mode === 'instant' && side === 'buy' && { backgroundColor: '#20c997' }]} onPress={() => { setMode('instant'); setSide('buy'); }}><Text style={mode === 'instant' && side === 'buy' ? s.darkText : [s.instantText, { color: '#20c997' }]}>⚡ {t('dex.pool.instantBuy')}</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} style={[s.instant, { borderColor: '#f05b72' }, mode === 'instant' && side === 'sell' && { backgroundColor: '#f05b72' }]} onPress={() => { setMode('instant'); setSide('sell'); }}><Text style={mode === 'instant' && side === 'sell' ? s.darkText : [s.instantText, { color: '#f05b72' }]}>⚡ {t('dex.pool.instantSell')}</Text></TouchableOpacity>
      </View>
      <View style={[s.inline, { marginBottom: 12 }]} accessibilityLabel={t('dex.pool.orderType')}>{(['limit', 'instant'] as const).map((value) => <TouchableOpacity key={value} disabled={busy} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} style={[s.smallTab, mode === value && s.selected]} onPress={() => setMode(value)}><Text style={mode === value ? s.white : s.muted}>{value === 'instant' ? '⚡ ' : ''}{t(value === 'limit' ? 'dex.pool.limit' : 'dex.pool.instant')}</Text></TouchableOpacity>)}</View>
      <View style={s.side}>{(['buy', 'sell'] as const).map((value) => <TouchableOpacity disabled={busy} key={value} onPress={() => { setSide(value); setAmount(''); priceTouched.current = false; }} style={[s.sideButton, side === value && { backgroundColor: value === 'buy' ? '#20c997' : '#f05b72' }]}><Text style={side === value ? s.darkText : s.muted}>{t(value === 'buy' ? 'dex.buy' : 'dex.sell')}</Text></TouchableOpacity>)}</View>
      {mode === 'limit' && <View style={s.field}><Text style={s.muted}>{t(side === 'buy' ? 'dex.pool.buyAt' : 'dex.pool.sellAt')}</Text><View style={s.inputWrap}><TextInput accessibilityLabel={t(side === 'buy' ? 'dex.pool.buyAt' : 'dex.pool.sellAt')} editable={!busy} keyboardType="decimal-pad" value={price} onChangeText={(v) => { priceTouched.current = true; setPrice(decimalInput(v)); }} style={s.input} placeholderTextColor="#596675" /><Text style={s.unit}>USD</Text></View></View>}
      {side === 'buy' && mode === 'instant' && <View style={s.field}><Text style={s.muted}>{t('dex.payWith')}</Text><View style={[s.inline, { marginTop: 8 }]}>{[false, true].map((value) => <TouchableOpacity key={String(value)} disabled={busy} style={[s.smallTab, payNative === value && s.selected]} onPress={() => setPayNative(value)}><Text style={payNative === value ? s.white : s.muted}>{value ? nativeSymbol : 'USDC'} · {balances ? formatSize(value ? balances.native : balances.usdc) : '—'}</Text></TouchableOpacity>)}</View></View>}
      <View style={s.field}><Text style={s.muted}>{t(side === 'buy' ? 'dex.spend' : 'dex.sellAmount')}</Text><View style={s.inputWrap}><TextInput accessibilityLabel={t('dex.amountToken', { token: spendSymbol })} editable={!busy} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#596675" value={amount} onChangeText={(v) => setAmount(decimalInput(v))} style={s.input} /><Text style={s.unit}>{spendSymbol}</Text></View></View>
      <View style={[s.header, { marginTop: 10 }]}><Text style={s.muted}>{t('dex.available')}</Text><Text style={s.white}>{available == null ? (trader ? t('dex.checking') : '—') : `${formatSize(available)} ${spendSymbol}`}</Text></View>
      <View style={s.fractions}>{[25, 50, 75, 100].map((percent) => <TouchableOpacity key={percent} disabled={!available || busy} style={s.fraction} onPress={() => setAmount(String(Number((available! * percent / 100).toPrecision(10))))}><Text style={s.muted}>{percent === 100 ? t('dex.max') : `${percent}%`}</Text></TouchableOpacity>)}</View>
      <View style={s.summary}>
        <View style={s.header}><Text style={s.muted}>{mode === 'instant' ? t('dex.pool.youReceive') : t('dex.estimated')}</Text><Text style={s.white}>{mode === 'instant' ? instantQuote ? `${formatSize(instantQuote.out)} ${side === 'buy' ? symbol : 'USDC'}` : '—' : `${formatSize(estimate)} ${side === 'buy' ? symbol : 'USDC'}`}</Text></View>
        <View style={s.header}><Text style={s.muted}>{t('dex.network')}</Text><Text style={s.white}>{info.name}</Text></View>
        {mode === 'instant' && instantQuote?.sol && <View style={s.header}><Text style={s.muted}>{t('dex.pool.priceImpact')}</Text><Text style={s.white}>{instantQuote.sol.priceImpactPct.toFixed(2)}%</Text></View>}
        {mode === 'limit' && isSolana && <View style={s.header}><Text style={s.muted}>{t('dex.pool.minimum')}</Text><Text style={s.white}>${MIN_ORDER_USD}</Text></View>}
      </View>
      {!!formError && <Text accessibilityRole="alert" style={s.alert}>{formError}</Text>}
      <TouchableOpacity disabled={busy || (!!walletAddress && !(amountNumber > 0))} onPress={() => void submit()} style={[s.submit, { backgroundColor: sideColor, opacity: busy || (!!walletAddress && !(amountNumber > 0)) ? 0.5 : 1 }]}>{busy && <ActivityIndicator color="#061410" />}<Text style={s.darkText}>{submitLabel}</Text></TouchableOpacity>
      <Text style={s.note}>{mode === 'instant' ? t('dex.pool.instantNote') : isSolana ? t('dex.pool.solanaLimitNote') : t('dex.pool.evmLimitNote')}</Text>
    </View>}

    <View style={[s.panel, { marginTop: 18 }]}>
      <View style={s.toolbar}><View style={s.inline}>{[false, true].map((value) => <TouchableOpacity key={String(value)} style={[s.smallTab, mine === value && s.selected]} onPress={() => { setMine(value); setPage(0); }}><Text style={s.white}>{t(value ? 'dex.pool.myOrders' : 'dex.pool.openOrders')}</Text></TouchableOpacity>)}</View>
        <View style={[s.inline, { alignItems: 'center' }]}><DexPoolAvatar pool={pool} size={14} /><Text style={s.muted}> {symbol} · {info.name} · {shown.length}</Text></View></View>
      {!shown.length && <Text style={s.empty}>{liveLoading ? t('dex.verifying') : mine ? t('dex.pool.noMyOrders') : t('dex.pool.noOrders', { symbol })}</Text>}
      {visible.map((order) => { const fill = order.fill * 100; const own = walletAddress.toLowerCase() === order.row.owner_address; return <View style={s.position} key={order.row.order_ref}>
        <View style={s.header}><Text style={{ color: order.side === 'buy' ? '#20c997' : '#f05b72', fontWeight: '600' }}>{t(order.side === 'buy' ? 'dex.buy' : 'dex.sell')}</Text><Text style={s.muted}>{order.row.maker.slice(0, 6)}…{order.row.maker.slice(-4)}</Text></View>
        <Text style={[s.white, { marginVertical: 8 }]}>${formatPrice(order.price)}</Text>
        <Text style={s.muted}>{formatSize(order.tokenLeft)} {symbol} · {formatSize(order.usdLeft)} USDC</Text>
        <View style={[s.header, { marginTop: 12 }]}>
          <View style={s.fillWrap}><Text style={s.muted}>{t(order.status === 'Filled' ? 'dex.ready' : order.status === 'In range' ? 'dex.converting' : 'dex.waiting')}{order.status === 'In range' ? ` ${fill < 1 ? '<1' : Math.round(fill)}%` : ''}</Text>{order.status === 'In range' && <View style={s.fillTrack}><View style={[s.fillBar, { width: `${Math.max(2, fill)}%` }]} /></View>}</View>
          {own ? <TouchableOpacity disabled={!!acting || busy} onPress={() => Alert.alert(t(market ? 'dex.withdrawPosition' : 'dex.pool.cancel'), `${formatSize(order.tokenLeft)} ${symbol} · ${formatSize(order.usdLeft)} USDC`, [{ text: t('dex.cancel'), style: 'cancel' }, { text: t(market ? 'dex.withdrawPosition' : 'dex.pool.cancel'), onPress: () => void cancel(order) }])}>
            <Text style={s.link}>{acting === order.row.order_ref ? t('dex.withdrawing') : market ? t('dex.withdrawPosition') : t('dex.pool.cancel')}</Text></TouchableOpacity>
            : <TouchableOpacity onPress={() => void Linking.openURL(info.tx(order.row.tx_hash))}><Text style={s.link}>{t('dex.onchain')}</Text></TouchableOpacity>}
        </View>
      </View>; })}
      {PAGE_SIZE < shown.length && <View style={[s.header, { padding: 14 }]}><TouchableOpacity disabled={!page} onPress={() => setPage(page - 1)}><Text style={s.link}>{t('dex.previous')}</Text></TouchableOpacity><Text style={s.muted}>{page + 1} / {Math.ceil(shown.length / PAGE_SIZE)}</Text><TouchableOpacity disabled={(page + 1) * PAGE_SIZE >= shown.length} onPress={() => setPage(page + 1)}><Text style={s.link}>{t('dex.next')}</Text></TouchableOpacity></View>}
    </View>
  </ScrollView></View>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, content: { padding: 12, paddingBottom: 80 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  muted: { color: '#919ca9', fontSize: 11 },
  white: { color: '#e9edf2', fontSize: 12, fontVariant: ['tabular-nums'] }, darkText: { color: '#061410', fontSize: 12, fontWeight: '700' },
  link: { color: '#b6c4d4', fontSize: 11, textDecorationLine: 'underline' },
  imageButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4, borderWidth: 1, borderColor: '#343e4b' },
  stats: { flexDirection: 'row', gap: 28, paddingVertical: 20 },
  price: { fontSize: 24, fontWeight: '500', color: '#e9edf2', marginTop: 5, fontVariant: ['tabular-nums'] }, statValue: { fontSize: 17, marginTop: 8, color: '#e9edf2' },
  tabs: { flexDirection: 'row', marginBottom: 12 }, tab: { flex: 1, alignItems: 'center', padding: 12, borderBottomWidth: 2, borderColor: 'transparent' }, tabActive: { borderColor: '#e9edf2' },
  panel: { backgroundColor: '#11151b', borderWidth: 1, borderColor: '#252b34', borderRadius: 8, overflow: 'hidden' },
  toolbar: { flexWrap: 'wrap', gap: 8, padding: 12, borderBottomWidth: 1, borderColor: '#252b34', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, smallTab: { paddingVertical: 7, paddingHorizontal: 8, borderRadius: 4 }, selected: { backgroundColor: '#29313b' }, heading: { color: '#e9edf2', fontWeight: '600' },
  note: { color: '#919ca9', fontSize: 10, lineHeight: 16, paddingTop: 12 }, empty: { color: '#919ca9', padding: 30, textAlign: 'center', fontSize: 12 },
  transactions: { borderTopWidth: 1, borderColor: '#252b34' }, transactionHead: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderColor: '#252b34' }, transaction: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderColor: '#1e242c' }, transactionType: { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  bookHead: { flexDirection: 'row', padding: 12 }, cell: { flex: 1, color: '#c5ced8', fontSize: 12, fontVariant: ['tabular-nums'] }, right: { textAlign: 'right' },
  bookRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingHorizontal: 12, paddingVertical: 7, position: 'relative' }, depthBar: { position: 'absolute', right: 0, top: 1, bottom: 1, opacity: .09 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#252b34' }, ratio: { height: 3, margin: 12, backgroundColor: '#f05b72' },
  ticket: { padding: 16 }, side: { flexDirection: 'row', padding: 3, backgroundColor: '#090d12', borderRadius: 6 }, sideButton: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 4 },
  instant: { flex: 1, paddingVertical: 12, borderRadius: 6, alignItems: 'center', borderWidth: 1 }, instantText: { fontWeight: '700', fontSize: 13 },
  field: { marginTop: 18 }, inputWrap: { marginTop: 8, borderColor: '#343e4b', borderWidth: 1, borderRadius: 6, backgroundColor: '#0b0e13', flexDirection: 'row', alignItems: 'center' }, input: { color: '#f4f6f8', flex: 1, padding: 12, fontSize: 16 }, unit: { color: '#919ca9', paddingRight: 12, fontSize: 11 },
  fractions: { flexDirection: 'row', gap: 6, marginTop: 10 }, fraction: { flex: 1, padding: 7, alignItems: 'center', borderColor: '#252b34', borderWidth: 1, borderRadius: 4 },
  summary: { gap: 12, marginVertical: 20 }, submit: { padding: 14, borderRadius: 6, alignItems: 'center', gap: 8, flexDirection: 'row', justifyContent: 'center' },
  alert: { color: '#ff9eac', backgroundColor: '#25151b', borderColor: '#743443', borderWidth: 1, padding: 12, marginVertical: 10, borderRadius: 6, fontSize: 12, lineHeight: 18 },
  position: { padding: 16, borderBottomWidth: 1, borderColor: '#252b34' },
  fillWrap: { flexShrink: 1 }, fillTrack: { width: 88, height: 3, marginTop: 6, borderRadius: 3, backgroundColor: '#252b34', overflow: 'hidden' }, fillBar: { height: 3, backgroundColor: '#20c997' },
});
