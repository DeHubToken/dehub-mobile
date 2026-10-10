import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { ethers } from 'ethers';
import Svg, { Path } from 'react-native-svg';
import qrcode from 'qrcode-generator';
import ScreenHeader from '../ScreenHeader';
import GlassModal from '../ui/GlassModal';
import ChromeSurface from '../ui/ChromeSurface';
import Icon, { type IconName } from '../ui/Icon';
import { KitButton, PageSection, PageTabs } from '../page/PageKit';
import { DeHubRefreshControl } from '../Feed/DeHubRefreshControl';
import { useUser } from '../../context/AuthContext';
import { useWalletTokens } from '../../hooks/useWalletTokens';
import { useSubscriptionCredits } from '../../hooks/useSubscriptionCredits';
import { useDexSigner } from '../../hooks/useDexSigner';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import { dhbPosition, dhbBreakdown } from '../../libs/dhb-position';
import { groupWalletTokens, readWalletTokenMetadata, saveWalletToken, WALLET_CHAINS, type WalletGroup, type WalletToken, type TokenMetadata } from '../../libs/wallet-tokens';
import { writeContractAA } from '../../libs/aa.write';
import { copyToClipboard } from '../../libs/clipboard.utils';
import { toastInfo, toastSuccess } from '../../libs/toast';
import { ScreenNames } from '../../navigation/ScreenNames';
import { FIELD_TEXT } from '../../theme/inputs';
import TradeSheet from './TradeSheet';
import ArcSendSheet from './ArcSendSheet';
import AddressInputTools from '../common/AddressInputTools';

const ICONS: Record<string, any> = {
  DHB: require('../../assets/web-icons/dehub-coin.png'),
  ETH: require('../../assets/chains/ethereum-icon.png'),
  BNB: require('../../assets/chains/bnb-icon.png'),
  USDC: require('../../assets/tokens/USDC.png'),
  USDT: require('../../assets/tokens/USDT.png'),
};
const format = (value: number) => value > 0 && value < 0.01 ? '<0.01' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const networkName = (chainId: number) => WALLET_CHAINS.find(chain => chain.id === chainId)?.name || String(chainId);

function Action({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.action, { opacity: pressed ? 0.65 : 1 }]}>
    <ChromeSurface radius={12} />
    <Icon name={icon} size={20} color="#fff" />
    <Text numberOfLines={1} adjustsFontSizeToFit style={s.actionLabel}>{label}</Text>
  </Pressable>;
}
function TokenIcon({ symbol }: { symbol: string }) {
  return ICONS[symbol] ? <Image source={ICONS[symbol]} style={s.tokenIcon} /> : <View style={[s.tokenIcon, s.unknownIcon]}><Text style={s.muted}>{symbol.slice(0, 3)}</Text></View>;
}
function AddressQr({ address }: { address: string }) {
  const qr = useMemo(() => {
    const code = qrcode(0, 'M'); code.addData(address); code.make();
    const size = code.getModuleCount();
    let path = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (code.isDark(y, x)) path += `M${x + 4},${y + 4}h1v1h-1z`;
    return { size: size + 8, path };
  }, [address]);
  return <View style={s.qr}><Svg width={200} height={200} viewBox={`0 0 ${qr.size} ${qr.size}`}><Path fill="#000" d={qr.path} /></Svg></View>;
}

export default function WalletOverview({ onBuy, onStake }: { onBuy: () => void; onStake: () => void }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const user = useUser();
  const wallet = useWalletTokens();
  const { data: credits } = useSubscriptionCredits();
  const [search, setSearch] = useSurfaceDraft('wallet:search', '');
  const [group, setGroup] = useState<WalletGroup | null>(null);
  const [receive, setReceive] = useState(false);
  const [receiveNetwork, setReceiveNetwork] = useState('evm');
  const [send, setSend] = useState<WalletToken | null>(null);
  const [sendPicker, setSendPicker] = useState<WalletToken[] | null>(null);
  const [trade, setTrade] = useState(false);
  const [importing, setImporting] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [arc, setArc] = useState<WalletToken | null>(null);
  const groups = useMemo(() => groupWalletTokens(wallet.tokens), [wallet.tokens]);
  const query = search.trim().toLowerCase();
  const visible = groups.filter(item => `${item.symbol} ${item.name}`.toLowerCase().includes(query) && (item.amount > 0 || item.unknown || item.tokens.some(token => token.isCustom)));
  const position = dhbPosition(user, groups.find(item => item.symbol === 'DHB')?.amount || 0);
  const rows = dhbBreakdown(user).rows;
  const staked = rows.reduce((sum, row) => sum + row.staked, 0);
  const usd = wallet.tokens.reduce((sum, token) => sum + Number(token.balance || 0) * (wallet.prices[token.symbol] || 0), staked * (wallet.prices.DHB || 0));
  const receiveAddress = receiveNetwork === 'solana' && wallet.solanaAddress ? wallet.solanaAddress : wallet.address;
  const funded = wallet.tokens.filter(token => Number(token.balance) > 0);

  function openSend(tokens: WalletToken[]) {
    setGroup(null);
    const options = tokens.filter(token => Number(token.balance) > 0 && token.chainId !== 101);
    if (!options.length) {
      toastInfo(tokens.some(token => token.chainId === 101 && Number(token.balance) > 0)
        ? t('wallet.solanaSendUnavailable', 'Sending on Solana is not available yet') : t('wallet.noTokensToSend'));
    } else if (options.length > 1) setSendPicker(options);
    else selectSend(options[0]);
  }
  function selectSend(token: WalletToken) {
    setSendPicker(null);
    if (token.chainId === 5042 && token.isNative) setArc(token);
    else setSend(token);
  }

  return <View style={s.screen}>
    <ScreenHeader title={t('wallet.title')} icon="wallet" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}
      refreshControl={<DeHubRefreshControl refreshing={wallet.refreshing} onRefresh={() => { void wallet.refresh(); }} />}>
      <PageSection>
        <Text style={s.eyebrow}>{t('wallet.title')}</Text>
        <View style={s.balanceRow}>
          <TokenIcon symbol="DHB" />
          <Text numberOfLines={1} adjustsFontSizeToFit style={s.total}>{format(position)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.moreInfo')} onPress={() => setBreakdown(!breakdown)} hitSlop={10}><Icon name="Info" size={18} color="#aaa" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('wallet.copyAddress')} onPress={() => setReceive(true)} hitSlop={10}><Icon name="Copy" size={18} color="#aaa" /></Pressable>
        </View>
        <Text style={s.muted}>{t('wallet.totalWalletValue')}: {wallet.tokens.length && Object.keys(wallet.prices).length ? `${wallet.failedChains.length ? '≈ ' : ''}$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</Text>
        {breakdown && <View style={s.sectionGap}>
          <Text style={s.muted}>{t('assets.dhbPositionNote')}</Text>
          {rows.map(row => <View key={row.chain} style={s.listRow}><Text style={s.label}>{row.chain}</Text><Text style={s.muted}>{format(row.wallet)} {t('assets.held')} · {format(row.staked)} {t('assets.staked')}</Text></View>)}
        </View>}
      </PageSection>
      <View style={s.inset}>
        <View style={s.actions}>
          <Action label={t('wallet.receive')} icon="ArrowDownToLine" onPress={() => setReceive(true)} />
          <Action label={t('wallet.send')} icon="Send" onPress={() => openSend(funded)} />
          <Action label={t('wallet.buy')} icon="ShoppingCart" onPress={onBuy} />
          <Action label={t('wallet.stake')} icon="Lock" onPress={onStake} />
          <Action label={t('nav.bridge')} icon="ArrowLeftRight" onPress={() => navigation.navigate(ScreenNames.Bridge)} />
          <Action label={t('wallet.trade')} icon="ChartNoAxesColumn" onPress={() => setTrade(true)} />
        </View>
        <View style={s.search}>
          <Icon name="Search" size={18} color="#999" />
          <TextInput accessibilityLabel={t('wallet.searchTokens')} placeholder={t('wallet.searchTokens')} placeholderTextColor="#999" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} style={[s.searchInput, FIELD_TEXT]} />
        </View>
        {wallet.failedChains.length > 0 && <View style={s.notice}>
          <Text style={s.muted}>{t('common.failedToLoad')}: {wallet.failedChains.map(chain => chain.name).join(', ')}</Text>
          <KitButton label={t('common.retry')} variant="quiet" onPress={() => { void wallet.refresh(); }} />
        </View>}
        {wallet.loading && wallet.tokens.length === 0 ? <ActivityIndicator style={s.loading} color="#aaa" /> : null}
        {visible.map(item => <Pressable key={item.symbol} accessibilityRole="button" accessibilityLabel={`${item.symbol}, ${item.unknown ? t('common.failedToLoad') : format(item.amount)}`} onPress={() => setGroup(item)} style={s.tokenRow}>
          <TokenIcon symbol={item.symbol} />
          <View style={s.tokenName}><Text style={s.label}>{item.symbol}</Text><Text numberOfLines={1} style={s.muted}>{[...new Set(item.tokens.filter(token => Number(token.balance) > 0 || token.isCustom).map(token => networkName(token.chainId)))].join(' · ') || item.name}</Text></View>
          <View style={s.tokenValue}><Text numberOfLines={1} adjustsFontSizeToFit style={s.label}>{item.unknown ? '≈ ' : ''}{format(item.amount)}</Text><Text style={s.muted}>{wallet.prices[item.symbol] ? `$${(item.amount * wallet.prices[item.symbol]).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</Text></View>
          <Icon name="ChevronRight" size={16} color="#999" />
        </Pressable>)}
        {!wallet.loading && !visible.length && !wallet.failedChains.length && <Text style={s.empty}>{t(query ? 'common.noResults' : 'wallet.zeroBalance')}</Text>}
        {!!credits?.tokens && (!query || t('credits.subscriptionTokens').toLowerCase().includes(query)) && <Pressable style={s.tokenRow} onPress={() => toastInfo(t('credits.untradableTokens'))}>
          <TokenIcon symbol="DHB" /><View style={s.tokenName}><Text style={s.label}>{t('credits.subscriptionTokens')}</Text><Text style={s.muted}>{t('credits.subscriptionTokensOnly')}</Text></View><Text style={s.label}>{format(credits.tokens)}</Text>
        </Pressable>}
        <KitButton label={t('wallet.importCustomToken')} variant="quiet" icon={<Icon name="Plus" size={18} color="#fff" />} onPress={() => setImporting(true)} />
      </View>
    </ScrollView>

    <GlassModal visible={receive} onClose={() => setReceive(false)} presentation="bottom" scrollable>
      <View style={s.sheet}>
        <Text style={s.title}>{t('wallet.receiveTokens')}</Text>
        {wallet.solanaAddress && <PageTabs value={receiveNetwork} onChange={setReceiveNetwork} tabs={[{ id: 'evm', label: t('wallet.evmAddressLabel') }, { id: 'solana', label: 'Solana' }]} />}
        <Text style={s.muted}>{t(receiveNetwork === 'solana' ? 'wallet.solanaAddressHint' : 'wallet.receiveDescription')}</Text>
        {!!receiveAddress && <AddressQr address={receiveAddress} />}
        <Text selectable style={s.address}>{receiveAddress}</Text>
        <KitButton label={t('wallet.copyAddress')} onPress={() => { void copyToClipboard(receiveAddress); toastSuccess(t('wallet.addressCopied')); }} />
      </View>
    </GlassModal>
    <GlassModal visible={!!group} onClose={() => setGroup(null)} presentation="bottom" scrollable>
      {group && <View style={s.sheet}>
        <Text style={s.title}>{group.symbol} · {format(group.amount)}</Text>
        {group.tokens.map(token => <View key={`${token.chainId}:${token.address}`} style={s.listRow}><Text style={s.label}>{networkName(token.chainId)}</Text><Text style={s.muted}>{token.balance === null ? '—' : format(Number(token.balance))}</Text></View>)}
        <View style={s.actions}>
          <Action label={t('wallet.send')} icon="Send" onPress={() => openSend(group.tokens)} />
          <Action label={t('wallet.receive')} icon="ArrowDownToLine" onPress={() => { setReceiveNetwork(group.tokens.every(token => token.chainId === 101) ? 'solana' : 'evm'); setGroup(null); setReceive(true); }} />
          <Action label={t('wallet.trade')} icon="ArrowLeftRight" onPress={() => { const dhb = group.symbol === 'DHB'; setGroup(null); if (dhb) setTrade(true); else navigation.navigate(ScreenNames.Dex); }} />
        </View>
      </View>}
    </GlassModal>
    <GlassModal visible={!!sendPicker} onClose={() => setSendPicker(null)} presentation="bottom" scrollable>
      <View style={s.sheet}><Text style={s.title}>{t('wallet.send')} · {t('wallet.chooseNetwork')}</Text>
        {sendPicker?.map(token => <Pressable key={`${token.chainId}:${token.address}`} onPress={() => selectSend(token)} style={s.tokenRow}><TokenIcon symbol={token.symbol} /><View style={s.tokenName}><Text style={s.label}>{token.symbol}</Text><Text style={s.muted}>{networkName(token.chainId)}</Text></View><Text style={s.label}>{format(Number(token.balance))}</Text></Pressable>)}
      </View>
    </GlassModal>
    {send && <SendTokenSheet key={`${send.chainId}:${send.address}`} token={send} owner={wallet.address} onClose={() => setSend(null)} onSent={() => { void wallet.refresh(); }} />}
    <TradeSheet visible={trade} onClose={() => setTrade(false)} address={wallet.address} />
    <ArcSendSheet open={!!arc} onClose={() => setArc(null)} address={wallet.address} balance={Number(arc?.balance || 0)} onSent={() => { void wallet.refresh(); }} />
    {importing && <ImportTokenSheet onClose={() => setImporting(false)} onImported={() => { setImporting(false); void wallet.refresh(); }} />}
  </View>;
}

function SendTokenSheet({ token, owner, onClose, onSent }: { token: WalletToken; owner: string; onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation();
  const signer = useDexSigner();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useSurfaceDraft(`wallet:send:${token.chainId}:${token.address}`, '');
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    if (busy || hash) return;
    setError('');
    if (!ethers.utils.isAddress(to.trim())) { setError(t('wallet.invalidAddress')); return; }
    let value: ethers.BigNumber;
    try { value = ethers.utils.parseUnits(amount, token.decimals); if (value.lte(0)) throw new Error(); }
    catch { setError(t('wallet.invalidAmount')); return; }
    if (token.balance === null || value.gt(ethers.utils.parseUnits(token.balance, token.decimals))) { setError(t('wallet.insufficientBalance', { symbol: token.symbol })); return; }
    setBusy(true);
    try {
      const provider = await signer(token.chainId, t('wallet.notReady'));
      const web3 = new ethers.providers.Web3Provider(provider as any, 'any');
      if ((await web3.getSigner().getAddress()).toLowerCase() !== owner.toLowerCase()) throw new Error(t('wallet.connectedWrongWallet', { connected: await web3.getSigner().getAddress(), address: owner }));
      if (Number(await provider.request({ method: 'eth_chainId' })) !== token.chainId) throw new Error(t('wallet.notReady'));
      const result = token.isNative
        ? await web3.getSigner().sendTransaction({ to: to.trim(), value })
        : await writeContractAA(new ethers.Contract(token.address, ['function transfer(address,uint256) returns(bool)'], web3.getSigner()), 'transfer', [to.trim(), value], { context: 'send' });
      if (result.hash) setHash(result.hash);
      const receipt = await result.wait(1);
      if (receipt?.status === 0) throw new Error(t('wallet.transactionFailed'));
      toastSuccess(t('wallet.sent', { amount, symbol: token.symbol }));
      setAmount.complete(amount, ''); onSent(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : t('wallet.transactionFailed')); }
    finally { setBusy(false); }
  }
  return <GlassModal visible onClose={onClose} presentation="bottom" scrollable dismissible={!busy}>
    <View style={s.sheet}>
      <Text style={s.title}>{t('wallet.sendToken', { symbol: token.symbol })}</Text>
      <Text style={s.muted}>{networkName(token.chainId)} · {format(Number(token.balance))} {token.symbol}</Text>
      <TextInput accessibilityLabel={t('wallet.recipientAddress')} placeholder={t('wallet.recipientAddress')} placeholderTextColor="#999" value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} editable={!busy && !hash} style={[s.input, FIELD_TEXT]} />
      <AddressInputTools onValue={setTo} scan disabled={busy || !!hash} />
      <TextInput accessibilityLabel={t('wallet.amount')} placeholder={t('wallet.amount')} placeholderTextColor="#999" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy && !hash} style={[s.input, FIELD_TEXT]} />
      {!!hash && <Text selectable style={s.muted}>{hash}</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <KitButton label={busy ? t('wallet.sending') : hash ? t('common.done') : t('wallet.sendToken', { symbol: token.symbol })} disabled={busy || (!hash && (!to.trim() || !amount))} onPress={hash ? onClose : () => { void submit(); }} />
    </View>
  </GlassModal>;
}

function ImportTokenSheet({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { t } = useTranslation();
  const [chain, setChain] = useState('8453');
  const [address, setAddress] = useState('');
  const [token, setToken] = useState<TokenMetadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function lookup() {
    setBusy(true); setError('');
    try { setToken(await readWalletTokenMetadata(address.trim(), Number(chain))); }
    catch { setError(t('wallet.cannotReadContract')); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!token || busy) return;
    setBusy(true);
    try { await saveWalletToken(token); toastSuccess(t('wallet.imported', { symbol: token.symbol })); onImported(); }
    catch { setError(t('common.somethingWentWrong')); }
    finally { setBusy(false); }
  }
  return <GlassModal visible onClose={onClose} presentation="bottom" scrollable>
    <View style={s.sheet}>
      <Text style={s.title}>{t('wallet.importCustomToken')}</Text>
      <PageTabs value={chain} onChange={id => { setChain(id); setToken(null); setError(''); }} tabs={WALLET_CHAINS.map(item => ({ id: String(item.id), label: item.name }))} />
      <TextInput accessibilityLabel={t('wallet.tokenContractAddress')} placeholder={t('wallet.tokenContractAddress')} placeholderTextColor="#999" value={address} onChangeText={value => { setAddress(value); setToken(null); }} editable={!busy} autoCapitalize="none" autoCorrect={false} style={[s.input, FIELD_TEXT]} />
      {!!error && <Text style={s.error}>{error}</Text>}
      {token && <Text style={s.label}>{token.name} · {token.symbol} · {token.decimals} {t('wallet.decimals')}</Text>}
      <KitButton label={busy ? t('wallet.lookingUp') : token ? t('wallet.importToken', { symbol: token.symbol }) : t('wallet.lookUpToken')} disabled={busy || !address.trim()} onPress={() => { void (token ? save() : lookup()); }} />
    </View>
  </GlassModal>;
}

const s = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingBottom: 40 }, inset: { paddingHorizontal: 16, gap: 16 },
  eyebrow: { color: '#aaa', fontSize: 13, marginBottom: 12 }, balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  total: { flex: 1, color: '#fff', fontSize: 30, fontWeight: '700' }, title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, action: { flexGrow: 1, flexBasis: '30%', minHeight: 72, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  actionLabel: { color: '#fff', fontSize: 12, fontWeight: '500' }, label: { color: '#fff', fontSize: 15, fontWeight: '500' }, muted: { color: '#9b9ba3', fontSize: 12, lineHeight: 18 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput: { flex: 1, color: '#fff', minHeight: 44, fontSize: 14, paddingVertical: 8 },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 }, tokenIcon: { width: 32, height: 32, borderRadius: 16 }, unknownIcon: { backgroundColor: '#303034', alignItems: 'center', justifyContent: 'center' },
  tokenName: { flex: 1, gap: 3 }, tokenValue: { alignItems: 'flex-end', maxWidth: '40%', gap: 3 }, empty: { color: '#aaa', textAlign: 'center', paddingVertical: 30 },
  loading: { padding: 30 }, notice: { gap: 10, paddingVertical: 8 }, sheet: { padding: 20, gap: 18 }, sectionGap: { marginTop: 16, gap: 10 }, listRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  input: { minHeight: 48, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 12, paddingHorizontal: 14 },
  address: { color: '#fff', textAlign: 'center', fontSize: 13, lineHeight: 20 }, qr: { alignSelf: 'center', backgroundColor: '#fff', padding: 8, borderRadius: 12 }, error: { color: '#fca5a5', fontSize: 13 },
});
