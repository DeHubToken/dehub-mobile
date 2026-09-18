import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultRefund, isPurchaseTerminal, paymentKey, purchasePollDelay, validDhbAmount, type PaymentAsset, type PaymentQuote, type Purchase } from '../libs/crypto-purchase';

export interface PurchaseApi {
  assets(): Promise<PaymentAsset[]>;
  quote(params: { originAsset: string; tokensToReceive: number; refundTo?: string; address: string }): Promise<PaymentQuote>;
  create(params: { originAsset: string; tokensToReceive: number; refundTo: string; receiverAddress: string; termsAndServicesAccepted: boolean; requestId: string }): Promise<Purchase>;
  list(): Promise<Purchase[]>;
  status(id: string): Promise<Purchase>;
  confirm?(id: string, hash: string): Promise<Purchase>;
}

/** Shared with mobile. The server owns purchase recovery; a screen is only a view. */
export function useCryptoPurchase(api: PurchaseApi, wallet: string, amount: number, active: boolean, solana?: string) {
  const [assets, setAssets] = useState<PaymentAsset[]>([]);
  const [assetId, setAssetId] = useState('');
  const [refund, setRefund] = useState('');
  const [quoted, setQuoted] = useState<{ key: string; at: number; data: PaymentQuote } | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [history, setHistory] = useState<Purchase[]>([]);
  const [busy, setBusy] = useState<'quote' | 'create' | 'pay' | null>(null);
  const [error, setError] = useState('');
  const [assetsFailed, setAssetsFailed] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [statusFailed, setStatusFailed] = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [loading, setLoading] = useState(active && !!wallet);
  const [now, setNow] = useState(Date.now());
  const [revision, setRevision] = useState(0);
  const quoteSequence = useRef(0);
  const createLock = useRef(false);
  const retry = useRef<{ key: string; id: string } | null>(null);
  const account = useRef(wallet);
  account.current = wallet;
  const key = paymentKey(wallet, assetId, amount, refund.trim());
  const currentKey = useRef(key);
  currentKey.current = key;
  const selected = assets.find(a => a.assetId === assetId);
  const quote = quoted?.key === key && now - quoted.at < 60_000 ? quoted.data : null;

  useEffect(() => {
    setPurchase(null); setHistory([]); setQuoted(null); setError(''); setAssetId(''); setRefund('');
    setBusy(null); setStatusFailed(false); setLastChecked(null); retry.current = null;
    quoteSequence.current++;
  }, [wallet]);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active || !wallet) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setAssetsFailed(false); setHistoryFailed(false);
    void Promise.allSettled([api.assets(), api.list()]).then(([catalogue, purchases]) => {
      if (cancelled) return;
      if (catalogue.status === 'fulfilled') {
        const available = catalogue.value.filter(a => !/deprecated/i.test(a.symbol));
        setAssets(available);
        const preferred = available.find(a => a.route === 'direct' && a.blockchain === 'base' && a.symbol === 'ETH');
        if (preferred) setAssetId(current => { if (current) return current; setRefund(wallet); return preferred.assetId; });
      }
      else setAssetsFailed(true);
      if (purchases.status === 'fulfilled') {
        setHistory(purchases.value);
        // Show a saved payment first, including a deposit whose deadline passed.
        setPurchase(current => current || purchases.value.find(p => !isPurchaseTerminal(p) && p.paymentStatus !== 'expired') || null);
      } else setHistoryFailed(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api, wallet, active, revision]);

  useEffect(() => {
    if (!active || !purchase || isPurchaseTerminal(purchase)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = purchase.id;
    const poll = async () => {
      let latest = purchase;
      try {
        const result = await api.status(id);
        if (cancelled) return;
        latest = { ...purchase, ...result };
        setPurchase(current => current?.id === id ? { ...current, ...result, paymentTxHash: result.paymentTxHash || current.paymentTxHash } : current);
        setHistory(rows => rows.map(row => row.id === id ? { ...row, ...result } : row));
        setStatusFailed(false); setLastChecked(Date.now());
      } catch {
        if (cancelled) return;
        setStatusFailed(true);
      }
      if (!cancelled && !isPurchaseTerminal(latest)) timer = setTimeout(poll, purchasePollDelay(latest));
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, wallet, active, purchase?.id, revision]);

  const selectAsset = (asset: PaymentAsset) => {
    if (createLock.current) return;
    quoteSequence.current++; setAssetId(asset.assetId); setRefund(defaultRefund(asset.blockchain, wallet, solana));
    setQuoted(null); setError(''); setBusy(null);
  };
  const price = async () => {
    if (!selected || !wallet || !validDhbAmount(amount) || createLock.current) return;
    const sequence = ++quoteSequence.current;
    const requestedKey = key;
    setBusy('quote'); setError(''); setQuoted(null);
    try {
      const data = await api.quote({ originAsset: selected.assetId, tokensToReceive: amount, refundTo: refund.trim() || undefined, address: wallet });
      if (sequence === quoteSequence.current && currentKey.current === requestedKey) setQuoted({ key: requestedKey, at: Date.now(), data });
    } catch (e) {
      if (sequence === quoteSequence.current && currentKey.current === requestedKey) setError(e instanceof Error ? e.message : String(e));
    } finally { if (sequence === quoteSequence.current) setBusy(null); }
  };
  const create = async () => {
    if (loading || historyFailed || !quote || !quoted || Date.now() - quoted.at >= 60_000 || !selected || !wallet || !refund.trim() || !validDhbAmount(amount) || createLock.current) return;
    createLock.current = true; setBusy('create'); setError('');
    const owner = wallet;
    if (retry.current?.key !== key) retry.current = { key, id: `purchase_${Date.now()}_${Math.random().toString(36).slice(2)}` };
    try {
      const result = await api.create({ originAsset: selected.assetId, tokensToReceive: amount, receiverAddress: wallet, refundTo: refund.trim(), termsAndServicesAccepted: true, requestId: retry.current.id });
      if (account.current !== owner) return;
      const saved = { ...result, originSymbol: result.originSymbol || selected.symbol, originBlockchain: result.originBlockchain || selected.blockchain };
      setPurchase(saved); setHistory(rows => [saved, ...rows.filter(row => row.id !== saved.id)]); setQuoted(null); retry.current = null;
      return saved;
    } catch (e) {
      if (account.current !== owner) return;
      setError(e instanceof Error ? e.message : String(e));
      // A timed-out response may already have created the purchase. Recover it.
      setRevision(v => v + 1);
    } finally { createLock.current = false; if (account.current === owner) setBusy(null); }
  };
  const pay = async (receipt: Purchase, send: (receipt: Purchase) => Promise<string>) => {
    if (createLock.current || receipt.paymentTxHash || receipt.expiresAt * 1000 <= Date.now() || !api.confirm) return;
    createLock.current = true; setBusy('pay'); setError('');
    try {
      const hash = await send(receipt);
      setPurchase({ ...receipt, paymentTxHash: hash });
      const updated = await api.confirm(receipt.id, hash);
      setPurchase(updated);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { createLock.current = false; setBusy(null); refresh(); }
  };
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  return { assets, selected, assetId, selectAsset, refund, setRefund, quote, price, create, pay, purchase, setPurchase, history, busy, error, assetsFailed, historyFailed, statusFailed, lastChecked, loading, now, refresh };
}
