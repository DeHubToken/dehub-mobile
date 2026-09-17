import { useEffect, useRef, useState } from 'react';
import type { PaymentAsset } from '../libs/crypto-purchase';
import { PAYMENT_CURRENCIES, hasPaymentBalance, isPrimaryPayment, preferredPayment, type PaymentBalances } from '../libs/payment-options';

type Reader = (assets: PaymentAsset[], wallet: string, solana?: string) => Promise<PaymentBalances>;
export function usePaymentPicker(assets: PaymentAsset[], wallet: string, solana: string | undefined, active: boolean, read: Reader, select: (asset: PaymentAsset) => void) {
  const [currency, setCurrency] = useState('ETH');
  const [other, setOther] = useState(false);
  const [balances, setBalances] = useState<PaymentBalances>({});
  const [loading, setLoading] = useState(false);
  const touched = useRef(false);
  const selectRef = useRef(select); selectRef.current = select;
  const identity = `${wallet}:${solana || ''}`;
  const [balanceIdentity, setBalanceIdentity] = useState('');
  useEffect(() => { touched.current = false; setCurrency('ETH'); setOther(false); setBalances({}); }, [identity]);
  useEffect(() => {
    if (!active || !wallet || !assets.length) return;
    let cancelled = false;
    setLoading(true);
    read(assets, wallet, solana).then(found => {
      if (cancelled) return;
      setBalances(found); setBalanceIdentity(identity);
      const preferred = preferredPayment(assets, found);
      if (preferred && !touched.current) { setCurrency(preferred.symbol); selectRef.current(preferred); }
    }).catch(() => { if (!cancelled) { setBalances({}); setBalanceIdentity(identity); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assets, wallet, solana, active, read, identity]);
  const currentBalances = balanceIdentity === identity ? balances : {};
  const choose = (asset: PaymentAsset) => { touched.current = true; select(asset); };
  const chooseCurrency = (symbol: string) => {
    touched.current = true; setCurrency(symbol); setOther(false);
    const candidates = assets.filter(a => isPrimaryPayment(a) && a.symbol === symbol);
    const preferred = preferredPayment(candidates, currentBalances) || candidates.find(a => a.route === 'direct' && a.blockchain === 'base') || candidates.find(a => a.route === 'direct') || candidates[0];
    if (preferred) select(preferred);
  };
  return { lockSelection: () => { touched.current = true; }, currency, other, showOther: () => { touched.current = true; setOther(true); }, chooseCurrency, choose, balances: currentBalances, loading,
    currencies: PAYMENT_CURRENCIES,
    hasFunds: assets.some(a => isPrimaryPayment(a) && hasPaymentBalance(currentBalances[a.assetId])),
    rows: assets.filter(a => other || (isPrimaryPayment(a) && a.symbol === currency)).sort((a,b) => Number(hasPaymentBalance(currentBalances[b.assetId])) - Number(hasPaymentBalance(currentBalances[a.assetId])) || Number(b.route === 'direct') - Number(a.route === 'direct')),
  };
}
