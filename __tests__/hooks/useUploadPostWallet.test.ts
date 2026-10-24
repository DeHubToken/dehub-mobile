jest.mock('react', () => ({ useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('../../context/AuthContext', () => ({
  useUser: () => ({ address: '0xAccount', tokenBalances: { ETH: 0 } }),
  useProvider: () => ({ authMethod: 'local' }),
}));
jest.mock('../../hooks/use-web3', () => ({ useWeb3Provider: () => ({ chainId: 1 }) }));
jest.mock('../../hooks/useCreatorPlans', () => ({ useCreatorPlans: () => ({ planIds: [] }) }));
jest.mock('../../libs/assets.util', () => ({ getFileName: (_: unknown, name: string) => name, guessMime: (_: unknown, type: string) => type }));
jest.mock('../../libs/strings.util', () => ({ mergeHashtagCategories: (_a: unknown, _b: unknown, cats: string[]) => cats }));
jest.mock('../../libs/validators.util', () => ({ filteredStreamInfo: (info: unknown) => info, isValidDataForMinting: () => ({ isError: false }), getTotalBountyAmount: () => 0 }));
jest.mock('../../libs/toast', () => ({ toastError: jest.fn() }));
jest.mock('../../libs/monetization', () => ({ buildStreamInfo: () => ({}), validateMonetization: () => null }));
jest.mock('../../config/constants', () => ({ defaultChainId: 8453, streamInfoKeys: {} }));
jest.mock('../../config/web3.constants', () => ({ supportedNetworks: [{ chainId: 1, label: 'Ethereum' }] }));
jest.mock('../../libs/wallet-core/smart-account', () => ({ isChainAASupported: () => false, hasAASetupFailed: () => false }));
jest.mock('../../config/solana.constants', () => ({ isSolanaChain: (id: number) => id === 101 }));
jest.mock('../../store/upload.store', () => ({ uploadActions: { enqueue: jest.fn(() => true) }, MAX_QUEUE_SIZE: 10 }));
jest.mock('../../services/draftVideo', () => ({ claimDraftVideo: () => undefined }));

import { useUploadPost, type UploadPayload } from '../../hooks/useUploadPost';
import { uploadActions } from '../../store/upload.store';

const payload = (extra: Partial<UploadPayload> = {}): UploadPayload => ({
  bodyText: '', description: 'https://dehub.io/governance/proposal/1', categories: [],
  pickedVideo: null, pickedAudio: null, pickedImages: [], coverUri: null, thumbnailUri: null,
  monetization: { ppvEnabled: false, ppvData: { price: '' }, bountyEnabled: false, bountyData: { rewardPerPerson: '', viewers: '', commenters: '' }, tokenGatedEnabled: false, tokenGateData: { minAmount: '' }, subscribersEnabled: false },
  shouldMint: false, postChainId: 8453, ...extra,
});
const queued = () => { const calls = (uploadActions.enqueue as jest.Mock).mock.calls; return calls[calls.length - 1][0]; };

beforeEach(() => jest.clearAllMocks());

it('queues a quote without a wallet mint choice or a required signing leg', () => {
  const hook = useUploadPost();
  expect(hook.enqueueQuoteJob({ bodyText: 'My quote', description: 'My quote', categories: [],
    pickedVideo: null, pickedAudio: null, pickedImages: [], coverUri: null, thumbnailUri: null, quotedTokenId: 7 })).toBe(true);
  expect(queued()).toMatchObject({ isQuote: true, mintOptOut: true, quotedTokenId: 7, walletAddress: '0xaccount' });
});

it('posts an off-chain entity share without requiring gas on the current network', () => {
  const hook = useUploadPost();
  expect(hook.preUploadCheck(payload()).valid).toBe(true);
  expect(hook.enqueueJob(payload())).toBe(true);
  expect(queued()).toMatchObject({ isQuote: false, mintOptOut: true });
});

it('does not derive a Solana signer for an off-chain post', () => {
  const hook = useUploadPost();
  expect(hook.enqueueJob(payload({ postChainId: 101 }))).toBe(true);
  expect(queued()).toMatchObject({ mintOptOut: true, isSolana: false });
});

it('retains gas and Solana signer requirements when minting is requested', () => {
  const hook = useUploadPost();
  expect(hook.preUploadCheck(payload({ shouldMint: true })).valid).toBe(false);
  expect(hook.enqueueJob(payload({ shouldMint: true, postChainId: 101 }))).toBe(false);
  expect(uploadActions.enqueue).not.toHaveBeenCalled();
});

it('keeps an explicitly selected mint on chain', () => {
  expect(useUploadPost().enqueueJob(payload({ shouldMint: true }))).toBe(true);
  expect(queued().mintOptOut).toBe(false);
});

it('retains the mint requirement for a funded bounty', () => {
  const monetization: UploadPayload['monetization'] = { ...payload().monetization, bountyEnabled: true, bountyData: { rewardPerPerson: '1', viewers: '2', commenters: '2' } };
  expect(useUploadPost().enqueueJob(payload({ monetization }))).toBe(true);
  expect(queued()).toMatchObject({ isBounty: true, mintOptOut: false });
});
