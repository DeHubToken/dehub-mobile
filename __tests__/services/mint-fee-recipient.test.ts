import { currentMintFeeRecipient } from '../../services/mint-fee-recipient';
import { getMintFee } from '../../services/nft.service';
jest.mock('../../services/nft.service', () => ({ getMintFee: jest.fn() }));
beforeEach(() => jest.resetAllMocks());
it('gets the current destination for an already-open composer', async () => {
  const recipient = '0x00Fbd6854BCCe7B94B549E61370578bbD8Bb646B';
  (getMintFee as jest.Mock).mockResolvedValue({ chainId: 8453, chargeable: true, recipient });
  expect(await currentMintFeeRecipient(8453)).toBe(recipient);
  expect(getMintFee).toHaveBeenCalledWith(8453);
});
it.each([null, { chainId: 56, chargeable: true, recipient: '0x00Fbd6854BCCe7B94B549E61370578bbD8Bb646B' },
  { chainId: 8453, chargeable: true, recipient: 'invalid' }, { chainId: 8453, chargeable: false }])
('refuses an unavailable, invalid or wrong-chain destination', async quote => {
  (getMintFee as jest.Mock).mockResolvedValue(quote);
  await expect(currentMintFeeRecipient(8453)).rejects.toThrow('destination');
});
