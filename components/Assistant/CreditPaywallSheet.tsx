/**
 * The paywall in front of every paid generation.
 * ==============================================
 * One sheet standing in for web's three modals (`ImagePaywallModal`,
 * `VideoPaywallModal`, `AiToolPaywallModal`) — they differ only in title, model
 * list and quote kind, and the money logic underneath has to be identical
 * everywhere or one of them ends up charging differently from the others.
 *
 * How it works:
 *
 *  - The price comes from the server (`ai-quote`), not from a local cost table
 *    times a hardcoded markup. The figure shown is the figure that is charged.
 *  - Confirming signs one DHB transfer for that exact price and hands the hash
 *    to the generate call, which verifies it on chain before it spends
 *    anything with a provider. There is no credit balance in between.
 *  - A wallet short of the price says so and offers to buy, instead of
 *    offering a payment that cannot succeed.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { type IconName } from '../ui/Icon';
import { useJobQuote, useJobPayment } from '../../hooks/useAiPayment';
import { formatDhb, indicativeDhb, withMarkup } from '../../config/ai-models.constants';
import type { AiJobKind } from '../../services/ai.service';
import { ScreenNames } from '../../navigation/ScreenNames';
import { toastError, toastSuccess } from '../../libs/toast';
import { createLogger } from '../../libs/logger';

const log = createLogger('CreditPaywallSheet');
const DEHUB_COIN = require('../../assets/web-icons/dehub-coin.png');
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.82;

export interface PaywallModelOption {
  id: string;
  name: string;
  description: string;
  emoji: string;
  baseCostUsd: number;
  /** Set to explain why a model cannot be used for this run. */
  unavailableReason?: string;
}

export interface CreditPaywallSheetProps {
  visible: boolean;
  title: string;
  icon: IconName;
  subtitle?: string;
  models: PaywallModelOption[];
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  /** What to price. `modelId` is filled in from `selectedModelId`. */
  quoteKind: AiJobKind;
  quoteExtras?: { durationSeconds?: number; quality?: 'none' | 'standard' | 'HD'; quantity?: number };
  /** Extra line under the cost breakdown, e.g. a batch note. */
  footnote?: string;
  confirmLabel?: string;
  isBusy?: boolean;
  onClose: () => void;
  /** Receives the hash of the transfer that paid for this run. */
  onConfirm: (txHash: string) => void;
}

const CreditPaywallSheetComponent: React.FC<CreditPaywallSheetProps> = ({
  visible,
  title,
  icon,
  subtitle = 'Select a model and confirm payment',
  models,
  selectedModelId,
  onSelectModel,
  quoteKind,
  quoteExtras,
  footnote,
  confirmLabel = 'Generate',
  isBusy = false,
  onClose,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [modelListOpen, setModelListOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const quantity = quoteExtras?.quantity ?? 1;
  const model = useMemo(
    () => models.find((m) => m.id === selectedModelId) || models[0],
    [models, selectedModelId],
  );

  const { priceDhb, isLoading: isQuoting, error: quoteError } = useJobQuote(
    model
      ? {
          kind: quoteKind,
          modelId: model.id,
          durationSeconds: quoteExtras?.durationSeconds,
          quality: quoteExtras?.quality,
          quantity,
        }
      : null,
    visible,
  );
  // Gated on `visible`: all three paywall sheets stay mounted in the assistant
  // tree, so ungated these would each read a wallet balance the moment the
  // screen opened.
  const {
    walletDhb,
    isLoading: isWalletLoading,
    unsupportedChain,
    payForJob,
  } = useJobPayment(visible);

  const unitCostUsd = model ? withMarkup(model.baseCostUsd) : 0;
  const costUsd = unitCostUsd * quantity;

  // Offering a payment somebody cannot make would only fail at the signature,
  // so a wallet short of the price is sent to buy instead.
  const needsTokens =
    !isWalletLoading && !unsupportedChain && priceDhb > 0 && walletDhb < priceDhb;

  /* ── Sheet animation ─────────────────────────────────────────────────── */
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setModelListOpen(false);
      // The wallet balance refetches itself when `visible` enables the hook.
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(
        SHEET_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
    // Shared values are stable refs, so they do not belong in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const closeSheet = useCallback(() => {
    if (isPaying) return; // A signature is in flight; closing would orphan it.
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [isPaying, onClose, translateY, backdropOpacity]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 60 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  /* ── Confirm ─────────────────────────────────────────────────────────── */

  const handleConfirm = useCallback(async () => {
    if (priceDhb <= 0 || !model) return;

    if (model.unavailableReason) {
      toastError(model.unavailableReason);
      return;
    }
    if (unsupportedChain) {
      toastError(unsupportedChain);
      return;
    }

    if (needsTokens) {
      onClose();
      navigation.navigate(ScreenNames.Dpay);
      return;
    }

    setIsPaying(true);
    try {
      const txHash = await payForJob(priceDhb);
      toastSuccess('Payment confirmed — generating');
      onConfirm(txHash);
    } catch (err) {
      log.error('payment failed:', err);
      toastError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsPaying(false);
    }
  }, [
    priceDhb,
    model,
    unsupportedChain,
    needsTokens,
    onConfirm,
    onClose,
    navigation,
    payForJob,
  ]);

  if (isFullyClosed && !visible) return null;

  const confirmDisabled =
    isQuoting || isWalletLoading || isBusy || isPaying || priceDhb <= 0 || !model;

  const buttonLabel = isPaying
    ? 'Paying…'
    : isBusy
      ? 'Generating…'
      : needsTokens
        ? 'Buy DHB'
        : `Pay ${formatDhb(priceDhb)} DHB & ${confirmLabel}`;

  return (
    <Modal
      visible={!isFullyClosed}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, backdropStyle]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSheet} />
        </Animated.View>

        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 16 }, sheetStyle]}>
          <View style={[StyleSheet.absoluteFill, s.overlay]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View>
              <View style={s.handleWrap}>
                <View style={s.handle} />
              </View>
            </Animated.View>
          </GestureDetector>

          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={s.headerRow}>
              <View style={s.headerLeft}>
                <Icon name={icon} size={22} color="#F9FBFF" />
                <Text style={s.title}>{title}</Text>
              </View>
              <TouchableOpacity onPress={closeSheet} activeOpacity={0.7} hitSlop={8}>
                <Icon name="X" size={20} color="#6F7174" />
              </TouchableOpacity>
            </View>
            <Text style={s.subtitle}>{subtitle}</Text>

            {/* Model selector */}
            <TouchableOpacity
              style={s.selector}
              activeOpacity={0.8}
              onPress={() => setModelListOpen((open) => !open)}
            >
              <View style={s.selectorLeft}>
                <Text style={s.emoji}>{model?.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.selectorName}>{model?.name}</Text>
                  <Text style={s.selectorDesc}>{model?.description}</Text>
                </View>
              </View>
              <Icon name={modelListOpen ? 'ChevronUp' : 'ChevronDown'} size={18} color="#6F7174" />
            </TouchableOpacity>

            {modelListOpen && (
              <View style={s.modelList}>
                {models.map((option) => {
                  // Per-row figures are indicative. The selected model is
                  // re-quoted by the server before anything is charged.
                  const rowUsd = withMarkup(option.baseCostUsd) * quantity;
                  const rowDhb = indicativeDhb(option.baseCostUsd, quantity);
                  const isSelected = option.id === selectedModelId;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[s.modelRow, isSelected && s.modelRowSelected]}
                      activeOpacity={0.75}
                      onPress={() => {
                        onSelectModel(option.id);
                        setModelListOpen(false);
                      }}
                    >
                      <View style={s.modelRowLeft}>
                        <Text style={s.emojiSmall}>{option.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.modelName}>{option.name}</Text>
                          <Text style={s.modelDesc}>
                            {option.unavailableReason || option.description}
                          </Text>
                        </View>
                      </View>
                      <View style={s.modelRowRight}>
                        <Text style={s.modelPrice}>${rowUsd.toFixed(2)}</Text>
                        <Text style={s.modelDhb}>~{formatDhb(rowDhb)} DHB</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Cost breakdown */}
            <View style={s.card}>
              <View style={s.line}>
                <Text style={s.lineLabel}>
                  {quantity > 1 ? `Cost (${quantity} × $${unitCostUsd.toFixed(2)})` : 'Cost'}
                </Text>
                <Text style={s.lineValue}>${costUsd.toFixed(2)}</Text>
              </View>
              <View style={s.line}>
                <Text style={s.lineLabel}>Staker Discount</Text>
                <Text style={s.lineValue}>0%</Text>
              </View>
              <View style={s.divider} />
              <View style={s.line}>
                <Text style={[s.lineLabel, { fontWeight: '600' }]}>Total</Text>
                <Text style={[s.lineValue, { fontWeight: '700' }]}>${costUsd.toFixed(2)}</Text>
              </View>
            </View>

            {/* Server-quoted price */}
            <View style={s.card}>
              {isQuoting ? (
                <View style={s.quoting}>
                  <ActivityIndicator size="small" color="#F4F4F5" />
                  <Text style={s.quotingText}>Pricing this run…</Text>
                </View>
              ) : (
                <>
                  <View style={s.line}>
                    <View style={s.payLeft}>
                      <Image source={DEHUB_COIN} style={s.coin} />
                      <Text style={s.payLabel}>Pay with DHB</Text>
                    </View>
                    <Text style={s.payAmount}>{formatDhb(priceDhb)} DHB</Text>
                  </View>
                  {!!quoteError && <Text style={s.warnText}>{quoteError}</Text>}
                </>
              )}
            </View>

            {/* Wallet balance */}
            <View style={s.balanceRow}>
              <Text style={s.lineLabel}>Your DHB</Text>
              <View style={s.balanceRight}>
                <Image source={DEHUB_COIN} style={s.coinSmall} />
                {isWalletLoading ? (
                  <ActivityIndicator size="small" color="#A6A9AC" />
                ) : (
                  <Text style={[s.balanceAmount, needsTokens && { color: '#EF4444' }]}>
                    {formatDhb(walletDhb)} DHB
                  </Text>
                )}
              </View>
            </View>

            {!!footnote && <Text style={s.footnote}>{footnote}</Text>}

            {!!unsupportedChain && !isQuoting && (
              <View style={s.warnBanner}>
                <Text style={s.warnText}>{unsupportedChain}</Text>
              </View>
            )}

            {needsTokens && !unsupportedChain && !isQuoting && (
              <View style={s.warnBanner}>
                <Text style={s.warnText}>
                  This costs {formatDhb(priceDhb)} DHB and you hold {formatDhb(walletDhb)}.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={closeSheet}
              activeOpacity={0.7}
              disabled={isPaying}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmBtn, confirmDisabled && s.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={confirmDisabled}
              activeOpacity={0.8}
            >
              {isPaying || isBusy ? (
                <ActivityIndicator size="small" color="#09090B" />
              ) : (
                <Text style={s.confirmBtnText}>{buttonLabel}</Text>
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
    backgroundColor: '#0C0C0E',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#F9FBFF', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#A6A9AC', fontSize: 13, paddingHorizontal: 20, marginBottom: 16 },
  selector: {
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  selectorName: { color: '#F9FBFF', fontSize: 15, fontWeight: '600' },
  selectorDesc: { color: '#A6A9AC', fontSize: 11, marginTop: 2 },
  emoji: { fontSize: 22 },
  emojiSmall: { fontSize: 16 },
  modelList: {
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#1A1A1D',
    overflow: 'hidden',
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  modelRowSelected: { backgroundColor: 'rgba(255,255,255,0.08)' },
  modelRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  modelName: { color: '#F9FBFF', fontSize: 14, fontWeight: '500' },
  modelDesc: { color: '#A6A9AC', fontSize: 11, marginTop: 1 },
  modelRowRight: { alignItems: 'flex-end' },
  modelPrice: { color: '#F9FBFF', fontSize: 13, fontWeight: '600' },
  modelDhb: { color: '#A6A9AC', fontSize: 11, marginTop: 1 },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  lineLabel: { color: '#A6A9AC', fontSize: 13 },
  lineValue: { color: '#F9FBFF', fontSize: 13, fontWeight: '500' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 6,
  },
  payLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payLabel: { color: '#F9FBFF', fontSize: 14, fontWeight: '500' },
  payAmount: { color: '#F9FBFF', fontSize: 17, fontWeight: '700' },
  coin: { width: 22, height: 22 },
  coinSmall: { width: 18, height: 18 },
  quoting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 },
  quotingText: { color: '#A6A9AC', fontSize: 13 },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  balanceRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceAmount: { color: '#F9FBFF', fontSize: 14, fontWeight: '600' },
  footnote: {
    color: '#A6A9AC',
    fontSize: 11,
    textAlign: 'center',
    marginHorizontal: 24,
    marginTop: 10,
    lineHeight: 16,
  },
  warnBanner: {
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
  warnText: { color: '#EF4444', fontSize: 13, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 12, marginTop: 16, paddingHorizontal: 16 },
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
  confirmBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 8,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#09090B', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});

export default memo(CreditPaywallSheetComponent);
