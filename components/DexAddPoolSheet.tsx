import { appLocale } from '../libs/date.util';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SmartImage from './common/SmartImage';
import { useTranslation } from 'react-i18next';
import GlassModal from './ui/GlassModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '../context/AuthContext';
import { ChainId } from '../config/constants';
import { useDexSigner } from '../hooks/useDexSigner';
import { runWithPermissions } from '../libs/permissions.util';
import { toastSuccess } from '../libs';
import { dexActionError } from '../libs/dex-action-error';
import { formatSize } from '../libs/dex-orderbook';
import AddressInputTools from './common/AddressInputTools';
import {
  FEE_ASSETS, POOL_CHAINS, POOL_CHAIN_INFO, POOL_FEE_USD, checkToken, createPool, fetchUsdPrices, isAcceptedPoolImage, isTokenAddress,
  loadFeeBalances, payFee, planFee, uploadPoolImage,
  type DexPool, type FeeAssetSymbol, type FeeBalance, type PickedImage, type PoolChain, type TokenCheck,
} from '../libs/dex-pools';

const DEHUB_COIN = require('../assets/web-icons/dehub-coin.png');

/** A fee that was paid but whose pool was not saved yet; retried with the same transfer. */
type PaidFee = { chain: PoolChain; tokenAddress: string; txHash: string; imageUrl: string | null; wallet: string };
const paidKey = (wallet: string) => `dex-pool-fee-paid:${wallet.toLowerCase()}`;

export default function DexAddPoolSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (pool: DexPool) => void }) {
  const { t } = useTranslation();
  const user = useUser();
  const walletAddress = user?.walletAddress || user?.address || '';
  const signer = useDexSigner();
  const queryClient = useQueryClient();
  const [chain, setChain] = useState<PoolChain>('base');
  const [address, setAddress] = useState('');
  const [check, setCheck] = useState<TokenCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [payWith, setPayWith] = useState<FeeAssetSymbol | null>(null);
  const [busy, setBusy] = useState<'' | 'upload' | 'quote' | 'pay' | 'create'>('');
  const [paid, setPaid] = useState<PaidFee | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [balances, setBalances] = useState<FeeBalance[]>([]);

  const writePaid = (value: PaidFee | null) => {
    setPaid(value);
    if (!walletAddress) return;
    void (value ? AsyncStorage.setItem(paidKey(walletAddress), JSON.stringify(value)) : AsyncStorage.removeItem(paidKey(walletAddress))).catch(() => { /* the hash is also on chain */ });
  };

  useEffect(() => {
    if (!visible) { setError(''); return; }
    let live = true;
    void fetchUsdPrices().then((next) => { if (live) setPrices(next); });
    if (walletAddress) void AsyncStorage.getItem(paidKey(walletAddress)).then((raw) => {
      const saved = raw ? JSON.parse(raw) as PaidFee : null;
      if (!live || !saved || saved.wallet !== walletAddress.toLowerCase()) return;
      setPaid(saved); setChain(saved.chain); setAddress(saved.tokenAddress);
    }).catch(() => {});
    return () => { live = false; };
  }, [visible, walletAddress]);

  // Look the token up as soon as the address is well formed.
  useEffect(() => {
    setCheck(null); setError('');
    if (!visible || !isTokenAddress(chain, address)) return;
    let live = true;
    setChecking(true);
    checkToken(chain, address).then((result) => { if (live) setCheck(result); })
      .catch((e) => { if (live) setError(dexActionError(e, t('dex.pools.lookupFailed'))); })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [chain, address, visible, t]);

  const dhbUsd = check?.dhbUsd ?? (prices.DHB || null);
  const feeDhb = check?.feeDhb ?? (dhbUsd ? Math.ceil(POOL_FEE_USD / dhbUsd) : null);
  const priceOf = (symbol: FeeAssetSymbol) => symbol === 'DHB' ? dhbUsd ?? 0 : symbol === 'USDC' || symbol === 'USDT' ? 1 : Number(prices[symbol] ?? 0);

  useEffect(() => {
    if (!visible || !walletAddress) { setBalances([]); return; }
    let live = true;
    void loadFeeBalances(walletAddress, prices, dhbUsd).then((next) => { if (live) setBalances(next); }).catch(() => {});
    return () => { live = false; };
  }, [visible, walletAddress, prices, dhbUsd]);

  // DHB when it covers the fee; otherwise whatever holds the most dollars.
  const defaultAsset = useMemo<FeeAssetSymbol>(() => {
    const dhb = balances.find((b) => b.asset.symbol === 'DHB');
    if (dhb && feeDhb && dhb.amount >= feeDhb) return 'DHB';
    return [...balances].filter((b) => b.asset.symbol !== 'DHB').sort((a, b) => b.usd - a.usd)[0]?.asset.symbol ?? 'DHB';
  }, [balances, feeDhb]);
  const selected = payWith ?? defaultAsset;
  const selectedBalance = balances.find((b) => b.asset.symbol === selected);
  const covers = selected === 'DHB' ? !!feeDhb && (selectedBalance?.amount ?? 0) >= feeDhb : (selectedBalance?.usd ?? 0) >= POOL_FEE_USD * 1.04;

  async function pickImage() {
    await runWithPermissions(['photos'], async () => {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true, aspect: [1, 1] });
      if (pick.canceled || !pick.assets?.[0]?.uri) return;
      const asset = pick.assets[0];
      const next: PickedImage = { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize };
      if (!isAcceptedPoolImage(next)) { setError(t('dex.pools.imageRules')); return; }
      setImage(next);
    });
  }

  async function submit() {
    if (!walletAddress) { setError(t('dex.connectWallet')); return; }
    if (!check || check.exists) return;
    setError('');
    try {
      let imageUrl = paid?.imageUrl ?? null;
      if (image && !paid) { setBusy('upload'); imageUrl = await uploadPoolImage(image); }
      let txHash = paid?.txHash;
      if (!txHash) {
        if (!feeDhb) throw new Error(t('dex.pools.priceUnavailable'));
        setBusy('quote');
        const asset = FEE_ASSETS.find((a) => a.symbol === selected)!;
        const plan = await planFee(asset, feeDhb, priceOf(selected), walletAddress);
        setBusy('pay');
        const provider = await signer(ChainId.BASE_MAINNET, t('dex.unlockWallet'));
        txHash = await payFee(plan, provider, walletAddress);
        writePaid({ chain, tokenAddress: address.trim(), txHash, imageUrl, wallet: walletAddress.toLowerCase() });
      }
      setBusy('create');
      const pool = await createPool({ chain, tokenAddress: address.trim(), txHash, imageUrl }, walletAddress);
      writePaid(null);
      await queryClient.invalidateQueries({ queryKey: ['dex-pools'] });
      toastSuccess(t('dex.pools.created', { symbol: pool.symbol }));
      onClose(); setAddress(''); setImage(null); setCheck(null);
      onCreated(pool);
    } catch (e) {
      setError(dexActionError(e, t('dex.pools.createFailed')));
    } finally { setBusy(''); }
  }

  const tokenImage = image?.uri ?? check?.token?.imageUrl ?? null;
  const busyLabel = { '': '', upload: t('dex.pools.uploading'), quote: t('dex.pools.quoting'), pay: t('dex.pools.paying'), create: t('dex.pools.opening') }[busy];
  const locked = !!busy || !!paid;
  const disabled = !!busy || !check?.token || !!check?.exists || (!!walletAddress && !paid && !covers);

  // Closing mid-payment would hide a fee transfer that is still in flight.
  return <GlassModal visible={visible} onClose={() => { if (!busy) onClose(); }} dismissible={!busy} presentation="bottom" maxHeight="92%" scrollable>
          <View style={s.sheet}>
            <Text style={s.title}>{t('dex.pools.addTitle')}</Text>
            <Text style={s.muted}>{t('dex.pools.addDescription')}</Text>
            <Text style={[s.muted, s.label]}>{t('dex.pools.network')}</Text>
            <View style={s.chips}>{POOL_CHAINS.map((value) => <TouchableOpacity key={value} disabled={locked} accessibilityRole="radio" accessibilityState={{ selected: chain === value }} style={[s.chip, chain === value && s.chipActive]} onPress={() => setChain(value)}>
              <Text style={chain === value ? s.white : s.muted}>{POOL_CHAIN_INFO[value].name}</Text></TouchableOpacity>)}</View>
            <Text style={[s.muted, s.label]}>{t('dex.pools.contract')}</Text>
            <TextInput editable={!locked} accessibilityLabel={t('dex.pools.contract')} placeholder={chain === 'solana' ? t('dex.pools.mintPlaceholder') : '0x…'} placeholderTextColor="#596675"
              value={address} onChangeText={(v) => setAddress(v.trim())} autoCapitalize="none" autoCorrect={false} spellCheck={false} style={s.input} />
            <AddressInputTools disabled={locked} onValue={(v) => setAddress(v.trim())} />
            {checking && <View style={s.inline}><ActivityIndicator size="small" color="#20c997" /><Text style={s.muted}>{t('dex.pools.lookingUp')}</Text></View>}
            {check?.exists && check.pool && <View style={s.review}><Text style={s.reviewText}>{t('dex.pools.exists', { symbol: check.pool.symbol })}</Text>
              <TouchableOpacity onPress={() => { onClose(); onCreated(check.pool!); }}><Text style={s.link}>{t('dex.pools.openExisting')}</Text></TouchableOpacity></View>}
            {check?.token && !check.exists && <>
              <View style={s.preview}>
                <TouchableOpacity disabled={locked} accessibilityRole="button" accessibilityLabel={t('dex.pools.setImage')} onPress={() => void pickImage()} style={s.tokenImage}>
                  {tokenImage ? <SmartImage source={{ uri: tokenImage }} recyclingKey={tokenImage} style={s.tokenImageFill} /> : <Text style={s.plus}>+</Text>}
                </TouchableOpacity>
                <View style={s.flex}>
                  <Text style={s.white}>{check.token.name}</Text>
                  <Text style={s.muted}>{check.token.symbol} · {POOL_CHAIN_INFO[chain].name}{check.token.priceUsd ? ` · $${check.token.priceUsd.toPrecision(4)}` : ''}</Text>
                  <Text style={s.muted}>{t('dex.pools.imageHint')}</Text>
                </View>
              </View>
              <View style={s.fee}>
                <Image source={DEHUB_COIN} style={s.coin} />
                <View style={s.flex}><Text style={s.feeUsd}>${POOL_FEE_USD}</Text><Text style={s.muted}>{feeDhb ? t('dex.pools.feeDhb', { amount: formatSize(feeDhb) }) : t('dex.pools.priceUnavailable')}</Text></View>
              </View>
              {!paid && <><Text style={[s.muted, s.label]}>{t('dex.payWith')}</Text>
                <View style={s.chips}>{(balances.length ? balances : FEE_ASSETS.map((asset) => ({ asset, amount: 0, usd: 0 }))).map((b) => <TouchableOpacity key={b.asset.symbol} disabled={!!busy} accessibilityRole="radio" accessibilityState={{ selected: selected === b.asset.symbol }} style={[s.chip, selected === b.asset.symbol && s.chipActive]} onPress={() => setPayWith(b.asset.symbol)}>
                  <Text style={selected === b.asset.symbol ? s.white : s.muted}>{b.asset.symbol} · ${b.usd.toLocaleString(appLocale(), { maximumFractionDigits: 2 })}</Text></TouchableOpacity>)}</View></>}
              {!paid && selected !== 'DHB' && <Text style={s.help}>{t('dex.pools.swapNote', { symbol: selected })}</Text>}
              {paid && <Text style={s.help}>{t('dex.pools.alreadyPaid')}</Text>}
            </>}
            {!!error && <Text accessibilityRole="alert" style={s.alert}>{error}</Text>}
            <TouchableOpacity disabled={disabled} accessibilityRole="button" onPress={() => void submit()} style={[s.submit, disabled && { opacity: 0.5 }]}>
              {!!busy && <ActivityIndicator color="#061410" />}
              <Text style={s.darkText}>{busy ? busyLabel : !walletAddress ? t('dex.connectWallet') : paid ? t('dex.pools.finish') : !covers && check?.token ? t('dex.pools.notEnough') : t('dex.pools.payAndOpen', { amount: POOL_FEE_USD })}</Text>
            </TouchableOpacity>
            {paid && !busy && <TouchableOpacity onPress={() => { writePaid(null); setAddress(''); onClose(); }}><Text style={[s.link, { textAlign: 'center', marginTop: 12 }]}>{t('dex.pools.discardPaid')}</Text></TouchableOpacity>}
          </View>
  </GlassModal>;
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { backgroundColor: '#11151b', padding: 16 },
  title: { color: '#edf1f6', fontSize: 18, fontWeight: '600', marginBottom: 6 },
  muted: { color: '#919ca9', fontSize: 11, lineHeight: 16 },
  white: { color: '#e9edf2', fontSize: 12, fontWeight: '600' },
  label: { marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#252b34' },
  chipActive: { backgroundColor: '#29313b', borderColor: '#3a4450' },
  input: { color: '#f4f6f8', borderColor: '#343e4b', borderWidth: 1, borderRadius: 6, backgroundColor: '#0b0e13', padding: 12, fontSize: 13 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  review: { backgroundColor: '#132028', borderColor: '#3c5661', borderWidth: 1, padding: 12, marginTop: 12, borderRadius: 6, gap: 6 },
  reviewText: { color: '#d2e4ee', fontSize: 12 },
  link: { color: '#b6c4d4', fontSize: 12, textDecorationLine: 'underline' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  tokenImage: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#343e4b', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#0b0e13' },
  tokenImageFill: { width: 56, height: 56 },
  plus: { color: '#919ca9', fontSize: 22 },
  fee: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: '#0b0e13', borderWidth: 1, borderColor: '#252b34' },
  coin: { width: 32, height: 32, borderRadius: 16 },
  feeUsd: { color: '#edf1f6', fontSize: 18, fontWeight: '600' },
  help: { color: '#919ca9', fontSize: 11, lineHeight: 16, marginTop: 10 },
  alert: { color: '#ff9eac', backgroundColor: '#25151b', borderColor: '#743443', borderWidth: 1, padding: 12, marginTop: 12, borderRadius: 6, fontSize: 12, lineHeight: 18 },
  submit: { marginTop: 18, padding: 14, borderRadius: 6, alignItems: 'center', gap: 8, backgroundColor: '#20c997', flexDirection: 'row', justifyContent: 'center' },
  darkText: { color: '#061410', fontSize: 13, fontWeight: '700' },
});
