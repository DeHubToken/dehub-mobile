/**
 * Unlocking text notifications: deposit, then prove the number.
 * ============================================================
 * Two steps, in that order, and the order is the whole design.
 *
 * Sending a verification code costs a real SMS fragment. If the number came
 * first, anybody could spend the platform's prepaid balance one code at a time
 * without ever paying for anything. Taking the deposit first means the
 * verification text is bought and paid for before it is sent, and the code
 * doubles as proof that the route works before the reader is promised messages
 * on it.
 *
 * The deposit is an ordinary DHB transfer to an address the server names. The
 * client never says how much arrived — it hands over the hash and the server
 * reads the amount off the chain. Claiming is safe to repeat and answers
 * `pending` while the receipt catches up, so a dropped response is a retry
 * rather than a second payment.
 *
 * Mirrors web's `SmsNotificationsDialog`. The payment differs: this app pays on
 * the chain the wallet is already signed in for, because switching chains here
 * is a full re-auth and bouncing somebody through sign-in mid-purchase is worse
 * than telling them to switch in Settings first.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ethers } from 'ethers';

import GlassModal from '../ui/GlassModal';
import Icon from '../ui/Icon';
import { useERC20Contract, useWeb3Provider } from '../../hooks/use-web3';
import { writeContractAA } from '../../libs/aa.write';
import { toastError, toastSuccess } from '../../libs/toast';
import { ChainId, DHB_ADDRESSESS } from '../../config/constants';
import {
  smsNotificationsService,
  type SmsNotificationStatus,
  type SmsQuote,
} from '../../services/sms-notifications.service';

interface SmsNotificationsSheetProps {
  visible: boolean;
  onClose: () => void;
  status: SmsNotificationStatus | null;
  /** Re-read the status after anything that changes it. */
  onChanged: () => void;
}

/** The chains the server credits a deposit on. */
const PAYABLE_CHAIN_IDS: number[] = [ChainId.BASE_MAINNET, ChainId.BSC_MAINNET];

/** How long to keep asking about a transfer the chain has not shown yet. */
const CLAIM_ATTEMPTS = 12;
const CLAIM_GAP_MS = 5_000;

const nf = (value: number) => value.toLocaleString('en-US');

export default function SmsNotificationsSheet({
  visible,
  onClose,
  status,
  onChanged,
}: SmsNotificationsSheetProps) {
  const { t } = useTranslation();
  const { chainId } = useWeb3Provider();

  const activeChainId = Number(chainId) || ChainId.BASE_MAINNET;
  const canPayHere = PAYABLE_CHAIN_IDS.includes(activeChainId);
  const tokenContract = useERC20Contract(canPayHere ? DHB_ADDRESSESS[activeChainId] : undefined);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [quote, setQuote] = useState<SmsQuote | null>(null);
  const [busy, setBusy] = useState<'deposit' | 'code' | 'verify' | 'remove' | null>(null);
  const [stage, setStage] = useState<'idle' | 'paying' | 'confirming'>('idle');
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    if (!visible) {
      setCode('');
      setStage('idle');
      setBusy(null);
    }
    return () => {
      cancelled.current = true;
    };
  }, [visible]);

  // Priced as the number is typed: the price depends on where the number is,
  // and somebody outside the cheap band should find that out before they pay
  // rather than when the balance runs down three times faster than expected.
  useEffect(() => {
    const trimmed = phone.trim();
    if (!visible || !/^\+?[0-9][0-9\s()-]{6,}$/.test(trimmed)) {
      setQuote(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      smsNotificationsService
        .quote(trimmed)
        .then(result => live && setQuote(result))
        .catch(() => live && setQuote(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [phone, visible]);

  async function deposit() {
    if (!status?.depositAddress) return toastError(t('settings.smsUnavailable'));
    if (!canPayHere) return toastError(t('settings.smsChainUnsupported'));
    if (!tokenContract) return toastError(t('settings.smsWalletNotReady'));
    if (!status.chains.some(chain => chain.chainId === activeChainId)) {
      return toastError(t('settings.smsChainUnsupported'));
    }

    const amount = status.minDepositDhb;
    const amountWei = ethers.utils.parseUnits(String(amount), 18);

    // Fail before signing if the balance cannot cover it — the same preflight
    // the transfer sheet runs. An opaque on-chain revert is a bad payment UX.
    try {
      const signerAddr = await tokenContract.signer?.getAddress?.();
      const balance = await tokenContract.balanceOf(signerAddr);
      if (balance && balance.lt(amountWei)) {
        return toastError(t('settings.smsNeedDhb', { dhb: nf(amount) }));
      }
    } catch {
      // Only a real shortfall stops the flow; an unreadable balance is advisory.
    }

    setBusy('deposit');
    setStage('paying');
    try {
      const res = await writeContractAA(
        tokenContract,
        'transfer',
        [status.depositAddress, amountWei],
        { context: 'sms-credit-deposit' },
      );

      let txHash: string = res?.hash ?? '';
      if (!txHash) {
        try {
          const receipt = await res?.wait?.(1);
          txHash = receipt?.transactionHash ?? '';
        } catch {
          // Fall through — with no hash there is nothing to claim against.
        }
      }
      if (!txHash) throw new Error(t('settings.smsDepositNotSent'));

      // Past this line the money has left. Giving up would strand a real
      // transfer with no credit behind it, so the loop runs to the end and the
      // hash is surfaced rather than swallowed if it still has not landed.
      setStage('confirming');
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        if (cancelled.current) break;
        const result = await smsNotificationsService.claimDeposit(txHash, activeChainId);
        if (!result.pending) {
          toastSuccess(t('settings.smsUnlocked'));
          onChanged();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, CLAIM_GAP_MS));
      }
      throw new Error(t('settings.smsDepositSlow', { hash: txHash }));
    } catch (error: any) {
      toastError(error?.message || t('settings.smsDepositNotSent'));
    } finally {
      setBusy(null);
      setStage('idle');
    }
  }

  async function sendCode() {
    setBusy('code');
    try {
      const result = await smsNotificationsService.requestPhoneCode(phone.trim());
      toastSuccess(t('settings.smsCodeSent', { price: nf(result.priceDhb) }));
      onChanged();
    } catch (error: any) {
      toastError(error?.message || t('settings.smsCodeFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setBusy('verify');
    try {
      await smsNotificationsService.verifyPhoneCode(code);
      toastSuccess(t('settings.smsNumberVerified'));
      setCode('');
      onChanged();
      onClose();
    } catch (error: any) {
      toastError(error?.message || t('settings.smsVerifyFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function removeNumber() {
    setBusy('remove');
    try {
      await smsNotificationsService.removePhone();
      toastSuccess(t('settings.smsNumberRemoved'));
      onChanged();
    } catch (error: any) {
      toastError(error?.message || t('settings.smsRemoveFailed'));
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom"
      scrollable dismissible={!working}>
      <View className="px-5 pt-5 pb-2">
        <View className="flex-row items-center mb-1">
          <Icon name="MessageSquare" size={18} color="#fff" />
          <Text className="text-white text-base font-semibold ml-2">
            {t('settings.smsNotifications')}
          </Text>
        </View>
        <Text className="text-theme-neutrals-500 text-xs mb-4">{t('settings.smsDialogIntro')}</Text>

        {!status?.available && (
          <Text className="text-theme-neutrals-400 text-sm">{t('settings.smsUnavailable')}</Text>
        )}

        {status?.available && !status.unlocked && (
          <View>
            <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl p-4 mb-4">
              <Text className="text-white text-sm">
                {t('settings.smsUnlockPrice', {
                  dhb: nf(status.minDepositDhb),
                  usd: status.minDepositUsd,
                })}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mt-1">
                {t('settings.smsUnlockExplainer')}
              </Text>
            </View>

            <PriceList status={status} />

            <TouchableOpacity
              className="bg-white rounded-xl py-3.5 items-center mt-4"
              disabled={working}
              onPress={deposit}
            >
              {working ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text className="text-black text-sm font-semibold">
                  {stage === 'paying'
                    ? t('settings.smsDepositPaying')
                    : stage === 'confirming'
                      ? t('settings.smsDepositConfirming')
                      : t('settings.smsDepositAction', { dhb: nf(status.minDepositDhb) })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {status?.available && status.unlocked && (
          <View>
            <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl p-4 mb-4">
              <Text className="text-white text-sm">
                {t('settings.smsBalance', {
                  dhb: nf(status.balanceDhb),
                  usd: status.balanceUsd.toFixed(2),
                })}
              </Text>
              {status.messagesRemaining !== null && (
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  {t('settings.smsBalanceMessages', { count: status.messagesRemaining })}
                </Text>
              )}
              <TouchableOpacity
                className="border border-theme-neutrals-700 rounded-xl py-2.5 items-center mt-3"
                disabled={working}
                onPress={deposit}
              >
                <Text className="text-white text-xs font-medium">
                  {t('settings.smsTopUp', { dhb: nf(status.minDepositDhb) })}
                </Text>
              </TouchableOpacity>
            </View>

            {status.phoneVerified ? (
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-theme-neutrals-500 text-xs">
                    {t('settings.smsNumberLabel')}
                  </Text>
                  <Text className="text-white text-sm mt-0.5">{status.phone}</Text>
                </View>
                <TouchableOpacity disabled={working} onPress={removeNumber}>
                  <Text className="text-theme-neutrals-400 text-sm">
                    {t('settings.smsRemoveNumber')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text className="text-theme-neutrals-500 text-xs mb-1.5">
                  {t('settings.smsNumberLabel')}
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    className="flex-1 bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-3 text-white"
                    style={{ height: 44, fontSize: 16 }}
                    placeholder="+447700900123"
                    placeholderTextColor="#6b7280"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                  <TouchableOpacity
                    className="bg-white rounded-xl px-4 items-center justify-center"
                    disabled={working || !phone.trim() || !!quote?.blocked}
                    onPress={sendCode}
                  >
                    <Text className="text-black text-sm font-semibold">
                      {t('settings.smsSendCode')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {quote?.blocked ? (
                  <Text className="text-amber-400 text-xs mt-2">
                    {t('settings.smsCountryBlocked')}
                  </Text>
                ) : quote ? (
                  <Text className="text-theme-neutrals-500 text-xs mt-2">
                    {t('settings.smsPricePerMessage', {
                      dhb: nf(quote.priceDhb),
                      usd: quote.priceUsd.toFixed(2),
                    })}
                  </Text>
                ) : null}

                {!!status.pendingPhone && (
                  <View className="mt-4">
                    <Text className="text-theme-neutrals-500 text-xs mb-1.5">
                      {t('settings.smsCodeLabel', { phone: status.pendingPhone })}
                    </Text>
                    <View className="flex-row gap-2">
                      <TextInput
                        className="flex-1 bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-3 text-white"
                        style={{ height: 44, fontSize: 16 }}
                        placeholder="123456"
                        placeholderTextColor="#6b7280"
                        keyboardType="number-pad"
                        maxLength={6}
                        value={code}
                        onChangeText={setCode}
                      />
                      <TouchableOpacity
                        className="bg-white rounded-xl px-4 items-center justify-center"
                        disabled={working || code.length < 4}
                        onPress={verify}
                      >
                        <Text className="text-black text-sm font-semibold">
                          {t('settings.smsVerify')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </GlassModal>
  );
}

/**
 * What a message costs, by where it is going.
 *
 * Shown before the deposit rather than after: a reader outside the cheap band
 * is buying a third as many messages for the same money and should know that
 * before they pay.
 */
function PriceList({ status }: { status: SmsNotificationStatus }) {
  const { t } = useTranslation();
  if (!status.prices?.length) return null;

  return (
    <View>
      <Text className="text-theme-neutrals-500 text-[11px] uppercase tracking-widest font-semibold mb-2">
        {t('settings.smsPricesHeading')}
      </Text>
      {status.prices.map(band => (
        <View key={band.band} className="flex-row items-center justify-between py-1">
          <Text className="text-theme-neutrals-300 text-sm">
            {t(`settings.smsBand.${band.band}`, band.band)}
          </Text>
          <Text className="text-theme-neutrals-500 text-sm">
            {t('settings.smsPricePerMessage', {
              dhb: nf(band.priceDhb),
              usd: band.priceUsd.toFixed(2),
            })}
          </Text>
        </View>
      ))}
    </View>
  );
}
