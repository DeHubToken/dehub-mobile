import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, View, Switch, TextInput, ActivityIndicator } from 'react-native';
import GlassModal from '../ui/GlassModal';
import { Ionicons } from '@expo/vector-icons';
import { useUser, useAuthActions } from '../../context/AuthContext';
import { toastError, toastWarning } from '../../libs/toast';
import { updateDmUserStatus } from '../../services/dm/dm.api';
import { DmDisableStatus, DmAction } from '../../services/enums/dm-preferences.enum';

export type DMSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const Row: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => (
  <View className="flex-row items-center justify-between py-3">
    <View className="flex-1 pr-3">
      <Text className="text-theme-neutrals-100 text-[15px] font-medium">{title}</Text>
      {subtitle ? (
        <Text className="text-theme-neutrals-400 text-[12px] mt-1">{subtitle}</Text>
      ) : null}
    </View>
    <View>{right}</View>
  </View>
);

const DMSettingsModal: React.FC<DMSettingsModalProps> = ({ open, onOpenChange }) => {
  const user = useUser();
  const { patchUser } = useAuthActions();
  const initial = useMemo(() => {
    const disables = ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[];
    const fee = Number((user as any)?.dmSettings?.perMessageFee || 0);
    // Interpret server state:
    // - ALL => everything disabled
    // - NEW_DM => only new DMs disabled (existing allowed)
    // - ACTIVE_ALL => everything enabled
    // - [] (empty/undefined) => treat as enabled (same as ACTIVE_ALL)
    let dmsEnabled = true;
    let allowNew = true;
    if (disables.includes(DmDisableStatus.ALL)) {
      dmsEnabled = false;
      allowNew = false;
    } else if (disables.includes(DmDisableStatus.NEW_DM)) {
      dmsEnabled = true;
      allowNew = false;
    } else if (disables.includes(DmDisableStatus.ACTIVE_ALL)) {
      dmsEnabled = true;
      allowNew = true;
    }
    return { dmsEnabled, allowNew, fee };
  }, [user]);
  const [dmsEnabled, setDmsEnabled] = useState<boolean>(initial.dmsEnabled);
  const [allowNew, setAllowNew] = useState<boolean>(initial.allowNew);
  const [fee, setFee] = useState<string>(String(initial.fee));
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feeSubmitting, setFeeSubmitting] = useState<boolean>(false);
  const [feeSaved, setFeeSaved] = useState<boolean>(false);

  // Initialize state only when modal opens; do not re-sync on user changes to avoid flicker
  useEffect(() => {
    if (!open) return;
    setDmsEnabled(initial.dmsEnabled);
    setAllowNew(initial.allowNew);
    setFee(String(initial.fee));
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const computeDesired = useCallback(() => {
    // Translate UI -> backend action+status
    // Backend ignores status value on 'enable' but validates it's in enum; use ACTIVE_ALL for clarity.
    if (!dmsEnabled) return { action: DmAction.Disable, status: DmDisableStatus.ALL };
    if (!allowNew) return { action: DmAction.Disable, status: DmDisableStatus.NEW_DM };
    return { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL };
  }, [dmsEnabled, allowNew]);

  const optimisticPatch = useCallback((next: { dmsEnabled: boolean; allowNew: boolean; fee: number }) => {
    const disables: DmDisableStatus[] = !next.dmsEnabled
      ? [DmDisableStatus.ALL]
      : (!next.allowNew ? [DmDisableStatus.NEW_DM] : [DmDisableStatus.ACTIVE_ALL]);
    patchUser((prev: any) => ({
      dmSettings: {
        ...(prev?.dmSettings || {}),
        address: (prev?.walletAddress || prev?.address),
        disables,
        perMessageFee: next.fee,
      },
    }) as any).catch(() => {});
  }, [patchUser]);

  const submit = useCallback(async (opts?: { desired?: { action: DmAction; status: DmDisableStatus }; spinner?: 'toggle' | 'fee' }) => {
    if (!user?.walletAddress && !(user as any)?.address) {
      toastWarning('You must be signed in');
      return;
    }
    const address = ((user as any)?.walletAddress || (user as any)?.address || '').toLowerCase();
    const parsedFee = Number(fee);
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      toastWarning('Per-message fee must be a non-negative number');
      return;
    }
    const desired = opts?.desired || computeDesired();
    if (opts?.spinner === 'fee') setFeeSubmitting(true);
    else setSubmitting(true);
    const prev = {
      dmsEnabled,
      allowNew,
      fee: Number((user as any)?.dmSettings?.perMessageFee || 0),
      disables: ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[],
    };
    // Optimistic UI
    optimisticPatch({ dmsEnabled, allowNew, fee: parsedFee });
    try {
      const resp = await updateDmUserStatus(address, desired.status, desired.action, parsedFee);
      const updated: any = (resp as any)?.data?.data || (resp as any)?.data || (resp as any)?.result || resp;
      if (updated && (Array.isArray(updated.disables) || typeof updated.perMessageFee !== 'undefined')) {
        // Align local auth user with server shape
        await patchUser(() => ({
          dmSettings: {
            address,
            disables: Array.isArray(updated.disables) ? updated.disables : (desired.action === DmAction.Enable ? [DmDisableStatus.ACTIVE_ALL] : desired.status === DmDisableStatus.NEW_DM ? [DmDisableStatus.NEW_DM] : [DmDisableStatus.ALL]),
            perMessageFee: typeof updated.perMessageFee === 'number' ? updated.perMessageFee : parsedFee,
          },
        }) as any).catch(() => {});
      }
      if (opts?.spinner === 'fee') {
        setFeeSubmitting(false);
        setFeeSaved(true);
        setTimeout(() => setFeeSaved(false), 1000);
      }
    } catch (e) {
      // Revert on failure
      patchUser(() => ({ dmSettings: { address, disables: prev.disables, perMessageFee: prev.fee } }) as any).catch(() => {});
      toastError(e, 'Failed to update DM preferences');
    } finally {
      if (opts?.spinner === 'fee') setFeeSubmitting(false);
      else setSubmitting(false);
    }
  }, [user, fee, dmsEnabled, allowNew, computeDesired, optimisticPatch, patchUser]);

  const onToggleDmsEnabled = useCallback((val: boolean) => {
    setDmsEnabled(val);
    if (val) {
      // Enabling DMs: send Enable/ACTIVE_ALL and reflect allowNew true
      setAllowNew(true);
      setTimeout(() => submit({ desired: { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL }, spinner: 'toggle' }).catch(() => {}), 0);
    } else {
      // Disabling DMs: send Disable/ALL and reflect allowNew false
      setAllowNew(false);
      setTimeout(() => submit({ desired: { action: DmAction.Disable, status: DmDisableStatus.ALL }, spinner: 'toggle' }).catch(() => {}), 0);
    }
  }, [submit]);

  const onToggleAllowNew = useCallback((val: boolean) => {
    setAllowNew(val);
    if (val) {
      // Turning ON new DMs: send Enable/ACTIVE_ALL and ensure DMs are enabled
      setDmsEnabled(true);
      setTimeout(() => submit({ desired: { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL }, spinner: 'toggle' }).catch(() => {}), 0);
    } else {
      // Turning OFF new DMs: send Disable/NEW_DM
      setTimeout(() => submit({ desired: { action: DmAction.Disable, status: DmDisableStatus.NEW_DM }, spinner: 'toggle' }).catch(() => {}), 0);
    }
  }, [submit]);

  const onChangeFee = useCallback((t: string) => {
    // Only allow digits and optional dot
    const cleaned = t.replace(/[^0-9.]/g, '');
    setFee(cleaned);
  }, []);

  const onBlurFee = useCallback(() => {
    submit({ spinner: 'fee' }).catch(() => {});
  }, [submit]);

  const rightSwitchDms = useMemo(() => (
    <Switch
      value={dmsEnabled}
      onValueChange={onToggleDmsEnabled}
      thumbColor={dmsEnabled ? '#34D399' : '#9CA3AF'}
      trackColor={{ false: '#4B5563', true: '#065F46' }}
      disabled={submitting}
    />
  ), [dmsEnabled, onToggleDmsEnabled, submitting]);

  const rightSwitchNew = useMemo(() => (
    <Switch
      value={allowNew}
      onValueChange={onToggleAllowNew}
      thumbColor={allowNew ? '#D4D4D8' : '#9CA3AF'}
      trackColor={{ false: '#4B5563', true: '#1E3A8A' }}
      disabled={!dmsEnabled || submitting}
    />
  ), [allowNew, dmsEnabled, onToggleAllowNew, submitting]);

  return (
    <GlassModal visible={open} onClose={close} presentation="center" blurIntensity={40}>
      <View className="rounded-shadow-xl">
        <View className="px-5 pt-5">
          <View className="flex-row items-center">
            <View className="w-9 h-9 rounded-xl bg-theme-brand-primary/15 items-center justify-center mr-2">
              <Ionicons name="options-outline" color="#6EE7B7" size={18} />
            </View>
            <Text className="text-theme-neutrals-100 text-[17px] font-semibold">DM Preferences</Text>
          </View>
          <Text className="text-theme-neutrals-400 text-[12px] mt-2">
            Control who can message you and charge a per-message fee in DHB.
          </Text>
        </View>

        <View className="px-5 mt-4">
          <View className="bg-theme-neutrals-800 rounded-xl p-3 border border-theme-neutrals-700">
            <Row
              title="Enable DMs"
              subtitle="Turn off to block all messages."
              right={rightSwitchDms}
            />
            <View className="h-[1px] bg-theme-neutrals-700/60" />
            <Row
              title="Allow New DMs"
              subtitle={dmsEnabled ? 'If off, only people you\'ve chatted with can message you.' : 'Turn on DMs to allow new messages.'}
              right={rightSwitchNew}
            />
            <View className="h-[1px] bg-theme-neutrals-700/60" />
            <View className="py-3">
              <Text className="text-theme-neutrals-100 text-[15px] font-medium">Per-Message Fee (DHB)</Text>
              <Text className="text-theme-neutrals-400 text-[12px] mt-1">Charge users per message. Set to 0 for free DMs. You can grant free access to specific users.</Text>
              <View className="flex-row items-center mt-2">
                <TextInput
                  value={fee}
                  onChangeText={onChangeFee}
                  onBlur={onBlurFee}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#A6A9AC"
                  className="flex-1 text-theme-neutrals-100 bg-theme-neutrals-900 border border-theme-neutrals-700 rounded-xl px-3 h-11"
                  editable={!submitting && !feeSubmitting}
                />
                {feeSubmitting ? (
                  <View className="ml-3 h-11 items-center justify-center">
                    <ActivityIndicator size="small" color="#A6A9AC" />
                  </View>
                ) : feeSaved ? (
                  <View className="ml-3 h-11 items-center justify-center">
                    <Ionicons name="checkmark-circle" size={18} color="#34D399" />
                  </View>
                ) : null}
              </View>
            </View>
            {!dmsEnabled ? (
              <View className="bg-red-500/10 border border-red-500/30 rounded-xl p-2">
                <Text className="text-red-300 text-[12px]">All DMs are currently disabled. New DMs are blocked by default.</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="px-5 pb-5 pt-3 flex-row justify-end">
          <TouchableOpacity
            onPress={close}
            className="px-4 h-11 rounded-xl bg-theme-neutrals-700 items-center justify-center active:opacity-80"
          >
            <Text className="text-theme-neutrals-100">Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default DMSettingsModal;
