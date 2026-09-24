import { appLocale } from '../libs/date.util';
import { dexActionError } from '../libs/dex-action-error';
import { minuteCache, parseSharedMarket, CANDLE_INTERVALS, type SharedMarket, type CandleInterval } from '../libs/dex-live-market';
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
import { DEX_CHAINS, dexProvider, detectDhbChain, detectUsdcChain, mintSell, quoteSell, recoverMint, withdrawSell, type SellInput, type DexChainId, type VerifiedPosition } from '../libs/dex-v4';
import { BOOK_INCREMENTS, DEFAULT_INCREMENT, aggregateBook, balanceFraction, defaultOrderPrice, fillFraction, formatBookPrice, formatIncrement, formatPrice, formatSize, nearestBookLevels, priceDeviation, priceNeedsWarning, seedReference, spreadPercent, type BookLevel } from '../libs/dex-orderbook';
import { readWithTimeout } from '../libs/dex-read-timeout';
import { FUNDING_CHAIN, defaultFundingAsset, fundAndMint, loadFundingAssets, quoteFunding, usdcAmountFor, type FundingAsset, type FundingQuote, type FundingStage, type FundingSymbol } from '../libs/dex-funding';
import { getSigningProvider } from '../libs/provider.registry';
import { prepareWalletForQueuedMint } from '../libs/wallet-signing-preflight';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { toastError, toastSuccess } from '../libs';
import { supabase } from '../services/supabase';
import BuyDhbSheet from '../components/Dpay/BuyDhbSheet';
import DexPoolPicker from '../components/DexPoolPicker';
import DexInstantDhbTrade from '../components/DexInstantDhbTrade';

const PAGE_SIZE = 15;
type CachedPosition = Omit<VerifiedPosition, 'liquidity'> & { liquidity: string };
const readSharedMarket = minuteCache(async () => {
  const { data, error } = await readWithTimeout(Promise.resolve(supabase.rpc('get_dex_market')), 'Shared market');
  if (error) throw error;
  return parseSharedMarket<CachedPosition>(data);
});
/** Sweep the pools for positions opened outside the app now, rather than waiting on the next
 *  scheduled sweep. The endpoint throttles itself, so a burst of these costs nothing, and a
 *  failure is silent: the schedule still runs and the snapshot is what the screen actually reads. */
const primeDiscovery = () => { void Promise.resolve(supabase.functions.invoke('dex-position-scan')).catch(() => {}); };
/** A submitted order. `txHash` is the mint; a funded order may have swapped but not yet minted. */
type Pending = { input: SellInput; txHash?: string; tokenId?: string; funding?: { symbol: FundingSymbol; swapTxHash?: string } };
const BOOK_ROWS = 12;
const storageKey = (wallet: string) => `dex-pending:${wallet.toLowerCase()}`;
const decimalInput = (value: string) => value.replace(',', '.').trim();
type Listed = VerifiedPosition & { created_at?: string; dhb_amount?: number | null; usdc_amount?: number | null };
const listedAt = (item: VerifiedPosition) => Date.parse((item as Listed).created_at || '') || 0;
/** A listing's own price: the ask floor for sells, the bid ceiling for buys. */
const listingPrice = (item: VerifiedPosition) => item.side === 'buy' ? item.maxPrice : item.minPrice;
/** What was deposited, not what the position currently holds after partial conversion. */
const listingSize = (item: VerifiedPosition) => item.side === 'buy'
  ? `${formatSize(Number((item as Listed).usdc_amount ?? item.amountUsdc))} USDC`
  : `${formatSize(Number((item as Listed).dhb_amount ?? item.amountDhb))} DHB`;
function formatWhen(item: VerifiedPosition) {
  const at = listedAt(item);
  if (!at) return '—';
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const explorer = (id: number) => id === ChainId.BASE_MAINNET ? 'https://basescan.org' : 'https://bscscan.com';

export default function DexScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const user = useUser();
  const { chainId: connectedChain, authMethod, provider: sessionProvider } = useProvider();
  const { switchChain } = useAuthActions();
  const sessionProviderRef = useRef(sessionProvider);
  sessionProviderRef.current = sessionProvider;
  const address = user?.walletAddress || user?.address || '';
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [tab, setTab] = useState<'chart' | 'book' | 'trade'>('chart');
  // Base is the only book. The BNB pool takes no new liquidity; positions already in it can
  // still be withdrawn by their owners from My positions.
  const venue: DexChainId = ChainId.BASE_MAINNET;
  const [bnbHeld, setBnbHeld] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [chainId, setChainId] = useState<DexChainId | null>(null);
  const [balance, setBalance] = useState('0');
  const [checking, setChecking] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('0.001');
  const priceTouched = useRef(false);
  const [maxPrice, setMaxPrice] = useState('0.001001');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [stage, setStage] = useState<FundingStage | 'index'>('quote');
  const [assets, setAssets] = useState<FundingAsset[]>([]);
  const [fundingSymbol, setFundingSymbol] = useState<FundingSymbol | null>(null);
  const [fundingQuote, setFundingQuote] = useState<FundingQuote | null>(null);
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
  const [period, setPeriod] = useState<CandleInterval>('1m');
  const [snapshot, setSnapshot] = useState<SharedMarket<CachedPosition> | null>(null);
  const snapshotTime = useRef(0);
  const candles = snapshot?.candles[period] || [];
  const [depth, setDepth] = useState(false);
  const [increment, setIncrement] = useState<number>(DEFAULT_INCREMENT);
  const loadLock = useRef(false);
  const hasSnapshot = useRef(false);
  const token = side === 'buy' ? 'USDC' : 'DHB';
  const locked = busy || !!pending || !!withdrawing;
  const decimals = side === 'sell' ? 18 : DEX_CHAINS[venue].usdcDecimals;
  const venueName = DEX_CHAINS[venue].name;
  // A buy is priced in dollars and can be paid from any Base asset with a USDC route. Sells
  // deposit DHB directly.
  const funded = side === 'buy' && venue === FUNDING_CHAIN;
  const fundingAsset: FundingAsset | null = useMemo(() => funded
    ? (assets.find((a) => a.symbol === fundingSymbol) ?? defaultFundingAsset(assets, Number(amount) || 0)) : null, [funded, assets, fundingSymbol, amount]);
  const fundingLabel = fundingAsset && fundingAsset.symbol !== 'USDC' ? `USD · ${fundingAsset.symbol}` : token;
  const venueListings = useMemo(() => listings.filter((item) => item.chain_id === venue), [listings]);
  // Old BNB positions stay withdrawable, so their owners still see them under My positions.
  const legacyMine = useMemo(() => listings.filter((item) => item.chain_id === ChainId.BSC_MAINNET && item.owner.toLowerCase() === address.toLowerCase())
    .sort((a, b) => listedAt(b) - listedAt(a)), [listings, address]);
  const externalAsks = useMemo(() => snapshot?.externalAsks ?? [], [snapshot]);
  const { bids, asks } = useMemo(() => aggregateBook(venueListings, increment, externalAsks),
    [venueListings, increment, externalAsks]);
  const bestAsk = snapshot?.price ?? null;
  // The cheapest DHB in any pool. lpDhb is inventory across every pool; liquidityUsd is the
  // money side, which is the only thing a seller could actually be paid out of.
  const usdPrice = snapshot?.usdPrice ?? null;
  const liquidityUsd = snapshot?.liquidityUsd ?? null;
  const lpDhb = snapshot?.lpDhb ?? null;
  // Both sides of every pool: the dollar side plus the DHB side valued at the market price.
  const totalLiquidity = liquidityUsd != null ? liquidityUsd + (lpDhb != null && usdPrice != null ? lpDhb * usdPrice : 0) : null;
  const ordered = useMemo(() => [...venueListings].sort((a, b) => listedAt(b) - listedAt(a)), [venueListings]);
  const shown = useMemo(() => mine ? [...ordered.filter((item) => item.owner.toLowerCase() === address.toLowerCase()), ...legacyMine] : ordered, [ordered, mine, address, legacyMine]);
  const visible = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasMorePages = shown.length > PAGE_SIZE;
  const bidTotal = bids.at(-1)?.cumulativeDhb || 0, askTotal = asks.at(-1)?.cumulativeDhb || 0;
  // Pools can disagree: the 0.3% pool's ask floor sometimes sits under the 0% pool's bid ceiling,
  // so the book overlaps and the gap goes negative. That is not a spread, so the row stays blank.
  const gap = bids.length && asks.length ? asks[0].price - bids[0].price : null;
  const spread = gap != null && gap > 0 ? gap : null;
  const transactions = useMemo(() => ordered.slice(0, 8), [ordered]);
  const spreadShare = spread != null ? spreadPercent(bids[0].price, asks[0].price) : null;
  // Only the 0% pool counts: that is the one the ticket mints into, so a 0.3% position's spot
  // price must never seed it.
  const poolPrice = useMemo(() => {
    const live = venueListings.find((item) => item.poolFee === 0 && Number.isFinite(item.marketPrice) && item.marketPrice > 0);
    return live?.marketPrice ?? null;
  }, [venueListings]);
  // The venue's own pool can drift a long way from where DHB trades everywhere else. Anchor
  // the ticket on whichever of the two is safer for the trader, and never on the pool alone.
  const referencePrice = useCallback((next: 'buy' | 'sell') => seedReference(next, poolPrice, usdPrice) ?? bestAsk, [poolPrice, usdPrice, bestAsk]);
  const ticketPrice = Number(side === 'buy' ? maxPrice : minPrice);
  const deviation = priceDeviation(ticketPrice, usdPrice);
  const priceWarning = priceNeedsWarning(side, ticketPrice, usdPrice) && deviation != null
    ? t(side === 'sell' ? 'dex.sellBelowMarket' : 'dex.buyAboveMarket', { percent: Math.abs(deviation * 100).toFixed(1), price: formatPrice(usdPrice) })
    : '';
  const estimate = Number(amount) > 0 && Number(minPrice) > 0 && Number(maxPrice) > Number(minPrice)
    ? side === 'buy' ? Number(amount) / Math.sqrt(Number(minPrice) * Number(maxPrice)) : Number(amount) * Math.sqrt(Number(minPrice) * Number(maxPrice)) : 0;

  useEffect(() => {
    let active = true; setChainId(null); setBalance('0'); setReview(null); setBalanceError(false);
    if (!address) { setChecking(false); return; }
    setChecking(true);
    if (funded) {
      loadFundingAssets(address).then((loaded) => {
        if (!active) return;
        setAssets(loaded);
        const chosen = loaded.find((a) => a.symbol === fundingSymbol) ?? defaultFundingAsset(loaded, Number(amount) || 0);
        setChainId(chosen && chosen.balance > 0n ? FUNDING_CHAIN : null); setBalance(chosen ? chosen.spendableUsd.toFixed(2) : '0');
      }).catch(() => { if (active) setBalanceError(true); }).finally(() => { if (active) setChecking(false); });
      return () => { active = false; };
    }
    (side === 'sell' ? detectDhbChain : detectUsdcChain)(address).then((choice) => {
      if (!active) return;
      // Only a Base balance is spendable here.
      setChainId(Number(choice.base) > 0 ? venue : null); setBalance(choice.base);
    }).catch(() => { if (active) setBalanceError(true); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [address, side, funded, balanceRevision]);
  // BNB cannot fund a Base order, so a holder is offered a direct buy that takes BNB instead.
  useEffect(() => {
    let active = true; setBnbHeld(false);
    if (address) void dexProvider(ChainId.BSC_MAINNET).getBalance(address).then((wei) => { if (active) setBnbHeld(wei.gt(0)); }).catch(() => {});
    return () => { active = false; };
  }, [address, balanceRevision]);
  useEffect(() => {
    if (!funded || !fundingAsset) return;
    setChainId(fundingAsset.balance > 0n ? FUNDING_CHAIN : null); setBalance(fundingAsset.spendableUsd.toFixed(2));
  }, [funded, fundingAsset]);

  useEffect(() => {
    let active = true; setPending(null);
    if (address) void AsyncStorage.getItem(storageKey(address)).then((raw) => {
      const saved = raw ? JSON.parse(raw) as Pending : null;
      if (active && saved?.input.walletAddress.toLowerCase() === address.toLowerCase() &&
          [56, 8453].includes(saved.input.chainId) && (/^0x[0-9a-f]{64}$/i.test(saved.txHash ?? '') || /^0x[0-9a-f]{64}$/i.test(saved.funding?.swapTxHash ?? ''))) setPending(saved);
    }).catch(() => {});
    return () => { active = false; };
  }, [address]);
  const savePending = (value: Pending | null) => {
    setPending(value); const owner = value?.input.walletAddress || address;
    if (owner) void (value ? AsyncStorage.setItem(storageKey(owner), JSON.stringify(value)) : AsyncStorage.removeItem(storageKey(owner))).catch(() => toastError(t('dex.keepOpen')));
  };

  const loadListings = useCallback(async () => {
    if (loadLock.current) return;
    loadLock.current = true;
    try {
      const next = await readSharedMarket();
      if (Date.now() / 1000 - next.observedAt > 180) {
        setListError(!hasSnapshot.current);
      } else setListError(false);
      if (next.observedAt !== snapshotTime.current) {
        snapshotTime.current = next.observedAt;
        setSnapshot(next);
        setListings(next.positions);
        setUpdated(next.observedAt * 1000);
        hasSnapshot.current = true;
      }
    } catch { if (!hasSnapshot.current) setListError(true); }
    finally { setLoading(false); loadLock.current = false; }
  }, []);
  useEffect(() => {
    if (!focused) return;
    void loadListings();
    primeDiscovery();
    // The snapshot is rebuilt once a minute and readSharedMarket caches per clock minute, so
    // polling on a shorter beat picks up each new snapshot sooner without a second fetch for it.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void loadListings();
    }, 15000);
    const resume = AppState.addEventListener('change', (state) => { if (state === 'active') void loadListings(); });
    // The server announces each rebuilt snapshot, so the screen follows the write instead of the
    // poll above, which stays as the fallback for a dropped socket. Only while this screen is up.
    const channel = supabase.channel('dex-market-tick')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dex_market_tick' }, () => {
        readSharedMarket.invalidate();
        void loadListings();
      })
      .subscribe();
    return () => { clearInterval(timer); resume.remove(); void supabase.removeChannel(channel); };
  }, [loadListings, focused]);

  useEffect(() => { setPage((value) => Math.min(value, Math.max(0, Math.ceil(shown.length / PAGE_SIZE) - 1))); }, [shown.length]);

  const seedPrice = useMemo(() => referencePrice(side), [referencePrice, side]);
  useEffect(() => {
    if (priceTouched.current || review || pending || busyRef.current || amount || seedPrice == null) return;
    const value = Number(defaultOrderPrice(side, seedPrice));
    setMinPrice((side === 'buy' ? value * .999 : value).toFixed(8));
    setMaxPrice((side === 'buy' ? value : value * 1.001).toFixed(8));
  }, [seedPrice, side, review, pending, amount]);

  function choosePrice(price: number, next = side) {
    if (locked) return; setSide(next); setReview(null); setFundingQuote(null); setFormError('');
    setMinPrice((next === 'buy' ? price * .999 : price).toFixed(8));
    setMaxPrice((next === 'buy' ? price : price * 1.001).toFixed(8));
  }
  async function register(saved: Pending) {
    setStage('index');
    if (!saved.txHash) throw new Error(t('dex.registrationFailed'));
    const minted = saved.tokenId ? { tokenId: saved.tokenId, txHash: saved.txHash } : await recoverMint(saved.input, saved.txHash);
    savePending({ ...saved, ...minted }); const input = saved.input;
    const { error } = await readWithTimeout(Promise.resolve(withWalletHeader(supabase.from('dex_sell_positions').upsert({
      chain_id: input.chainId, token_id: minted.tokenId, owner_address: input.walletAddress, mint_tx_hash: minted.txHash,
      side: input.side, dhb_amount: input.side === 'sell' ? Number(input.amount) : null, usdc_amount: input.side === 'buy' ? Number(input.amount) : null,
      min_usdc_per_dhb: Number(input.minPrice), max_usdc_per_dhb: Number(input.maxPrice),
    }, { onConflict: 'chain_id,token_id', ignoreDuplicates: true }), input.walletAddress)), 'Listing registration');
    if (error) throw new Error(t('dex.registrationFailed'));
    savePending(null); setAmount(''); setReview(null); setFundingQuote(null); setMine(true); setPage(0); setBalanceRevision((n) => n + 1); priceTouched.current = false;
    toastSuccess(t('dex.created')); await loadListings();
  }
  async function create() {
    if (busyRef.current || checking || withdrawing) return;
    if (!address) { setFormError(t('dex.connectToken', { token })); return; }
    if (!chainId && !pending) { setFormError(t('dex.noFunding', { token, chain: venueName })); return; }
    busyRef.current = true; setBusy(true); setFormError(''); setStage('quote');
    try {
      if (pending) {
        // A funded order that swapped but never minted resumes at the mint; a minted one registers.
        if (pending.funding && !pending.txHash) {
          const asset = assets.find((a) => a.symbol === pending.funding!.symbol);
          if (!asset) throw new Error(t('dex.resumeNeedsBalances'));
          const usdc = usdcAmountFor(pending.input.amount);
          if (!usdc) throw new Error(t('dex.checkAmount'));
          const quote = await quoteFunding(asset, usdc.units);
          setStage('wallet');
          await prepareWalletForQueuedMint(getSigningProvider() || sessionProviderRef.current);
          if (connectedChain !== pending.input.chainId) await readWithTimeout(Promise.resolve(switchChain(pending.input.chainId)), 'Wallet network', 60000);
          const provider = getSigningProvider() || sessionProviderRef.current;
          if (!provider) throw new Error(t('dex.unlockWallet'));
          const minted = await fundAndMint({ input: pending.input, quote }, provider, {
            progress: setStage, resume: { swapTxHash: pending.funding.swapTxHash },
            submitted: (txHash) => savePending({ ...pending, txHash }),
          });
          await register({ ...pending, ...minted });
          return;
        }
        await register(pending); return;
      }
      const toUnits = (value: string) => { try { return ethers.utils.parseUnits(value, decimals); } catch { return null; } };
      const amountUnits = /^\d+(\.\d+)?$/.test(amount) ? toUnits(amount) : null;
      const balanceUnits = toUnits(balance);
      if (!amountUnits || amountUnits.lte(0) || !balanceUnits || amountUnits.gt(balanceUnits)) throw new Error(t('dex.checkAmount'));
      const input: SellInput = { walletAddress: address, chainId: chainId!, side, amount, minPrice, maxPrice };
      if (funded && fundingAsset) {
        if (!review || !fundingQuote) {
          // Price the swap first: a route that cannot cover the order is a cheaper failure than a pool read.
          const quote = await quoteFunding(fundingAsset, BigInt(amountUnits.toString()));
          setFundingQuote(quote);
          setReview(await quoteSell(input));
          return;
        }
        setStage('wallet');
        await prepareWalletForQueuedMint(getSigningProvider() || sessionProviderRef.current);
        if (connectedChain !== chainId) await readWithTimeout(Promise.resolve(switchChain(chainId!)), 'Wallet network', 60000);
        const provider = getSigningProvider() || sessionProviderRef.current;
        if (!provider) throw new Error(t('dex.unlockWallet'));
        const funding = { symbol: fundingAsset.symbol };
        const minted = await fundAndMint({ input, quote: fundingQuote }, provider, {
          progress: setStage,
          swapped: (swapTxHash) => savePending({ input, funding: { ...funding, swapTxHash } }),
          submitted: (txHash) => savePending({ input, txHash, funding }),
        });
        await register({ input, funding, ...minted });
        return;
      }
      if (!review) { setReview(await quoteSell(input)); return; }
      setStage('wallet');
      await prepareWalletForQueuedMint(getSigningProvider() || sessionProviderRef.current);
      if (connectedChain !== chainId) await readWithTimeout(Promise.resolve(switchChain(chainId!)), 'Wallet network', 60000);
      const provider = getSigningProvider() || sessionProviderRef.current;
      if (!provider) throw new Error(t('dex.unlockWallet'));
      const minted = await mintSell(input, provider, setStage, (txHash) => savePending({ input, txHash }));
      await register({ input, ...minted });
    } catch (error) { if ((error as { code?: string }).code === 'DEX_REVERTED') { savePending(null); setReview(null); setFundingQuote(null); } setFormError(dexActionError(error)); }
    finally { setBusy(false); busyRef.current = false; }
  }
  async function withdraw(item: VerifiedPosition) {
    if (!address || locked) return;
    setWithdrawing(`${item.chain_id}:${item.token_id}`);
    try {
      await prepareWalletForQueuedMint(getSigningProvider() || sessionProviderRef.current);
      if (connectedChain !== item.chain_id) await readWithTimeout(Promise.resolve(switchChain(item.chain_id)), 'Wallet network', 60000);
      const provider = getSigningProvider() || sessionProviderRef.current; if (!provider) throw new Error(t('dex.unlockWallet'));
      await withdrawSell(item, address, provider); toastSuccess(t('dex.withdrawn'));
      await loadListings(); setBalanceRevision((n) => n + 1);
    } catch (error) { toastError(dexActionError(error)); }
    finally { setWithdrawing(null); }
  }
  const field = (label: string, value: string, setValue: (value: string) => void, unit: string) => <View style={s.field}><Text style={s.muted}>{label}</Text><View style={s.inputWrap}><TextInput accessibilityLabel={label} editable={!locked} value={value} keyboardType="decimal-pad" onChangeText={(next) => { setValue(next); setReview(null); }} style={s.input} placeholder="0.00" placeholderTextColor="#596675" /><Text style={s.unit}>{unit}</Text></View></View>;
  const book = (levels: BookLevel[], bid: boolean) => <View><Text style={[s.bookLabel, { color: bid ? '#20c997' : '#f05b72' }]}>{t(bid ? 'dex.bids' : 'dex.asks')}</Text>{!levels.length ? <Text style={s.empty}>{t(bid ? 'dex.noBids' : 'dex.noOrders')}</Text> : nearestBookLevels(levels, bid, BOOK_ROWS).map((level) => <TouchableOpacity accessibilityLabel={t('dex.usePrice', { price: formatBookPrice(level.price, increment) })} disabled={locked} key={level.price} onPress={() => { priceTouched.current = true; choosePrice(level.price, bid ? 'buy' : 'sell'); setTab('trade'); }} hitSlop={{ top: 4, bottom: 4 }} style={s.bookRow}><View pointerEvents="none" style={[s.depthBar, { width: `${level.cumulativeDhb / (levels.at(-1)?.cumulativeDhb || 1) * 100}%`, backgroundColor: bid ? '#20c997' : '#f05b72' }]} /><Text style={[s.cell, { color: bid ? '#20c997' : '#f05b72' }]}>{formatBookPrice(level.price, increment)}</Text><Text style={[s.cell, s.right]}>{formatSize(level.dhb)}</Text><Text style={[s.cell, s.right]}>{formatSize(level.cumulativeDhb)}</Text></TouchableOpacity>)}</View>;

  return <View style={s.root}><ScreenHeader title={t('dex.title')} onBackPress={() => navigation.goBack()} /><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.header}><DexPoolPicker current={null} /><TouchableOpacity disabled={loading || busy} onPress={() => { primeDiscovery(); void loadListings(); setBalanceRevision((n) => n + 1); }}><Text style={s.link}>{t(loading ? 'dex.updating' : 'dex.refresh')}</Text></TouchableOpacity></View>
    <View style={s.stats}><View><Text style={s.muted}>{t('dex.marketPrice')}</Text><Text style={s.price}>{usdPrice != null ? `${formatPrice(usdPrice)}` : '—'}</Text></View><View><Text style={s.muted}>{t('dex.bookPrice', { chain: venueName })}</Text><Text style={s.statValue}>{poolPrice != null ? `${formatPrice(poolPrice)}` : '—'}</Text></View><View><Text style={s.muted}>{t('dex.sharedChange24', { defaultValue: '24h change' })}</Text><Text style={[s.statValue, { color: (snapshot?.change24h || 0) >= 0 ? '#20c997' : '#f05b72' }]}>{snapshot?.change24h != null ? `${snapshot.change24h >= 0 ? '+' : ''}${snapshot.change24h.toFixed(2)}%` : '—'}</Text></View><View><Text style={s.muted}>{t('dex.totalLiquidity')}</Text><Text style={s.statValue}>{totalLiquidity != null ? `$${formatSize(totalLiquidity)}` : '—'}</Text></View><View><Text style={s.muted}>{t('dex.lpDhb', { defaultValue: 'LP · DHB' })}</Text><Text style={s.statValue}>{lpDhb != null ? formatSize(lpDhb) : '—'}</Text></View><View><Text style={s.muted}>{t('dex.lpUsd', { defaultValue: 'LP · USD' })}</Text><Text style={s.statValue}>{liquidityUsd != null ? `$${formatSize(liquidityUsd)}` : '—'}</Text></View></View>
    {listError && <Text style={s.alert}>{t('dex.snapshotError')}</Text>}
    <View style={s.tabs}>{(['chart', 'book', 'trade'] as const).map((value) => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[s.tab, tab === value && s.tabActive]}><Text style={tab === value ? s.white : s.muted}>{t(`dex.tab.${value}`)}</Text></TouchableOpacity>)}</View>
    {tab === 'chart' && <View style={s.panel}><View style={s.toolbar}><View style={s.inline}>{[false, true].map((value) => <TouchableOpacity key={String(value)} style={[s.smallTab, depth === value && s.selected]} onPress={() => setDepth(value)}><Text style={s.white}>{t(value ? 'dex.depth' : 'dex.price')}</Text></TouchableOpacity>)}</View>{!depth && <View style={s.inline}>{CANDLE_INTERVALS.map((value) => <TouchableOpacity style={[s.smallTab, period === value && s.selected]} key={value} onPress={() => setPeriod(value)}><Text style={s.white}>{value}</Text></TouchableOpacity>)}</View>}</View>
      {!depth && loading && !updated ? <ActivityIndicator style={{ height: 250 }} color="#20c997" /> : <DexMarketChart candles={candles} bids={bids} asks={asks} depth={depth} />}
      <View style={s.transactions}><View style={s.transactionHead}><Text style={s.muted}>{t('commandCentre.recentTransactions')}</Text></View>{transactions.length ? transactions.map((item) => <TouchableOpacity key={`${item.chain_id}:${item.token_id}`} style={s.transaction} onPress={() => void Linking.openURL(`${explorer(item.chain_id)}/tx/${item.mint_tx_hash}`)}><View><Text style={[s.transactionType, { color: item.side === 'buy' ? '#20c997' : '#f05b72' }]}>{item.side === 'buy' ? 'Buy' : 'Sell'} <Text style={s.white}>{listingSize(item)}</Text></Text><Text style={s.muted}>${formatPrice(listingPrice(item))} · {DEX_CHAINS[item.chain_id as DexChainId].name}</Text></View><Text style={s.muted}>{formatWhen(item)}</Text></TouchableOpacity>) : <Text style={s.empty}>{t('commandCentre.noTransactionsYet')}</Text>}</View>
    </View>}
    {tab === 'book' && <View style={s.panel}><View style={s.toolbar}><Text style={s.heading}>{t('dex.orderBook')}</Text><TouchableOpacity accessibilityLabel={t('dex.price')} onPress={() => setIncrement((value) => BOOK_INCREMENTS[(BOOK_INCREMENTS.indexOf(value as typeof BOOK_INCREMENTS[number]) + 1) % BOOK_INCREMENTS.length])}><Text style={s.muted}>{formatIncrement(increment)}</Text></TouchableOpacity></View><View style={s.bookHead}><Text style={[s.cell, s.muted]}>{t('dex.price')}</Text><Text style={[s.cell, s.muted, s.right]}>DHB</Text><Text style={[s.cell, s.muted, s.right]}>{t('dex.totalDhb')}</Text></View>{book(asks, false)}<View style={s.spread}><Text style={s.muted}>{t('dex.spread')}</Text><Text style={s.white}>{spread == null ? '—' : formatBookPrice(spread, increment)} USD{spreadShare != null ? ` · ${spreadShare.toFixed(2)}%` : ''}</Text></View>{book(bids, true)}<View style={s.ratio}><View style={{ width: `${bidTotal + askTotal ? bidTotal / (bidTotal + askTotal) * 100 : 50}%`, height: 3, backgroundColor: '#20c997' }} /></View></View>}
    {tab === 'trade' && <View style={[s.panel, s.ticket]}><DexInstantDhbTrade address={address} disabled={locked} onDone={() => setBalanceRevision((n) => n + 1)} /><View style={s.side}>{(['buy', 'sell'] as const).map((value) => <TouchableOpacity disabled={locked} key={value} onPress={() => { setAmount(''); priceTouched.current = false; choosePrice(Number(defaultOrderPrice(value, referencePrice(value))), value); }} style={[s.sideButton, side === value && { backgroundColor: value === 'buy' ? '#20c997' : '#f05b72' }]}><Text style={side === value ? s.darkText : s.muted}>{t(value === 'buy' ? 'dex.buy' : 'dex.sell')}</Text></TouchableOpacity>)}</View>
      {field(t(side === 'buy' ? 'dex.maxBuy' : 'dex.minSell'), side === 'buy' ? maxPrice : minPrice, (raw) => { const value = decimalInput(raw); priceTouched.current = true; if (side === 'buy') { setMaxPrice(value); if (Number(value) > 0) setMinPrice((Number(value) * .999).toFixed(8)); } else { setMinPrice(value); if (Number(value) > 0) setMaxPrice((Number(value) * 1.001).toFixed(8)); } }, 'USD')}
      {!!priceWarning && <View style={s.warning}><Text style={s.warningText}>{priceWarning}</Text><TouchableOpacity disabled={locked} onPress={() => { priceTouched.current = false; if (seedPrice != null) choosePrice(Number(defaultOrderPrice(side, seedPrice))); }}><Text style={s.link}>{t('dex.useMarket')}</Text></TouchableOpacity></View>}
      {funded && <View style={s.field}><Text style={s.muted}>{t('dex.payWith')}</Text><View style={[s.inline, { marginTop: 8 }]}>{assets.map((asset) => <TouchableOpacity key={asset.symbol} disabled={locked} accessibilityRole="tab" accessibilityState={{ selected: fundingAsset?.symbol === asset.symbol }} style={[s.smallTab, fundingAsset?.symbol === asset.symbol && s.selected]} onPress={() => { setFundingSymbol(asset.symbol); setReview(null); setFundingQuote(null); }}><Text style={fundingAsset?.symbol === asset.symbol ? s.white : s.muted}>{asset.symbol} · ${asset.usd.toLocaleString(appLocale(), { maximumFractionDigits: 2 })}</Text></TouchableOpacity>)}{!assets.length && !checking && <Text style={s.muted}>{t('dex.noBaseFunds')}</Text>}</View></View>}
      {field(t('dex.amountToken', { token: funded ? 'USD' : token }), amount, (raw) => { setAmount(decimalInput(raw)); setFundingQuote(null); }, fundingLabel)}<View style={s.header}><Text style={s.muted}>{t('dex.available')}</Text><Text style={s.white}>{checking ? t('dex.checking') : funded ? `${formatSize(Number(balance))}${fundingAsset && fundingAsset.symbol !== 'USDC' ? ` · ${fundingAsset.symbol}` : ''}` : `${formatSize(Number(balance))} ${token}`}</Text></View><View style={s.fractions}>{[25, 50, 75, 100].map((percent) => <TouchableOpacity disabled={locked || checking || !chainId} style={s.fraction} key={percent} onPress={() => { setAmount(balanceFraction(balance, percent, decimals)); setReview(null); setFundingQuote(null); }}><Text style={s.muted}>{percent === 100 ? t('dex.max') : `${percent}%`}</Text></TouchableOpacity>)}</View>
      <TouchableOpacity onPress={() => setAdvanced(!advanced)}><Text style={[s.link, { marginTop: 20 }]}>{t('dex.adjustRange')}</Text></TouchableOpacity>{advanced && <>{field(t('dex.minimum'), minPrice, (raw) => { priceTouched.current = true; setMinPrice(decimalInput(raw)); }, 'USD')}{field(t('dex.maximum'), maxPrice, (raw) => { priceTouched.current = true; setMaxPrice(decimalInput(raw)); }, 'USD')}</>}
      <View style={s.summary}><View style={s.header}><Text style={s.muted}>{t('dex.estimated')}</Text><Text style={s.white}>{formatSize(estimate)} {side === 'buy' ? 'DHB' : 'USDC'}</Text></View><View style={s.header}><Text style={s.muted}>{t('dex.network')}</Text><Text style={s.white}>{venueName}</Text></View><Text style={s.muted}>{t('dex.feeNote')}</Text></View>
      {side === 'buy' && bnbHeld && !pending && <View style={s.field}><Text style={s.muted}>{t('dex.buyWithBnbNote')}</Text><TouchableOpacity disabled={busy} accessibilityRole="button" style={[s.smallTab, s.selected, { marginTop: 8, alignSelf: 'flex-start' }]} onPress={() => setBuyOpen(true)}><Text style={s.white}>{t('dex.buyWithBnb')}</Text></TouchableOpacity></View>}
      {balanceError && <TouchableOpacity disabled={busy} onPress={() => setBalanceRevision((n) => n + 1)}><Text style={s.alert}>{t('dex.balanceError')}</Text></TouchableOpacity>}
      {!!review && !pending && <Text style={s.review}>{fundingQuote && fundingQuote.asset.symbol !== 'USDC' ? `${t('dex.reviewSwap', { amountIn: formatSize(Number(ethers.utils.formatUnits(fundingQuote.amountIn.toString(), fundingQuote.asset.decimals))), symbol: fundingQuote.asset.symbol, usdc: amount })} ` : ''}{t('dex.reviewToken', { amount, token, chain: chainId ? DEX_CHAINS[chainId].name : '', minPrice, maxPrice })}{priceWarning ? ` ${priceWarning}` : ''}{review.createPool ? ` ${t('dex.initializes')}` : ''}</Text>}
      {!!pending && <TouchableOpacity onPress={() => void Linking.openURL(`${explorer(pending.input.chainId)}/tx/${pending.txHash ?? pending.funding?.swapTxHash}`)}><Text style={s.review}>{pending.txHash ? t('dex.pendingNote') : t('dex.pendingSwapNote', { symbol: pending.funding?.symbol ?? '' })}</Text></TouchableOpacity>}
      {!!formError && <Text accessibilityRole="alert" style={s.alert}>{formError}</Text>}
      <TouchableOpacity disabled={busy || checking || !!withdrawing || (!chainId && !pending)} onPress={() => void create()} style={[s.submit, { backgroundColor: side === 'buy' ? '#20c997' : '#f05b72', opacity: busy || checking || (!chainId && !pending) ? .5 : 1 }]}>{busy && <ActivityIndicator color="#061410" />}<Text style={s.darkText}>{busy ? t(`dex.${authMethod === 'local' && ['tokenApproval', 'permitApproval', 'submit'].includes(stage) ? 'automaticStage' : 'stage'}.${stage}`) : pending ? t(pending.txHash ? 'dex.resume' : 'dex.resumeMint') : review ? t('dex.approve') : t('dex.review')}</Text></TouchableOpacity><Text style={s.note}>{t('dex.reversalNote')}</Text>
    </View>}
    <View style={[s.panel, { marginTop: 18 }]}><View style={s.toolbar}><View style={s.inline}>{[false, true].map((value) => <TouchableOpacity key={String(value)} style={[s.smallTab, mine === value && s.selected]} onPress={() => { setMine(value); setPage(0); }}><Text style={s.white}>{t(value ? 'dex.myPositions' : 'dex.allListings')}</Text></TouchableOpacity>)}</View><Text style={s.muted}>{shown.length}</Text></View>
      {!shown.length && <Text style={s.empty}>{t(loading ? 'dex.verifying' : mine ? 'dex.noMyPositions' : 'dex.noListingsChain', { chain: venueName })}</Text>}
      {visible.map((item) => <View style={s.position} key={`${item.chain_id}:${item.token_id}`}><View style={s.header}><Text style={{ color: item.side === 'buy' ? '#20c997' : '#f05b72', fontWeight: '600' }}>{t(item.side === 'buy' ? 'dex.buy' : 'dex.sell')}</Text><Text style={s.muted}>{DEX_CHAINS[item.chain_id as DexChainId].name}</Text></View><Text style={[s.white, { marginVertical: 8 }]}>${formatPrice(item.minPrice)} – ${formatPrice(item.maxPrice)}</Text><Text style={s.muted}>{formatSize(item.amountDhb)} DHB · {formatSize(item.amountUsdc)} USDC</Text><View style={[s.header, { marginTop: 12 }]}><View style={s.fillWrap}><Text style={s.muted}>{t(item.status === 'Filled' ? 'dex.ready' : item.status === 'In range' ? 'dex.converting' : 'dex.waiting')}{item.status === 'In range' ? ` ${fillFraction(item) * 100 < 1 ? '<1' : Math.round(fillFraction(item) * 100)}%` : ''}</Text>{item.status === 'In range' && <View style={s.fillTrack}><View style={[s.fillBar, { width: `${Math.max(2, fillFraction(item) * 100)}%` }]} /></View>}</View>{address.toLowerCase() === item.owner.toLowerCase() ? <TouchableOpacity disabled={locked} onPress={() => Alert.alert(t('dex.withdrawPosition'), t('dex.withdrawReview', { dhb: formatSize(item.amountDhb), usdc: formatSize(item.amountUsdc), chain: DEX_CHAINS[item.chain_id as DexChainId].name }), [{ text: t('dex.cancel'), style: 'cancel' }, { text: t('dex.withdrawPosition'), onPress: () => void withdraw(item) }])}><Text style={s.link}>{t(withdrawing === `${item.chain_id}:${item.token_id}` ? 'dex.withdrawing' : 'dex.withdrawPosition')}</Text></TouchableOpacity> : <TouchableOpacity onPress={() => void Linking.openURL(`${explorer(item.chain_id)}/tx/${item.mint_tx_hash}`)}><Text style={s.link}>{t('dex.onchain')}</Text></TouchableOpacity>}</View></View>)}
      {hasMorePages && <View style={[s.header, { padding: 14 }]}><TouchableOpacity disabled={!page} onPress={() => setPage(page - 1)}><Text style={s.link}>{t('dex.previous')}</Text></TouchableOpacity><Text style={s.muted}>{page + 1} / {Math.ceil(shown.length / PAGE_SIZE)}</Text><TouchableOpacity disabled={(page + 1) * PAGE_SIZE >= shown.length} onPress={() => setPage(page + 1)}><Text style={s.link}>{t('dex.next')}</Text></TouchableOpacity></View>}
    </View>
  </ScrollView>
  <BuyDhbSheet visible={buyOpen} initialMethod="crypto" onClose={() => { setBuyOpen(false); setBalanceRevision((n) => n + 1); }} />
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, content: { padding: 12, paddingBottom: 80 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  poolPicker: { position: 'relative' }, pair: { color: '#edf1f6', fontSize: 23, fontWeight: '600', marginBottom: 4 }, chevron: { color: '#919ca9', fontSize: 18, marginTop: -5 },
  muted: { color: '#919ca9', fontSize: 11 },
  white: { color: '#e9edf2', fontSize: 12, fontVariant: ['tabular-nums'] }, darkText: { color: '#061410', fontSize: 12, fontWeight: '700' },
  link: { color: '#b6c4d4', fontSize: 11, textDecorationLine: 'underline' }, stats: { flexDirection: 'row', gap: 32, paddingVertical: 20 },
  price: { fontSize: 24, fontWeight: '500', color: '#e9edf2', marginTop: 5, fontVariant: ['tabular-nums'] }, statValue: { fontSize: 17, marginTop: 8 },
  tabs: { flexDirection: 'row', marginBottom: 12 }, tab: { flex: 1, alignItems: 'center', padding: 12, borderBottomWidth: 2, borderColor: 'transparent' }, tabActive: { borderColor: '#e9edf2' },
  panel: { backgroundColor: '#11151b', borderWidth: 1, borderColor: '#252b34', borderRadius: 8, overflow: 'hidden' },
  toolbar: { flexWrap: 'wrap', gap: 8, padding: 12, borderBottomWidth: 1, borderColor: '#252b34', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, smallTab: { paddingVertical: 7, paddingHorizontal: 8, borderRadius: 4 }, selected: { backgroundColor: '#29313b' }, heading: { color: '#e9edf2', fontWeight: '600' },
  note: { color: '#919ca9', fontSize: 10, lineHeight: 16, padding: 12 }, empty: { color: '#919ca9', padding: 30, textAlign: 'center', fontSize: 12 }, emptyWrap: { minHeight: 240, alignItems: 'center', justifyContent: 'center' }, transactions: { borderTopWidth: 1, borderColor: '#252b34', maxHeight: 190 }, transactionHead: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderColor: '#252b34' }, transaction: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderColor: '#1e242c' }, transactionType: { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  bookHead: { flexDirection: 'row', padding: 12 }, cell: { flex: 1, color: '#c5ced8', fontSize: 12, fontVariant: ['tabular-nums'] }, right: { textAlign: 'right' },
  bookLabel: { padding: 12, paddingBottom: 6, fontSize: 10 }, bookRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingHorizontal: 12, paddingVertical: 7, position: 'relative' }, depthBar: { position: 'absolute', right: 0, top: 1, bottom: 1, opacity: .09 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#252b34' }, ratio: { height: 3, margin: 12, backgroundColor: '#f05b72' },
  ticket: { padding: 16 }, side: { flexDirection: 'row', padding: 3, backgroundColor: '#090d12', borderRadius: 6 }, sideButton: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 4 },
  field: { marginTop: 18 }, inputWrap: { marginTop: 8, borderColor: '#343e4b', borderWidth: 1, borderRadius: 6, backgroundColor: '#0b0e13', flexDirection: 'row', alignItems: 'center' }, input: { color: '#f4f6f8', flex: 1, padding: 12, fontSize: 16 }, unit: { color: '#919ca9', paddingRight: 12, fontSize: 11 },
  fractions: { flexDirection: 'row', gap: 6, marginTop: 10 }, fraction: { flex: 1, padding: 7, alignItems: 'center', borderColor: '#252b34', borderWidth: 1, borderRadius: 4 },
  summary: { gap: 12, marginVertical: 20 }, submit: { padding: 14, borderRadius: 6, alignItems: 'center', gap: 8 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#251e16', borderColor: '#705436', borderWidth: 1, padding: 10, marginBottom: 6, borderRadius: 6 }, warningText: { flex: 1, color: '#edc992', fontSize: 11, lineHeight: 16 },
  alert: { color: '#ff9eac', backgroundColor: '#25151b', borderColor: '#743443', borderWidth: 1, padding: 12, marginVertical: 10, borderRadius: 6, fontSize: 12, lineHeight: 18 },
  review: { color: '#d2e4ee', backgroundColor: '#132028', borderColor: '#3c5661', borderWidth: 1, padding: 12, marginVertical: 12, borderRadius: 6, fontSize: 11, lineHeight: 18 },
  position: { padding: 16, borderBottomWidth: 1, borderColor: '#252b34' },
  fillWrap: { flexShrink: 1 }, fillTrack: { width: 88, height: 3, marginTop: 6, borderRadius: 3, backgroundColor: '#252b34', overflow: 'hidden' }, fillBar: { height: 3, backgroundColor: '#20c997' },
});
