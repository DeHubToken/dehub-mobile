import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dropdown } from 'react-native-element-dropdown';
import Icon from '../ui/Icon';
import { useUser } from '../../context/AuthContext';
import { useWeb3Provider, useERC20Contract } from '../../hooks/use-web3';
import * as ethersImport from 'ethers';
import { writeContractAA } from '../../libs/aa.write';
import { getDHBPrice, type AIImageModel } from '../../services/ai.service';
import { DHB_ADDRESSESS } from '../../config/constants';
import { toastError } from '../../libs';
import { createLogger } from '../../libs/logger';

const log = createLogger('ImagePaywallModal');
const DEHUB_COIN = require('../../assets/web-icons/dehub-coin.png');
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.72;
const TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';

interface ImageModel {
  id: AIImageModel;
  name: string;
  description: string;
  baseCostUsd: number;
}

const IMAGE_MODELS: ImageModel[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast, balanced quality', baseCostUsd: 0.02 },
  { id: 'gemini-3-pro-image', name: 'Gemini 3 Pro', description: 'Latest, highest quality', baseCostUsd: 0.08 },
  { id: 'grok-aurora', name: 'Grok Aurora', description: 'xAI image generation', baseCostUsd: 0.06 },
];

export interface ImagePaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (model: AIImageModel) => void;
}

const formatDHB = (n: number): string => {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
};

const ImagePaywallModalComponent: React.FC<ImagePaywallModalProps> = ({
  visible,
  onClose,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { account, chainId } = useWeb3Provider();
  const dhbAddress = chainId ? DHB_ADDRESSESS[chainId] : undefined;
  const tokenContract = useERC20Contract(dhbAddress);

  const [selectedModel, setSelectedModel] = useState<AIImageModel>('gemini-2.5-flash');
  const [dhbPrice, setDhbPrice] = useState<number>(0);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [paying, setPaying] = useState(false);

  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  const balance = (user?.tokenBalances?.DHB ?? 0) as number;

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
      fetchPrice();
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, { duration: 220, easing: Easing.in(Easing.cubic) }, () =>
        runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const fetchPrice = useCallback(async () => {
    setLoadingPrice(true);
    log.debug('Fetching DHB price...');
    try {
      const price = await getDHBPrice();
      log.debug('DHB price received:', price);
      setDhbPrice(price);
    } catch (err) {
      log.error('Failed to fetch DHB price:', err);
    } finally {
      setLoadingPrice(false);
    }
  }, []);

  const modelConfig = useMemo(
    () => IMAGE_MODELS.find((m) => m.id === selectedModel) || IMAGE_MODELS[0],
    [selectedModel],
  );

  const costUsd = modelConfig.baseCostUsd * 2;

  const costInDHB = useMemo(() => {
    if (!dhbPrice || dhbPrice <= 0) return 0;
    return Math.ceil(costUsd / dhbPrice);
  }, [costUsd, dhbPrice]);

  const insufficientBalance = costInDHB > 0 && balance < costInDHB;
  const shortfall = costInDHB - Math.floor(balance);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, { duration: 220, easing: Easing.in(Easing.cubic) }, () =>
      runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => { if (e.translationY > 0) translateY.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 60 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  const dropdownData = useMemo(() => IMAGE_MODELS.map((m) => {
    const mCost = m.baseCostUsd * 2;
    const mDhb = dhbPrice > 0 ? Math.ceil(mCost / dhbPrice) : 0;
    return { ...m, label: m.name, value: m.id, mCost, mDhb };
  }), [dhbPrice]);

  const handleGenerate = useCallback(async () => {
    if (!tokenContract || !account || costInDHB <= 0) {
      toastError('Wallet not connected or price unavailable');
      return;
    }
    if (insufficientBalance) {
      toastError(`Insufficient DHB balance. You need ${formatDHB(shortfall)} more DHB.`);
      return;
    }

    setPaying(true);
    log.debug('Starting image payment:', { model: selectedModel, costInDHB, account });
    try {
      const ethers = (ethersImport as any).ethers || ethersImport;
      const amountWei = ethers.utils.parseUnits(String(costInDHB), 18);
      log.debug('Transfer amount (wei):', amountWei.toString());

      await writeContractAA(tokenContract, 'transfer', [TREASURY, amountWei], {
        context: 'ai-image',
      });

      log.debug('Payment successful');
      closeSheet();
      setTimeout(() => onConfirm(selectedModel), 250);
    } catch (err: any) {
      log.error('Payment failed:', err);
      toastError(err?.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  }, [tokenContract, account, costInDHB, selectedModel, closeSheet, onConfirm, insufficientBalance, shortfall]);

  if (isFullyClosed && !visible) return null;

  return (
    <Modal visible={!isFullyClosed} transparent animationType="none" statusBarTranslucent onRequestClose={closeSheet}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, backdropStyle]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSheet} />
        </Animated.View>

        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 16 }, sheetStyle]}>
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFill}
            {...(Platform.OS === 'android' ? { experimentalBlurMethod: 'dimezisBlurView' } : {})}
          />
          <View style={[StyleSheet.absoluteFill, s.overlay]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View>
              <View style={s.handleWrap}><View style={s.handle} /></View>
            </Animated.View>
          </GestureDetector>

          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={s.headerRow}>
              <View style={s.headerLeft}>
                <Icon name="Image" size={22} color="#F9FBFF" />
                <Text style={s.title}>Generate Image</Text>
              </View>
              <TouchableOpacity onPress={closeSheet} activeOpacity={0.7}>
                <Icon name="X" size={20} color="#6F7174" />
              </TouchableOpacity>
            </View>
            <Text style={s.subtitle}>Select a model and confirm payment</Text>

            <Dropdown
              data={dropdownData}
              labelField="label"
              valueField="value"
              value={selectedModel}
              onChange={(item) => setSelectedModel(item.value)}
              style={s.dropdown}
              containerStyle={s.dropdownContainer}
              activeColor="rgba(42,106,255,0.12)"
              selectedTextStyle={s.dropdownSelectedText}
              placeholderStyle={s.dropdownSelectedText}
              iconColor="#6F7174"
              renderLeftIcon={() => (
                <View style={{ marginRight: 10 }}>
                  <Icon name="Zap" size={16} color="#F5C542" />
                </View>
              )}
              renderItem={(item) => (
                <View style={s.dropdownItem}>
                  <View style={s.dropdownLeft}>
                    <Icon name="Zap" size={14} color="#A6A9AC" />
                    <View>
                      <Text style={s.dropdownName}>{item.name}</Text>
                      <Text style={s.dropdownDesc}>{item.description}</Text>
                    </View>
                  </View>
                  <View style={s.dropdownRight}>
                    <Text style={s.dropdownPrice}>${item.mCost.toFixed(2)}</Text>
                    <Text style={s.dropdownDhb}>{item.mDhb > 0 ? `${formatDHB(item.mDhb)} DHB` : '—'}</Text>
                  </View>
                </View>
              )}
            />

            <View style={s.costSection}>
              <View style={s.costLine}>
                <Text style={s.costLabel}>Image Cost</Text>
                <Text style={s.costValue}>${costUsd.toFixed(2)}</Text>
              </View>
              <View style={s.costLine}>
                <Text style={s.costLabel}>Staker Discount</Text>
                <Text style={[s.costValue, { color: '#00C566' }]}>0%</Text>
              </View>
              <View style={s.divider} />
              <View style={s.costLine}>
                <Text style={[s.costLabel, { fontWeight: '600' }]}>Total</Text>
                <Text style={[s.costValue, { fontWeight: '700' }]}>${costUsd.toFixed(2)}</Text>
              </View>
            </View>

            <View style={s.paySection}>
              <View style={s.payRow}>
                <View style={s.payLeft}>
                  <Image source={DEHUB_COIN} style={s.coinIcon} />
                  <Text style={s.payLabel}>Pay with DHB</Text>
                </View>
                <View style={s.payRight}>
                  {loadingPrice ? (
                    <ActivityIndicator size="small" color="#D4A843" />
                  ) : (
                    <>
                      <Text style={s.payAmount}>{costInDHB > 0 ? `${formatDHB(costInDHB)} DHB` : '— DHB'}</Text>
                      {dhbPrice > 0 && (
                        <Text style={s.payRate}>@ ${dhbPrice.toFixed(6)}/DHB</Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>

            <View style={s.balanceRow}>
              <Text style={s.balanceLabel}>Your Balance</Text>
              <View style={s.balanceRight}>
                <Image source={DEHUB_COIN} style={s.balanceCoin} />
                <Text style={[s.balanceAmount, insufficientBalance && { color: '#EF4444' }]}>
                  {Math.floor(balance).toLocaleString()} DHB
                </Text>
              </View>
            </View>

            {insufficientBalance && (
              <View style={s.warningBanner}>
                <Text style={s.warningText}>
                  Insufficient DHB balance. You need {formatDHB(shortfall)} more DHB.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={closeSheet} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.generateBtn, (paying || costInDHB <= 0 || insufficientBalance) && s.generateBtnDisabled]}
              onPress={handleGenerate}
              disabled={paying || costInDHB <= 0 || insufficientBalance}
              activeOpacity={0.7}
            >
              {paying ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={s.generateBtnText}>Generate</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  overlay: {
    backgroundColor: 'rgba(12,12,14,0.88)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#F9FBFF', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#6F7174', fontSize: 13, paddingHorizontal: 20, marginBottom: 16 },
  dropdown: {
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A6AFF',
    backgroundColor: 'rgba(42,106,255,0.06)',
  },
  dropdownContainer: {
    backgroundColor: '#1A1A1D',
    borderRadius: 12,
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  dropdownSelectedText: { color: '#F9FBFF', fontSize: 15, fontWeight: '600' },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dropdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropdownName: { color: '#F9FBFF', fontSize: 14, fontWeight: '500' },
  dropdownDesc: { color: '#6F7174', fontSize: 11, marginTop: 1 },
  dropdownRight: { alignItems: 'flex-end' },
  dropdownPrice: { color: '#F9FBFF', fontSize: 14, fontWeight: '600' },
  dropdownDhb: { color: '#6F7174', fontSize: 11, marginTop: 1 },
  costSection: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
  },
  costLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  costLabel: { color: '#A6A9AC', fontSize: 13 },
  costValue: { color: '#F9FBFF', fontSize: 13, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 6 },
  paySection: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
  },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payLabel: { color: '#F9FBFF', fontSize: 14, fontWeight: '500' },
  payRight: { alignItems: 'flex-end' },
  payAmount: { color: '#F9FBFF', fontSize: 17, fontWeight: '700' },
  payRate: { color: '#6F7174', fontSize: 11, marginTop: 2 },
  coinIcon: { width: 22, height: 22 },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  balanceLabel: { color: '#A6A9AC', fontSize: 13 },
  balanceRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceCoin: { width: 18, height: 18 },
  balanceAmount: { color: '#00C566', fontSize: 14, fontWeight: '600' },
  warningBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center',
  },
  warningText: { color: '#EF4444', fontSize: 13, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelBtnText: { color: '#F9FBFF', fontSize: 15, fontWeight: '600' },
  generateBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A6AFF',
  },
  generateBtnDisabled: { opacity: 0.4 },
  generateBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});

export default memo(ImagePaywallModalComponent);
