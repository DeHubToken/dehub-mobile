jest.mock('../services/ai.service', () => ({ quoteAiJob: jest.fn() }));
import { quoteAiJob } from '../services/ai.service';
import { confirmQuotedJob } from '../libs/confirmJobQuote';

it('never signs or pays when the live price changed', async () => {
  const pay = jest.fn();
  (quoteAiJob as jest.Mock).mockResolvedValue({ priceDhb: 1821 });
  await expect(confirmQuotedJob({ kind: 'video', modelId: 'seedance-2.0' }, 990, () => true, pay, 'Recheck price')).rejects.toThrow('Recheck price');
  expect(pay).not.toHaveBeenCalled();
});
it('never pays a request that changed while the server quote was loading', async () => {
  const pay = jest.fn();
  (quoteAiJob as jest.Mock).mockResolvedValue({ priceDhb: 990 });
  await expect(confirmQuotedJob({ kind: 'video', modelId: 'seedance-2.0' }, 990, () => false, pay, 'Recheck price')).rejects.toThrow('Recheck price');
  expect(pay).not.toHaveBeenCalled();
});
it('pays the exact accepted price only after a matching live quote', async () => {
  const pay = jest.fn().mockResolvedValue('receipt');
  (quoteAiJob as jest.Mock).mockResolvedValue({ priceDhb: 990 });
  expect(await confirmQuotedJob({ kind: 'video', modelId: 'seedance-2.0' }, 990, () => true, pay, 'Recheck price')).toBe('receipt');
  expect(pay).toHaveBeenCalledWith(990);
});
