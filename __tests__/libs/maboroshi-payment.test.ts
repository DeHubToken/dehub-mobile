
import { completeMaboroshiPayment, getMaboroshiQuote, isMaboroshiPaymentRequest, maboroshiStageLabel } from '../../libs/maboroshi-payment';

const wallet = `0x${'1'.repeat(40)}`;
const hash = `0x${'2'.repeat(64)}`;
const input = { type: 'maboroshi:pay' as const, requestId: '11111111-1111-4111-8111-111111111111', id: 'a'.repeat(32), stage: 'prepare' as const };
const quote = { ...input, wallet, price_micros: 1_000_000, payment_ref: null };
const response = (data: unknown, ok = true) => ({ ok, json: async () => data }) as Response;

describe('Maboroshi normal generation payment handoff', () => {
  it('identifies the single Kling render and rejects a separate HD purchase', async () => {
    expect(maboroshiStageLabel('draft', 'kling')).toContain('Generate Kling video');
    const draft = { ...input, stage: 'draft' as const };
    const result = await getMaboroshiQuote(draft, 'session', wallet, jest.fn().mockResolvedValue(response({ ...quote, ...draft, renderer: 'kling', price_micros: 3150000 })));
    expect(result.renderer).toBe('kling');
    expect(result.price_micros).toBe(3150000);
    const hd = { ...input, stage: 'hd' as const };
    await expect(getMaboroshiQuote(hd, 'session', wallet, jest.fn().mockResolvedValue(response({ ...quote, ...hd, renderer: 'kling' })))).rejects.toThrow('account');
  });
  it('accepts the one-render Wan and Seedance 720p options only at the render stage', async () => {
    expect(maboroshiStageLabel('draft', 'wan')).toContain('Generate Wan 3.0 video');
    expect(maboroshiStageLabel('draft', 'seedance-direct')).toContain('Generate Seedance 720p video');
    for (const renderer of ['wan', 'seedance-direct']) {
      const draft = { ...input, stage: 'draft' as const };
      expect((await getMaboroshiQuote(draft, 'session', wallet, jest.fn().mockResolvedValue(response({ ...quote, ...draft, renderer, price_micros: 2450000 })))).renderer).toBe(renderer);
      const hd = { ...input, stage: 'hd' as const };
      await expect(getMaboroshiQuote(hd, 'session', wallet, jest.fn().mockResolvedValue(response({ ...quote, ...hd, renderer })))).rejects.toThrow('account');
    }
    const draft = { ...input, stage: 'draft' as const };
    await expect(getMaboroshiQuote(draft, 'session', wallet, jest.fn().mockResolvedValue(response({ ...quote, ...draft, renderer: 'veo' })))).rejects.toThrow('account');
  });
  it('uses the common payer for an unfunded prepaid balance and submits its verified transfer reference', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response(quote)).mockResolvedValueOnce(response({ state: 'queued', payment_ref: hash }));
    const pay = jest.fn().mockResolvedValue(hash);
    const retire = jest.fn();
    await completeMaboroshiPayment(quote, 'session', () => wallet, pay, retire, fetcher);
    expect(pay).toHaveBeenCalledWith(1000);
    expect(fetcher.mock.calls[1][1].body).toContain(`tx_hash=${hash}`);
    expect(retire).toHaveBeenCalledWith(hash);
  });
  it('passes subscription credits through the same confirmation and keeps transfer receipts untouched', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response(quote)).mockResolvedValueOnce(response({}));
    const retire = jest.fn();
    await completeMaboroshiPayment(quote, 'session', () => wallet, async () => 'credits', retire, fetcher);
    expect(fetcher.mock.calls[1][1].body).toContain('tx_hash=credits');
    expect(retire).not.toHaveBeenCalled();
  });
  it('retries a saved uncertain payment without asking the payer for another transfer', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response({ ...quote, payment_ref: hash })).mockResolvedValueOnce(response({}));
    const pay = jest.fn();
    await completeMaboroshiPayment(quote, 'session', () => wallet, pay, () => {}, fetcher);
    expect(pay).not.toHaveBeenCalled();
  });
  it('refuses another account or a changed quote before payment', async () => {
    const pay = jest.fn();
    await expect(completeMaboroshiPayment(quote, 'session', () => wallet, pay, () => {},
      jest.fn().mockResolvedValue(response({ ...quote, price_micros: 2_000_000 })))).rejects.toThrow('price changed');
    await expect(getMaboroshiQuote(input, 'session', wallet,
      jest.fn().mockResolvedValue(response({ ...quote, wallet: `0x${'3'.repeat(40)}` })))).rejects.toThrow('account');
    expect(pay).not.toHaveBeenCalled();
  });
  it('keeps a paid receipt reusable if the account changes or starting the stage fails', async () => {
    const retire = jest.fn();
    const fetcher = jest.fn().mockResolvedValueOnce(response(quote)).mockResolvedValueOnce(response({ detail: 'uncertain' }, false));
    await expect(completeMaboroshiPayment(quote, 'session', () => wallet, async () => hash, retire, fetcher)).rejects.toThrow('uncertain');
    expect(retire).not.toHaveBeenCalled();
    let active = wallet;
    await expect(completeMaboroshiPayment(quote, 'session', () => active, async () => { active = ''; return hash; }, retire,
      jest.fn().mockResolvedValue(response(quote)))).rejects.toThrow('account changed');
  });
  it('rejects arbitrary paths and stages from an embedded page', () => {
    expect(isMaboroshiPaymentRequest(input)).toBe(true);
    for (const changed of [{ id: '../credits' }, { stage: 'refund' }, { requestId: '' }]) expect(isMaboroshiPaymentRequest({ ...input, ...changed })).toBe(false);
  });
  it('does not retire an unused transfer when another client already paid this stage', async () => {
    const retire = jest.fn();
    await completeMaboroshiPayment(quote, 'session', () => wallet, async () => hash, retire,
      jest.fn().mockResolvedValueOnce(response(quote)).mockResolvedValueOnce(response({ state: 'queued', payment_ref: 'credits' })));
    expect(retire).not.toHaveBeenCalled();
  });
});
