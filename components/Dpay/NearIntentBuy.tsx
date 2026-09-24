import { sendSolanaPurchase, connectPurchaseSolanaWallet } from '../../services/solana-purchase';
import { usePaymentPicker } from '../../hooks/use-payment-picker';
import { loadPaymentBalances } from '../../services/payment-balances';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useAuthActions, useProvider, useUser } from '../../context/AuthContext';
import { ethers } from 'ethers';
import { getSigningProvider } from '../../libs/provider.registry';
import { isSelfFundedGasInsufficientError, writeBatchAA } from '../../libs/aa.write';
import type { Purchase } from '../../libs/crypto-purchase';
import { toastError, toastSuccess } from '../../libs/toast';
import { openInApp } from '../../libs/links.utils';
import { TERMS_OF_SERVICE_LINK } from '../../config/links';
import { cryptoPurchaseApi } from '../../services/crypto-purchase.service';
import { canSendPayment, estimateMinutes, formatPaymentAmount, paymentChainName, purchasePhase, validDhbAmount } from '../../libs/crypto-purchase';
import { useCryptoPurchase } from '../../hooks/useCryptoPurchase';
import Icon from '../ui/Icon';
import dhbLogo from '../../assets/tokens/DHB.png';
import { sanitizeAmountInput } from "../../libs/amount-input";

const tokenLogos: Record<string, number> = {
  ETH: require('../../assets/tokens/ETH.png'), USDC: require('../../assets/tokens/USDC.png'),
  USDT: require('../../assets/tokens/USDT.png'), BTC: require('../../assets/tokens/BTC.png'),
  SOL: require('../../assets/tokens/SOL.png'), BNB: require('../../assets/tokens/BNB.png'),
};

function PaymentPair({ payAmount, paySymbol, payChain, receiveAmount, editable = false, onPayChange, onReceiveChange }: { payAmount?: string; paySymbol?: string; payChain?: string; receiveAmount: number; editable?: boolean; onPayChange?: (value: string) => void; onReceiveChange?: (value: string) => void }) {
  const { t } = useTranslation();
  return <View accessibilityLabel={t('nearBuy.title')}>
    <View className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
      <View className="flex-row justify-between"><Text className="text-theme-neutrals-400 text-xs">{t('buyCoins.youPay')}</Text><Text className="text-theme-neutrals-400 text-xs">{payChain ? paymentChainName(payChain) : ''}</Text></View>
      <View className="flex-row items-center mt-2">
        {paySymbol && tokenLogos[paySymbol] ? <Image source={tokenLogos[paySymbol]} className="w-9 h-9 rounded-full mr-3" resizeMode="contain" /> : <View className="w-9 h-9 rounded-full bg-white/10 mr-3" />}
        {editable ? <TextInput value={payAmount || ''} onChangeText={(v) => onPayChange?.(sanitizeAmountInput(v))} keyboardType="decimal-pad" accessibilityLabel={t('buyCoins.youPay')} className="flex-1 text-white text-xl font-semibold p-0" /> : <Text numberOfLines={1} className="flex-1 text-white text-xl font-semibold">{payAmount ? `≈${formatPaymentAmount(payAmount)}` : '—'}</Text>}<Text className="text-white text-sm font-semibold ml-2">{paySymbol || '—'}</Text>
      </View>
    </View>
    <View className="items-center -my-3 z-10"><View className="w-9 h-9 items-center justify-center rounded-xl border border-white/15 bg-theme-neutrals-900"><Icon name="ArrowDown" size={16} color="#ffffff" /></View></View>
    <View className="rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3.5">
      <View className="flex-row justify-between"><Text className="text-theme-neutrals-400 text-xs">{t('buyCoins.youReceive')}</Text><Text className="text-theme-neutrals-400 text-xs">{paymentChainName('base')}</Text></View>
      <View className="flex-row items-center mt-2"><Image source={dhbLogo} className="w-9 h-9 rounded-full mr-3" resizeMode="contain" />{editable ? <TextInput value={receiveAmount > 0 ? String(receiveAmount) : ''} onChangeText={(v) => onReceiveChange?.(sanitizeAmountInput(v))} keyboardType="decimal-pad" accessibilityLabel={t('buyCoins.youReceive')} className="flex-1 text-white text-xl font-semibold p-0" /> : <Text numberOfLines={1} className="flex-1 text-white text-xl font-semibold">{receiveAmount > 0 ? receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</Text>}<Text className="text-white text-sm font-semibold ml-2">DHB</Text></View>
    </View>
  </View>;
}

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} className={`rounded-xl bg-white/10 border border-white/15 px-3 py-3 my-1 ${disabled ? 'opacity-40' : ''}`}><Text className="text-white text-center text-sm">{label}</Text></TouchableOpacity>;
}

export default function NearIntentBuy({ active = false, initialDhbAmount = 50000, onDelivered }: { active?: boolean; initialDhbAmount?: number; onDelivered?: () => void } = {}) {
  const { t } = useTranslation();
  const user = useUser() as any;
  const { refreshUser, switchChain } = useAuthActions();
  const { provider } = useProvider();
  const wallet = (user?.walletAddress || user?.address || '') as string;
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [amountText, setAmountText] = useState(String(initialDhbAmount));
  const deliveredRef = React.useRef<string | null>(null);
  const [search, setSearch] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [connectingSolana, setConnectingSolana] = useState(false);
  const amount = Number(amountText);
  const flow = useCryptoPurchase(cryptoPurchaseApi, wallet, amount, foreground && (active || focused), user?.solanaAddress);
  const { purchase, quote, selected, busy } = flow;
  const picker = usePaymentPicker(flow.assets, wallet, user?.solanaAddress, foreground && (active || focused), loadPaymentBalances, flow.selectAsset);
  const direct = purchase ? purchase.route === 'direct' : selected?.route === 'direct';
  const changeReceiveAmount = (value: string) => setAmountText(value.replace(/[^0-9]/g, ''));
  const changePayAmount = (value: string) => {
    if (!quote || !/^(?:\d+\.?\d*|\.\d+)$/.test(value)) return;
    const rate = Number(quote.estimatedTokensToReceive || amount) / Number(quote.amountInFormatted || 0);
    if (rate > 0) setAmountText(String(Math.max(1, Math.floor(Number(value) * rate))));
  };
  const sendPayment = async (receipt: Purchase) => {
    if (receipt.paymentChainId === 101) return sendSolanaPurchase(receipt);
    if (!receipt.paymentChainId || receipt.paymentDecimals == null) throw new Error(t('nearBuy.statusError'));
    await switchChain(receipt.paymentChainId);
    const signing = getSigningProvider() || provider;
    if (!signing?.request) throw new Error(t('nearBuy.statusError'));
    const chain = Number(await signing.request({ method: 'eth_chainId' }));
    if (chain !== receipt.paymentChainId) throw new Error(t('nearBuy.wrongNetwork'));
    const accounts = await signing.request({ method: 'eth_accounts' });
    if (accounts?.[0]?.toLowerCase() !== wallet.toLowerCase()) throw new Error(t('nearBuy.wrongWallet'));
    if (wallet.toLowerCase() !== receipt.refundTo?.toLowerCase()) throw new Error(t('nearBuy.wrongWallet'));
    if (receipt.expiresAt * 1000 <= Date.now()) throw new Error(t('nearBuy.phase_expired'));
    const amount = ethers.utils.parseUnits(receipt.amountInFormatted, receipt.paymentDecimals);
    if (!receipt.paymentTokenAddress || receipt.wrapNativePayment) {
      const balance = ethers.BigNumber.from(await signing.request({ method: 'eth_getBalance', params: [wallet, 'latest'] }));
      if (balance.lt(amount)) {
        const symbol = receipt.originSymbol || 'native token';
        throw new Error(`Insufficient ${symbol} on ${paymentChainName(receipt.originBlockchain || '')}. Your wallet has ${formatPaymentAmount(ethers.utils.formatUnits(balance, receipt.paymentDecimals))} ${symbol}; this payment needs ${formatPaymentAmount(receipt.amountInFormatted)} ${symbol}. Choose another currency or a smaller amount.`);
      }
    }
    if (signing.smartAccount) {
      const token = new ethers.utils.Interface(['function deposit() payable', 'function transfer(address to,uint256 amount) returns (bool)']);
      const calls = receipt.wrapNativePayment && receipt.paymentTokenAddress
        ? [
            { to: receipt.paymentTokenAddress, data: token.encodeFunctionData('deposit') as `0x${string}`, value: amount },
            { to: receipt.paymentTokenAddress, data: token.encodeFunctionData('transfer', [receipt.depositAddress, amount]) as `0x${string}` },
          ]
        : receipt.paymentTokenAddress
          ? [{ to: receipt.paymentTokenAddress, data: token.encodeFunctionData('transfer', [receipt.depositAddress, amount]) as `0x${string}` }]
          : [{ to: receipt.depositAddress, data: '0x' as `0x${string}`, value: amount }];
      try {
        return (await writeBatchAA(signing, calls, { context: 'crypto purchase', sponsored: false })).hash;
      } catch (error) {
        if (!isSelfFundedGasInsufficientError(error)) throw error;
        return (await writeBatchAA(signing, calls, { context: 'crypto purchase' })).hash;
      }
    }
    const isToken = receipt.paymentTokenAddress && !receipt.wrapNativePayment;
    const data = isToken ? new ethers.utils.Interface(['function transfer(address to,uint256 amount) returns (bool)']).encodeFunctionData('transfer', [receipt.depositAddress, amount]) : '0x';
    return signing.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to: isToken ? receipt.paymentTokenAddress : receipt.depositAddress, data, value: isToken ? '0x0' : amount.toHexString() }] }) as Promise<string>;
  };
  const connectSolana = async () => {
    setConnectingSolana(true);
    try { await connectPurchaseSolanaWallet(wallet); await refreshUser(); }
    catch (error) { toastError(error instanceof Error ? error.message : t('nearBuy.statusError')); }
    finally { setConnectingSolana(false); }
  };
  const begin = async () => {
    picker.lockSelection();
    if (!quote) return flow.price();
    const saved = await flow.create();
    if (saved?.route === 'direct' && saved.amountInFormatted === quote.amountInFormatted) await flow.pay(saved, sendPayment);
  };
  useEffect(() => { if (selected?.blockchain === 'sol' && user?.solanaAddress) flow.setRefund(user.solanaAddress); }, [selected?.assetId, user?.solanaAddress]);
  const needsSolana = selected?.route === 'direct' && selected?.blockchain === 'sol' && (!user?.solanaAddress || !user?.solanaAddressVerifiedAt);
  const phase = purchase ? purchasePhase(purchase, flow.now) : null;
  useEffect(() => {
    if (purchase?.tokenSendStatus === 'sent' && purchase.id !== deliveredRef.current) {
      deliveredRef.current = purchase.id;
      void refreshUser().then(() => onDelivered?.()).catch(() => onDelivered?.());
    }
  }, [purchase?.id, purchase?.tokenSendStatus, refreshUser, onDelivered]);
  const minutes = estimateMinutes(purchase?.timeEstimateSeconds ?? quote?.timeEstimateSeconds);
  const rows = picker.rows.filter(asset => `${asset.symbol} ${paymentChainName(asset.blockchain)} ${asset.contractAddress || ''} ${asset.assetId}`.toLowerCase().includes((picker.other ? search : '').trim().toLowerCase()));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const copy = async (value: string) => {
    try { await Clipboard.setStringAsync(value); toastSuccess(t('nearBuy.copied')); }
    catch { toastError(t('nearBuy.copyFailed')); }
  };
  const estimate = <Text className="text-theme-neutrals-400 text-xs my-2">{direct ? t('nearBuy.directTiming') : `${minutes ? t('nearBuy.swapEstimate', { minutes }) : t('nearBuy.estimateUnknown')} ${t('nearBuy.confirmationTime')}`}</Text>;
  const field = 'bg-theme-neutrals-900 text-white rounded-xl px-3 py-3 mb-2';

  return <View className="bg-theme-neutrals-800 rounded-xl p-4 border border-theme-neutrals-700/60 my-4">
    <Text className="text-white font-semibold text-lg">{t('nearBuy.title')}</Text>
    <Text className="text-theme-neutrals-400 text-xs mt-1 mb-3">{t('nearBuy.description')}</Text>
    {flow.historyFailed && <><Text className="text-amber-300 text-sm">{t('nearBuy.historyError')}</Text><Action label={t('nearBuy.retry')} onPress={flow.refresh} /></>}
    {purchase ? <View>
      <View accessibilityLiveRegion="polite" className="mb-3"><Text className="text-white font-semibold">{t(`nearBuy.phase_${phase}`)}</Text><Text className="text-theme-neutrals-400 text-sm mt-1">{t(direct && phase === 'awaiting' ? 'nearBuy.reviewPay' : `nearBuy.detail_${phase}`)}</Text></View>
      <PaymentPair payAmount={purchase.amountInFormatted} paySymbol={purchase.originSymbol} payChain={purchase.originBlockchain} receiveAmount={Number(purchase.tokenReceived || purchase.estimatedTokensToReceive || 0)} />
      {flow.statusFailed && <Text className="text-amber-300 text-sm">{t('nearBuy.statusError')}</Text>}
      {phase === 'awaiting' && !canSendPayment(purchase, flow.now) && <Text className="text-amber-300 text-sm">{t('nearBuy.statusError')}</Text>}
      <Action label={t('nearBuy.checkStatus')} onPress={flow.refresh} />
      {flow.lastChecked && <Text className="text-theme-neutrals-400 text-xs my-1">{t('nearBuy.lastChecked', { time: new Date(flow.lastChecked).toLocaleTimeString() })}</Text>}
      {!direct && canSendPayment(purchase, flow.now) && <Text className="text-amber-200 text-xs my-2">{t('nearBuy.sendExact', { amount: purchase.amountInFormatted || '', symbol: purchase.originSymbol || '', chain: paymentChainName(purchase.originBlockchain || '') })}</Text>}
      {estimate}<Text className="text-theme-neutrals-400 text-xs">{t('nearBuy.saved')}</Text>
      <Text className="text-theme-neutrals-400 text-xs my-1">{t('nearBuy.gasReserve', { amount: (purchase.gasReserveUsd || 0).toFixed(4) })}</Text>
      <Text className="text-theme-neutrals-400 text-xs my-2">{t('nearBuy.deadline', { date: new Date(purchase.expiresAt * 1000).toLocaleString() })}</Text>
      {direct && canSendPayment(purchase, flow.now) && <Action label={busy ? t('nearBuy.loading') : t('nearBuy.pay')} disabled={!!busy} onPress={() => flow.pay(purchase, sendPayment)} />}
      {!direct && <Text selectable className="bg-theme-neutrals-900 rounded-xl p-3 text-white text-xs">{purchase.depositAddress}</Text>}
      {!direct && canSendPayment(purchase, flow.now) && <Action label={t('nearBuy.copyPayment')} onPress={() => copy(purchase.depositAddress)} />}
      {purchase.depositMemo != null && <View className="border border-amber-400/40 rounded-xl p-3 my-2"><Text className="text-amber-300 text-sm">{t('nearBuy.memoNotice')}</Text><Text selectable className="text-white my-2">{purchase.depositMemo}</Text>{canSendPayment(purchase, flow.now) && <Action label={t('nearBuy.copyMemo')} onPress={() => copy(purchase.depositMemo!)} />}</View>}
      <Text selectable className="text-theme-neutrals-400 text-xs my-2">{t('nearBuy.refundReceipt', { address: purchase.refundTo || '' })}</Text>
      <Text selectable className="text-theme-neutrals-400 text-xs mb-2">{t('nearBuy.destination', { address: purchase.receiverAddress || wallet })}</Text>
      {purchase.tokenSendTxnHash && /^0x[0-9a-fA-F]{64}$/.test(purchase.tokenSendTxnHash) && <Action label={t('nearBuy.viewDelivery')} onPress={() => openInApp(`https://basescan.org/tx/${purchase.tokenSendTxnHash}`)} />}
      <Action label={t('nearBuy.purchaseId', { id: purchase.id })} onPress={() => copy(purchase.id)} />
      <Action label={t('nearBuy.startAnother')} onPress={() => { flow.setPurchase(null); setAgreed(false); }} />
    </View> : <>
      <Text className="text-theme-neutrals-400 text-xs mb-1">{t('nearBuy.dhbAmount')}</Text>
      <TextInput value={amountText} onChangeText={(v) => setAmountText(sanitizeAmountInput(v))} editable={busy !== 'create'} keyboardType="decimal-pad" accessibilityLabel={t('nearBuy.dhbAmount')} className={field} />
      <View className="flex-row flex-wrap gap-2 mb-3">{picker.currencies.map(symbol => <TouchableOpacity key={symbol} accessibilityRole="button" accessibilityState={{ selected: !picker.other && picker.currency === symbol }} disabled={!!busy} onPress={() => { picker.chooseCurrency(symbol); setAgreed(false); }} className={`rounded-xl px-3 py-2 ${!picker.other && picker.currency === symbol ? 'bg-white/20' : 'bg-theme-neutrals-900'}`}><Text className="text-white">{symbol}</Text></TouchableOpacity>)}</View>
      <Text className="text-theme-neutrals-400 text-xs mb-2">{t(picker.loading ? 'nearBuy.checkingBalances' : picker.hasFunds ? 'nearBuy.walletBalances' : 'nearBuy.noWalletFunds')}</Text>
      <Action label={t('nearBuy.otherCurrencies')} onPress={() => { picker.showOther(); setSearch(''); }} />
      {picker.other && <TextInput value={search} onChangeText={setSearch} editable={busy !== 'create'} placeholder={t('nearBuy.search')} placeholderTextColor="#71717A" className={field} />}
      <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
        {rows.map(asset => <TouchableOpacity key={asset.assetId} accessibilityRole="button" accessibilityState={{ selected: asset.assetId === flow.assetId }} disabled={busy === 'create'} onPress={() => { picker.choose(asset); setAgreed(false); }} className={`rounded-lg px-3 py-2 mb-1 ${asset.assetId === flow.assetId ? 'bg-white/20' : 'bg-theme-neutrals-900'}`}><Text className="text-white text-sm">{asset.symbol} · {paymentChainName(asset.blockchain)}</Text><Text className="text-theme-neutrals-400 text-xs">{t(picker.balances[asset.assetId] == null ? 'nearBuy.balanceUnknown' : 'nearBuy.balanceAmount', { amount: picker.balances[asset.assetId], symbol: asset.symbol })}</Text>{picker.other && asset.contractAddress && <Text className="text-theme-neutrals-400 text-[10px]">{asset.contractAddress}</Text>}</TouchableOpacity>)}
        {flow.loading && <Text className="text-theme-neutrals-400 text-sm">{t('nearBuy.loading')}</Text>}
        {!flow.loading && !flow.assetsFailed && !rows.length && <Text className="text-theme-neutrals-400 text-sm">{t('nearBuy.noMatches')}</Text>}
      </ScrollView>
      {flow.assetsFailed && <><Text className="text-amber-300 text-sm">{t('nearBuy.tokensError')}</Text><Action label={t('nearBuy.retry')} onPress={flow.refresh} /></>}
      {selected && (picker.other || selected.symbol === picker.currency) && <View className="mt-3">
        {!direct && <><Text className="text-theme-neutrals-400 text-xs mb-1">{t('nearBuy.refundAddress', { chain: paymentChainName(selected.blockchain) })}</Text>
        <TextInput value={flow.refund} onChangeText={flow.setRefund} editable={busy !== 'create'} autoCapitalize="none" autoCorrect={false} placeholder={t('nearBuy.refundPlaceholder')} placeholderTextColor="#71717A" className={field} />
        <Text className="text-theme-neutrals-400 text-xs mb-2">{t('nearBuy.refundHint')}</Text></>}
        <PaymentPair editable onPayChange={changePayAmount} onReceiveChange={changeReceiveAmount} payAmount={quote?.amountInFormatted} paySymbol={selected.symbol} payChain={selected.blockchain} receiveAmount={quote?.estimatedTokensToReceive || amount} />
        {quote && <View className="my-2"><Text className="text-theme-neutrals-400 text-xs">{t('nearBuy.gasReserve', { amount: (quote.gasReserveUsd || 0).toFixed(4) })}</Text>{estimate}</View>}
        {quote && <><TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} disabled={busy === 'create'} onPress={() => setAgreed(value => !value)} className="py-2"><Text className="text-white text-xs">{agreed ? '☑' : '☐'} {t('nearBuy.acceptTerms')}</Text></TouchableOpacity><Action label={t('nearBuy.terms')} onPress={() => openInApp(TERMS_OF_SERVICE_LINK)} /></>}
        {needsSolana && <Action label={t(connectingSolana ? 'nearBuy.loading' : 'nearBuy.connectSolana')} disabled={connectingSolana} onPress={connectSolana} />}
        {!needsSolana && <Action label={busy ? t('nearBuy.loading') : quote ? t(direct ? 'nearBuy.pay' : 'nearBuy.paymentAction') : t('nearBuy.getQuote')} disabled={flow.loading || flow.historyFailed || !!busy || !validDhbAmount(amount) || (!!quote && (!flow.refund.trim() || !agreed))} onPress={begin} />}
      </View>}
    </>}
    {!!flow.error && <Text accessibilityLiveRegion="polite" className="text-red-400 text-sm my-2">{flow.error}</Text>}
    {flow.history.length > 0 && <View className="border-t border-white/10 pt-3 mt-3"><Text className="text-white text-sm mb-2">{t('nearBuy.history')}</Text><ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>{flow.history.map(row => <Action key={row.id} label={`${row.originSymbol || ''} · ${paymentChainName(row.originBlockchain || '')} · ${t(`nearBuy.phase_${purchasePhase(row, flow.now)}`)}${row.createdAt ? ` · ${new Date(row.createdAt).toLocaleString()}` : ''}`} onPress={() => { flow.setPurchase(row); flow.refresh(); }} />)}</ScrollView></View>}
  </View>;
}
