/**
 * SwapActionCard — a swap the assistant read out of a message, confirmed here
 * ===========================================================================
 * The app's counterpart of web's chat/SwapActionCard. general-ai-chat hands
 * back token addresses on Base and an amount; the card quotes it at the best
 * aggregated price (the same KyberSwap route the DEX's instant trade uses),
 * shows what comes out, and only signs after "Confirm Swap".
 *
 * "Buy N of X" (amountType 'output') is exact-out, which the aggregator does
 * not quote directly: one probe quote gives the rate, then the input is sized
 * from it with a 2% margin and quoted for real, so the shown receive is what
 * the route actually returns.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import Icon from './ui/Icon';
import { ChainId } from '../config/constants';
import { useDexSigner } from '../hooks/useDexSigner';
import { useAuthActions, useUser } from '../context/AuthContext';
import { toastSuccess } from '../libs';
import { dexActionError } from '../libs/dex-action-error';
import { formatSize } from '../libs/dex-orderbook';
import { NATIVE, evmProvider, isNative, quoteSwap, runSwap, type SwapCall } from '../libs/dex-evm-swap';
import type { AssistantSwapAction } from '../services/ai.service';

const ERC20 = ['function decimals() view returns (uint8)'];
const BASE = ChainId.BASE_MAINNET;
type Status = 'idle' | 'quoting' | 'quoted' | 'swapping' | 'success' | 'error';

const addr = (a: string) => (isNative(a) ? NATIVE : a);
async function decimalsOf(a: string): Promise<number> {
  if (isNative(a)) return 18;
  return Number(await new ethers.Contract(a, ERC20, evmProvider(BASE)).decimals());
}
const toUnits = (value: string, decimals: number) => {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(ethers.utils.parseUnits(`${whole || '0'}.${fraction.slice(0, decimals) || '0'}`, decimals).toString());
};
const fromUnits = (value: bigint, decimals: number) => Number(ethers.utils.formatUnits(value.toString(), decimals));

export default function SwapActionCard({ action }: { action: AssistantSwapAction }) {
  const { t } = useTranslation();
  const user = useUser() as any;
  const { requireAuth } = useAuthActions();
  const signer = useDexSigner();
  const wallet: string = user?.walletAddress || user?.address || '';
  const [status, setStatus] = useState<Status>('idle');
  const [quote, setQuote] = useState<SwapCall | null>(null);
  const [dec, setDec] = useState<{ in: number; out: number } | null>(null);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([decimalsOf(action.tokenIn), decimalsOf(action.tokenOut)])
      .then(([i, o]) => { if (live) setDec({ in: i, out: o }); })
      .catch(() => { if (live) setDec({ in: 18, out: 18 }); });
    return () => { live = false; };
  }, [action.tokenIn, action.tokenOut]);

  const getQuote = useCallback(async () => {
    if (!wallet) { requireAuth(() => {}); return; }
    if (!dec) return;
    setStatus('quoting'); setError('');
    try {
      const base = { chainId: BASE, tokenIn: addr(action.tokenIn), tokenOut: addr(action.tokenOut), recipient: wallet };
      let amountIn: bigint;
      if (action.amountType === 'output') {
        const probeIn = 10n ** BigInt(dec.in);
        const probe = await quoteSwap({ ...base, amountIn: probeIn });
        const rate = fromUnits(probe.amountOut, dec.out); // out per 1 in
        if (!(rate > 0)) throw new Error(t('dex.prepareFailed'));
        amountIn = toUnits(((Number(action.amount) / rate) * 1.02).toFixed(Math.min(dec.in, 12)), dec.in);
      } else {
        amountIn = toUnits(action.amount, dec.in);
      }
      setQuote(await quoteSwap({ ...base, amountIn }));
      setStatus('quoted');
    } catch (e) {
      setError(dexActionError(e, t('dex.prepareFailed'))); setStatus('error');
    }
  }, [wallet, dec, action, requireAuth, t]);

  const confirm = useCallback(async () => {
    if (!quote || !wallet) return;
    setStatus('swapping'); setError('');
    try {
      const provider = await signer(BASE, t('dex.unlockWallet'));
      const hash = await runSwap(quote, provider, wallet);
      setTxHash(hash); setStatus('success');
      toastSuccess(t('copy.9c71e7639046', { defaultValue: 'Swap successful!' }));
    } catch (e) {
      setError(dexActionError(e, t('dex.prepareFailed'))); setStatus('error');
    }
  }, [quote, wallet, signer, t]);

  const title = action.amountType === 'output'
    ? t('copy.6627a8114830', { defaultValue: 'Buy {{value1}} {{value2}}', value1: action.amount, value2: action.tokenOutSymbol })
    : t('copy.ac4d49f28b40', { defaultValue: 'Swap {{value1}} {{value2}}', value1: action.amount, value2: action.tokenInSymbol });
  const busy = status === 'quoting' || status === 'swapping';

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Icon name="ArrowLeftRight" size={14} color="#20c997" />
        <Text style={s.kicker}>{t('copy.c772e8fc6314', { defaultValue: 'Token Swap' })}</Text>
      </View>
      <Text style={s.title}>{title}</Text>
      <View style={s.pair}>
        <View style={s.side}><Text style={s.muted}>{t('copy.218197693424', { defaultValue: 'From' })}</Text><Text style={s.sym}>{action.tokenInSymbol}</Text></View>
        <Icon name="ArrowRight" size={16} color="#71717A" />
        <View style={s.side}><Text style={s.muted}>{t('copy.f4b06ef6d3c8', { defaultValue: 'To' })}</Text><Text style={s.sym}>{action.tokenOutSymbol}</Text></View>
      </View>

      {quote && dec && (
        <View style={s.quote}>
          <View style={s.between}>
            <Text style={s.muted}>{t('copy.9ccba222f889', { defaultValue: 'Estimated cost' })}</Text>
            <Text style={s.value}>{formatSize(fromUnits(quote.amountIn, dec.in))} {action.tokenInSymbol}</Text>
          </View>
          <View style={s.between}>
            <Text style={s.muted}>{t('dex.pool.youReceive')}</Text>
            <Text style={s.value}>{formatSize(fromUnits(quote.amountOut, dec.out))} {action.tokenOutSymbol}</Text>
          </View>
        </View>
      )}

      {!!error && <Text style={s.error}>{error}</Text>}

      {status === 'success' ? (
        <Text style={s.success}>{t('copy.9c71e7639046', { defaultValue: 'Swap successful!' })}{txHash ? `  ${txHash.slice(0, 10)}…` : ''}</Text>
      ) : (
        <View style={s.row}>
          {status === 'quoted' && (
            <TouchableOpacity onPress={() => void getQuote()} style={[s.btn, s.ghost]} disabled={busy}>
              <Text style={s.ghostText}>{t('copy.0e9161011702', { defaultValue: 'Refresh' })}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => void (status === 'quoted' ? confirm() : getQuote())}
            disabled={busy || !dec}
            style={[s.btn, s.primary, (busy || !dec) && { opacity: 0.6 }]}
          >
            {busy && <ActivityIndicator size="small" color="#061410" />}
            <Text style={s.primaryText}>
              {status === 'quoting' ? t('copy.2eef6c9af0ae', { defaultValue: 'Getting quote...' })
                : status === 'swapping' ? t('copy.24df132b16d3', { defaultValue: 'Swapping...' })
                : status === 'quoted' ? t('copy.220277ae54c6', { defaultValue: 'Confirm Swap' })
                : status === 'error' ? t('copy.df0fe9e00d35', { defaultValue: 'Try Again' })
                : t('copy.85249a6f8dd5', { defaultValue: 'Get Quote' })}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(32,201,151,0.35)', backgroundColor: 'rgba(32,201,151,0.06)', padding: 12, gap: 8, alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { color: '#20c997', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  side: { flex: 1, borderRadius: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
  sym: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 2 },
  muted: { color: '#A1A1AA', fontSize: 11 },
  value: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'] },
  quote: { gap: 6, paddingTop: 2 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  error: { color: '#ff9eac', fontSize: 12 },
  success: { color: '#20c997', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10 },
  primary: { backgroundColor: '#20c997' },
  primaryText: { color: '#061410', fontSize: 13, fontWeight: '700' },
  ghost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  ghostText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
