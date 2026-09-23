import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import { ChainId } from '../config/constants';
import { useDexSigner } from '../hooks/useDexSigner';
import { toastSuccess } from '../libs';
import { dexActionError } from '../libs/dex-action-error';
import { formatSize } from '../libs/dex-orderbook';
import { NATIVE, evmProvider, quoteSwap, runSwap, type SwapCall } from '../libs/dex-evm-swap';
import { DHB_BASE, POOL_CHAIN_INFO } from '../libs/dex-pools';

const USDC = POOL_CHAIN_INFO.base.usdc;
const ERC20 = ['function balanceOf(address) view returns (uint256)'];
type Pay = 'USDC' | 'ETH';

/** Market buy / sell of DHB on Base at the best aggregated price, beside the range-order ticket. */
export default function DexInstantDhbTrade({ address, disabled, onDone }: { address: string; disabled?: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const signer = useDexSigner();
  const [side, setSide] = useState<'buy' | 'sell' | null>(null);
  const [pay, setPay] = useState<Pay>('USDC');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [balances, setBalances] = useState<{ usdc: number; eth: number; dhb: number } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setQuote(null); setError(''); }, [side, pay, amount]);

  useEffect(() => {
    let live = true; setBalances(null);
    if (!address || !side) return;
    const provider = evmProvider(ChainId.BASE_MAINNET);
    void Promise.all([
      new ethers.Contract(USDC, ERC20, provider).balanceOf(address) as Promise<ethers.BigNumber>,
      provider.getBalance(address),
      new ethers.Contract(DHB_BASE, ERC20, provider).balanceOf(address) as Promise<ethers.BigNumber>,
    ]).then(([usdc, eth, dhb]) => {
      if (live) setBalances({ usdc: Number(ethers.utils.formatUnits(usdc, 6)), eth: Number(ethers.utils.formatUnits(eth, 18)), dhb: Number(ethers.utils.formatUnits(dhb, 18)) });
    }).catch(() => {});
    return () => { live = false; };
  }, [address, side, revision]);

  const spend = side === 'sell' ? { symbol: 'DHB', address: DHB_BASE, decimals: 18 }
    : pay === 'ETH' ? { symbol: 'ETH', address: NATIVE, decimals: 18 } : { symbol: 'USDC', address: USDC, decimals: 6 };
  const balance = !balances ? 0 : side === 'sell' ? balances.dhb : pay === 'ETH' ? balances.eth : balances.usdc;

  async function submit() {
    if (!address) { setError(t('dex.connectWallet')); return; }
    if (!side) return;
    setBusy(true); setError('');
    try {
      const value = Number(amount);
      if (!(value > 0) || value > balance) throw new Error(t('dex.checkAmount', { token: spend.symbol }));
      if (!quote) {
        const [whole, fraction = ''] = amount.split('.');
        const units = BigInt(ethers.utils.parseUnits(fraction ? `${whole}.${fraction.slice(0, spend.decimals)}` : whole, spend.decimals).toString());
        setQuote(await quoteSwap({ chainId: ChainId.BASE_MAINNET, tokenIn: spend.address, tokenOut: side === 'buy' ? DHB_BASE : USDC, amountIn: units, recipient: address }));
        return;
      }
      const provider = await signer(ChainId.BASE_MAINNET, t('dex.unlockWallet'));
      await runSwap(quote, provider, address);
      toastSuccess(t(side === 'buy' ? 'dex.pool.bought' : 'dex.pool.sold', { amount: formatSize(side === 'buy' ? Number(ethers.utils.formatUnits(quote.amountOut.toString(), 18)) : value), symbol: 'DHB' }));
      setAmount(''); setQuote(null); setRevision((n) => n + 1); onDone();
    } catch (e) { setError(dexActionError(e, t('dex.prepareFailed'))); }
    finally { setBusy(false); }
  }

  const out = quote ? Number(ethers.utils.formatUnits(quote.amountOut.toString(), side === 'buy' ? 18 : 6)) : null;
  const locked = busy || !!disabled;
  return <View style={s.box}>
    <View style={s.row}>
      <TouchableOpacity disabled={locked} accessibilityRole="button" accessibilityState={{ selected: side === 'buy' }} style={[s.instant, s.buy, side === 'buy' && s.buyActive]} onPress={() => { setSide(side === 'buy' ? null : 'buy'); setAmount(''); }}>
        <Text style={side === 'buy' ? s.darkText : s.buyText}>⚡ {t('dex.pool.instantBuy')}</Text></TouchableOpacity>
      <TouchableOpacity disabled={locked} accessibilityRole="button" accessibilityState={{ selected: side === 'sell' }} style={[s.instant, s.sell, side === 'sell' && s.sellActive]} onPress={() => { setSide(side === 'sell' ? null : 'sell'); setAmount(''); }}>
        <Text style={side === 'sell' ? s.darkText : s.sellText}>⚡ {t('dex.pool.instantSell')}</Text></TouchableOpacity>
    </View>
    {!!side && <View>
      {side === 'buy' && <><Text style={[s.muted, s.label]}>{t('dex.payWith')}</Text><View style={s.row}>{(['USDC', 'ETH'] as const).map((value) => <TouchableOpacity key={value} disabled={locked} style={[s.chip, pay === value && s.chipActive]} onPress={() => setPay(value)}>
        <Text style={pay === value ? s.white : s.muted}>{value} · {balances ? formatSize(value === 'ETH' ? balances.eth : balances.usdc) : '—'}</Text></TouchableOpacity>)}</View></>}
      <Text style={[s.muted, s.label]}>{t(side === 'buy' ? 'dex.spend' : 'dex.sellAmount')}</Text>
      <View style={s.inputWrap}><TextInput editable={!locked} accessibilityLabel={t('dex.amountToken', { token: spend.symbol })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#596675" value={amount} onChangeText={(v) => setAmount(v.replace(',', '.').trim())} style={s.input} /><Text style={s.unit}>{spend.symbol}</Text></View>
      <View style={s.between}><Text style={s.muted}>{t('dex.available')}</Text><Text style={s.white}>{balances ? `${formatSize(balance)} ${spend.symbol}` : t('dex.checking')}</Text></View>
      <View style={s.between}><Text style={s.muted}>{t('dex.pool.youReceive')}</Text><Text style={s.white}>{out != null ? `${formatSize(out)} ${side === 'buy' ? 'DHB' : 'USDC'}` : '—'}</Text></View>
      {!!error && <Text accessibilityRole="alert" style={s.alert}>{error}</Text>}
      <TouchableOpacity disabled={locked || !(Number(amount) > 0)} onPress={() => void submit()} style={[s.submit, { backgroundColor: side === 'buy' ? '#20c997' : '#f05b72', opacity: locked || !(Number(amount) > 0) ? 0.5 : 1 }]}>
        {busy && <ActivityIndicator color="#061410" />}
        <Text style={s.darkText}>{busy ? quote ? t('dex.stage.swap') : t('dex.stage.quote') : quote ? t(side === 'buy' ? 'dex.pool.confirmInstantBuy' : 'dex.pool.confirmInstantSell') : t(side === 'buy' ? 'dex.pool.instantBuy' : 'dex.pool.instantSell')}</Text>
      </TouchableOpacity>
      <Text style={s.help}>{t('dex.pool.instantNote')}</Text>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  box: { marginBottom: 14 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  between: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  instant: { flex: 1, paddingVertical: 12, borderRadius: 6, alignItems: 'center', borderWidth: 1 },
  buy: { borderColor: '#20c997' }, sell: { borderColor: '#f05b72' },
  buyActive: { backgroundColor: '#20c997' }, sellActive: { backgroundColor: '#f05b72' },
  buyText: { color: '#20c997', fontWeight: '700', fontSize: 13 }, sellText: { color: '#f05b72', fontWeight: '700', fontSize: 13 },
  muted: { color: '#919ca9', fontSize: 11 },
  white: { color: '#e9edf2', fontSize: 12, fontVariant: ['tabular-nums'] },
  darkText: { color: '#061410', fontSize: 13, fontWeight: '700' },
  label: { marginTop: 14, marginBottom: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 4, borderWidth: 1, borderColor: '#252b34' },
  chipActive: { backgroundColor: '#29313b' },
  inputWrap: { borderColor: '#343e4b', borderWidth: 1, borderRadius: 6, backgroundColor: '#0b0e13', flexDirection: 'row', alignItems: 'center' },
  input: { color: '#f4f6f8', flex: 1, padding: 12, fontSize: 16 },
  unit: { color: '#919ca9', paddingRight: 12, fontSize: 11 },
  alert: { color: '#ff9eac', backgroundColor: '#25151b', borderColor: '#743443', borderWidth: 1, padding: 12, marginTop: 10, borderRadius: 6, fontSize: 12, lineHeight: 18 },
  submit: { marginTop: 14, padding: 14, borderRadius: 6, alignItems: 'center', gap: 8, flexDirection: 'row', justifyContent: 'center' },
  help: { color: '#919ca9', fontSize: 10, lineHeight: 16, marginTop: 10 },
});
