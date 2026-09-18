
import { defaultRefund, estimateMinutes, featuredPaymentAssets, formatPaymentAmount, isPurchaseTerminal, paymentKey, paymentChainName, purchasePhase, purchasePollDelay, validDhbAmount, type Purchase } from '../../libs/crypto-purchase';

const now = Date.parse('2026-09-17T12:00:00Z');
const purchase: Purchase = { id: 'purchase', originAsset: 'btc', amountInFormatted: '0.01', depositAddress: 'address', expiresAt: (now - 1000) / 1000 };

describe('crypto purchase lifecycle', () => {
  it('keeps a submitted direct payment in confirmation even after its quote deadline', () => {
    expect(purchasePhase({ ...purchase, settlement: 'DIRECT_PENDING', paymentTxHash: '0xpaid' }, now)).toBe('confirming');
    expect(purchasePhase({ ...purchase, settlement: 'DIRECT_PENDING', expiresAt: now / 1000 + 60 }, now)).toBe('awaiting');
  });
  it('does not expire funds already confirming or swapping when the deposit deadline passes', () => {
    expect(purchasePhase({ ...purchase, settlement: 'KNOWN_DEPOSIT_TX', paymentStatus: 'expired' }, now)).toBe('confirming');
    expect(purchasePhase({ ...purchase, settlement: 'PROCESSING' }, now)).toBe('swapping');
    expect(purchasePhase({ ...purchase, settlement: 'PENDING_DEPOSIT' }, now)).toBe('expired');
  });
  it('continues checking expired purchases so late confirmations can recover', () => {
    expect(isPurchaseTerminal({ ...purchase, settlement: 'EXPIRED' })).toBe(false);
  });
  it('does not call settlement a delivered purchase', () => {
    expect(purchasePhase({ ...purchase, settlement: 'SUCCESS', tokenSendStatus: 'not_sent' })).toBe('delivering');
    expect(purchasePhase({ ...purchase, settlement: 'SUCCESS', tokenSendStatus: 'failed' })).toBe('deliveryDelayed');
  });
  it('tracks the gas drop separately after DHB arrives', () => {
    expect(purchasePhase({ ...purchase, tokenSendStatus: 'sent', ethSendStatus: 'failed' })).toBe('gasPending');
    expect(purchasePhase({ ...purchase, tokenSendStatus: 'sent', ethSendStatus: 'sent' })).toBe('delivered');
  });
  it('never describes a failed or short payment as refunded', () => {
    expect(purchasePhase({ ...purchase, settlement: 'FAILED' })).toBe('failed');
    expect(purchasePhase({ ...purchase, settlement: 'REFUNDED' })).toBe('refunded');
    expect(purchasePhase({ ...purchase, settlement: 'INCOMPLETE_DEPOSIT' })).toBe('incomplete');
  });
  it('keeps unknown provider states visible without inviting another payment', () => {
    expect(purchasePhase({ ...purchase, settlement: 'NEW_PROVIDER_STATE' })).toBe('checking');
  });
  it('backs off slow purchases and never displays a zero or NaN estimate', () => {
    expect(purchasePollDelay({ ...purchase, settlement: 'PROCESSING' }, now)).toBe(30_000);
    expect(estimateMinutes(807)).toBe(14);
    expect(estimateMinutes(22)).toBe(1);
    expect(estimateMinutes(undefined)).toBeNull();
    expect(estimateMinutes(0)).toBeNull();
  });
  it('invalidates quotes for every payment-defining input', () => {
    const key = paymentKey('wallet', 'btc', 50000, 'refund');
    expect(paymentKey('wallet', 'eth', 50000, 'refund')).not.toBe(key);
    expect(paymentKey('other', 'btc', 50000, 'refund')).not.toBe(key);
    expect(paymentKey('wallet', 'btc', 60000, 'refund')).not.toBe(key);
    expect(paymentKey('wallet', 'btc', 50000, 'other')).not.toBe(key);
  });
  it('rejects non-finite and fractional purchase inputs', () => {
    for (const amount of [NaN, Infinity, -1, 0, 0.1, Number.MAX_SAFE_INTEGER + 1]) expect(validDhbAmount(amount)).toBe(false);
    expect(validDhbAmount(50000)).toBe(true);
  });
  it('shows concise payment amounts without changing the amount submitted', () => {
    const exact = '0.193739247929379325';
    expect(formatPaymentAmount(exact)).toBe('0.193739');
    expect(exact).toBe('0.193739247929379325');
    expect(formatPaymentAmount('0.00000001')).toBe('<0.000001');
  });
  it('features supported payment currencies from the live catalogue', () => {
    const assets = [
      { assetId: 'usdc-base', symbol: 'USDC', blockchain: 'base', decimals: 6 },
      { assetId: 'eth-base', symbol: 'ETH', blockchain: 'base', decimals: 18 },
      { assetId: 'eth-near', symbol: 'ETH', blockchain: 'near', decimals: 18 },
      { assetId: 'bnb-bsc', symbol: 'BNB', blockchain: 'bsc', decimals: 18 },
      { assetId: 'sol-sol', symbol: 'SOL', blockchain: 'sol', decimals: 9 },
      { assetId: 'usdt-base', symbol: 'USDT', blockchain: 'base', decimals: 6 },
      { assetId: 'eth-robinhood', symbol: 'ETH', blockchain: 'robinhood', decimals: 18 },
      { assetId: 'usdt-robinhood', symbol: 'USDT', blockchain: 'robinhood', decimals: 6 },
      { assetId: 'usdc-robinhood', symbol: 'USDC', blockchain: 'robinhood', decimals: 6 },
    ];
    expect(featuredPaymentAssets(assets).map(asset => asset.assetId)).toEqual(['eth-base', 'bnb-bsc', 'sol-sol', 'usdt-base', 'usdc-base', 'eth-robinhood', 'usdt-robinhood', 'usdc-robinhood']);
  });
  it('labels Robinhood payments and refunds to the EVM wallet', () => {
    expect(paymentChainName('robinhood')).toBe('Robinhood Chain');
    expect(defaultRefund('robinhood', '0xBuyer')).toBe('0xBuyer');
  });
});
