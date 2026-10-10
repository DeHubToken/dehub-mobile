import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Image: 'Image', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 } }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../../components/ScreenHeader', () => 'ScreenHeader');
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/ChromeSurface', () => 'ChromeSurface');
jest.mock('../../components/ui/GlassModal', () => ({ visible, children }: any) => visible ? children : null);
jest.mock('../../components/page/PageKit', () => ({
  PageSection: ({ children }: any) => children,
  KitButton: ({ label, onPress }: any) => React.createElement('Pressable', { accessibilityLabel: label, onPress }),
  PageTabs: () => null,
}));
jest.mock('../../components/Feed/DeHubRefreshControl', () => ({ DeHubRefreshControl: 'RefreshControl' }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ ownBadgeBalance: 100, balanceData: [] }) }));
jest.mock('../../hooks/useSubscriptionCredits', () => ({ useSubscriptionCredits: () => ({ data: null }) }));
jest.mock('../../hooks/useDexSigner', () => ({ useDexSigner: () => jest.fn() }));
jest.mock('../../hooks/useSurfaceDraft', () => ({ useSurfaceDraft: (_key: string, initial: string) => React.useState(initial) }));
jest.mock('../../libs/aa.write', () => ({ writeContractAA: jest.fn() }));
jest.mock('../../libs/clipboard.utils', () => ({ copyToClipboard: jest.fn() }));
jest.mock('../../libs/toast', () => ({ toastInfo: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('../../components/Wallet/TradeSheet', () => 'TradeSheet');
jest.mock('../../components/Wallet/ArcSendSheet', () => 'ArcSendSheet');
jest.mock('../../components/common/AddressInputTools', () => 'AddressInputTools');
jest.mock('../../config/web3.constants', () => ({ NETWORK_URLS: {} }));
jest.mock('../../config/solana.constants', () => ({ SOLANA_MAINNET_CHAIN_ID: 101, SOLANA_SPL_TOKENS: [], getSolanaRpcUrl: () => '' }));
const mockRefresh = jest.fn();
const mockWallet = { address: '0x1111111111111111111111111111111111111111', solanaAddress: null, prices: {}, tokens: [], loading: false, refreshing: false, failedChains: [] as Array<{ id: number; name: string }>, refresh: mockRefresh };
jest.mock('../../hooks/useWalletTokens', () => ({ useWalletTokens: () => mockWallet }));
import WalletOverview from '../../components/Wallet/WalletOverview';
import { ScreenNames } from '../../navigation/ScreenNames';

const press = (tree: ReactTestRenderer, label: string) => act(() => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0].props.onPress());
afterEach(() => { jest.clearAllMocks(); mockWallet.failedChains = []; });

it('opens the wallet actions immediately even when balances have not loaded', () => {
  const buy = jest.fn(); const stake = jest.fn(); let tree!: ReactTestRenderer;
  act(() => { tree = create(<WalletOverview onBuy={buy} onStake={stake} />); });
  press(tree, 'wallet.buy'); expect(buy).toHaveBeenCalledTimes(1);
  press(tree, 'wallet.stake'); expect(stake).toHaveBeenCalledTimes(1);
  press(tree, 'nav.bridge'); expect(mockNavigate).toHaveBeenCalledWith(ScreenNames.Bridge);
  press(tree, 'wallet.trade'); expect(tree.root.findByType('TradeSheet' as any).props.visible).toBe(true);
  press(tree, 'wallet.receive'); expect(tree.root.findAllByType('Svg' as any)).toHaveLength(1);
  expect(tree.root.findAll(node => node.type === 'Text' && node.props.children === mockWallet.address)).toHaveLength(1);
  act(() => tree.unmount());
});

it('offers retry for failed networks without hiding the action buttons', () => {
  mockWallet.failedChains = [{ id: 1, name: 'Ethereum' }]; let tree!: ReactTestRenderer;
  act(() => { tree = create(<WalletOverview onBuy={jest.fn()} onStake={jest.fn()} />); });
  press(tree, 'common.retry'); expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'wallet.send')).toHaveLength(1);
  act(() => tree.unmount());
});
