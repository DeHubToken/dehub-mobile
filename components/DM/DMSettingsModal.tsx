import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, View, Switch, TextInput, ActivityIndicator } from 'react-native';
import GlassModal from '../ui/GlassModal';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { toastError, toastWarning } from '../../libs/toast';
import { updateDmUserStatus } from '../../services/dm/dm.service';
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
  const { user, patchUser } = useAuth();
  const initial = useMemo(() => {
    const disables = ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[];
    const minTip = Number((user as any)?.dmSettings?.minTipDhb || 0);
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
    return { dmsEnabled, allowNew, minTip };
  }, [user]);
  const [dmsEnabled, setDmsEnabled] = useState<boolean>(initial.dmsEnabled);
  const [allowNew, setAllowNew] = useState<boolean>(initial.allowNew);
  const [minTip, setMinTip] = useState<string>(String(initial.minTip));
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [tipSubmitting, setTipSubmitting] = useState<boolean>(false);
  const [tipSaved, setTipSaved] = useState<boolean>(false);

  // Initialize state only when modal opens; do not re-sync on user changes to avoid flicker
  useEffect(() => {
    if (!open) return;
    setDmsEnabled(initial.dmsEnabled);
    setAllowNew(initial.allowNew);
    setMinTip(String(initial.minTip));
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const computeDesired = useCallback(() => {
    // Translate UI -> backend action+status
    // Backend ignores status value on 'enable' but validates it's in enum; use ACTIVE_ALL for clarity.
    if (!dmsEnabled) return { action: DmAction.Disable, status: DmDisableStatus.ALL };
    if (!allowNew) return { action: DmAction.Disable, status: DmDisableStatus.NEW_DM };
    return { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL };
  }, [dmsEnabled, allowNew]);

  const optimisticPatch = useCallback((next: { dmsEnabled: boolean; allowNew: boolean; minTip: number }) => {
    const disables: DmDisableStatus[] = !next.dmsEnabled
      ? [DmDisableStatus.ALL]
      : (!next.allowNew ? [DmDisableStatus.NEW_DM] : [DmDisableStatus.ACTIVE_ALL]);
    patchUser((prev: any) => ({
      dmSettings: {
        ...(prev?.dmSettings || {}),
        address: (prev?.walletAddress || prev?.address),
        disables,
        minTipDhb: next.minTip,
      },
    }) as any).catch(() => {});
  }, [patchUser]);

  const submit = useCallback(async (opts?: { desired?: { action: DmAction; status: DmDisableStatus }; spinner?: 'toggle' | 'tip' }) => {
    if (!user?.walletAddress && !(user as any)?.address) {
      toastWarning('You must be signed in');
      return;
    }
    const address = ((user as any)?.walletAddress || (user as any)?.address || '').toLowerCase();
    const parsedMin = Number(minTip);
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      toastWarning('Minimum tip must be a non-negative number');
      return;
    }
    const desired = opts?.desired || computeDesired();
    if (opts?.spinner === 'tip') setTipSubmitting(true);
    else setSubmitting(true);
    const prev = {
      dmsEnabled,
      allowNew,
      minTip: Number((user as any)?.dmSettings?.minTipDhb || 0),
      disables: ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[],
    };
    // Optimistic UI
    optimisticPatch({ dmsEnabled, allowNew, minTip: parsedMin });
    try {
      const resp = await updateDmUserStatus(address, desired.status, desired.action, parsedMin);
      const updated: any = (resp as any)?.data?.data || (resp as any)?.data || (resp as any)?.result || resp;
      if (updated && (Array.isArray(updated.disables) || typeof updated.minTipDhb !== 'undefined')) {
        // Align local auth user with server shape
        await patchUser(() => ({
          dmSettings: {
            address,
            disables: Array.isArray(updated.disables) ? updated.disables : (desired.action === DmAction.Enable ? [DmDisableStatus.ACTIVE_ALL] : desired.status === DmDisableStatus.NEW_DM ? [DmDisableStatus.NEW_DM] : [DmDisableStatus.ALL]),
            minTipDhb: typeof updated.minTipDhb === 'number' ? updated.minTipDhb : parsedMin,
          },
        }) as any).catch(() => {});
      }
      if (opts?.spinner === 'tip') {
        setTipSubmitting(false);
        setTipSaved(true);
        setTimeout(() => setTipSaved(false), 1000);
      }
    } catch (e) {
      // Revert on failure
      patchUser(() => ({ dmSettings: { address, disables: prev.disables, minTipDhb: prev.minTip } }) as any).catch(() => {});
      toastError(e, 'Failed to update DM preferences');
    } finally {
      if (opts?.spinner === 'tip') setTipSubmitting(false);
      else setSubmitting(false);
    }
  }, [user, minTip, dmsEnabled, allowNew, computeDesired, optimisticPatch, patchUser]);

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

  const onChangeMinTip = useCallback((t: string) => {
    // Only allow digits and optional dot
    const cleaned = t.replace(/[^0-9.]/g, '');
    setMinTip(cleaned);
  }, []);

  const onBlurMinTip = useCallback(() => {
    submit({ spinner: 'tip' }).catch(() => {});
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
      thumbColor={allowNew ? '#60A5FA' : '#9CA3AF'}
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
            Control who can message you and set a minimum DHB tip to start new chats.
          </Text>
        </View>

        <View className="px-5 mt-4">
          <View className="bg-theme-neutrals-800 rounded-2xl p-3 border border-theme-neutrals-700">
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
              <Text className="text-theme-neutrals-100 text-[15px] font-medium">Minimum tip (DHB)</Text>
              <Text className="text-theme-neutrals-400 text-[12px] mt-1">Set to 0 to allow without a tip.</Text>
              {/* Audit notice */}
              <View className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 mt-2 flex-row items-start">
                <Ionicons name="information-circle-outline" size={16} color="#FBBF24" />
                <Text className="text-amber-300 text-[12px] ml-2 flex-1">
                  Tipped messages contracts are currently being audited. Minimum tip enforcement may not work yet.
                  As a temporary measure, you can turn off new DMs or disable DMs entirely.
                </Text>
              </View>
              <View className="flex-row items-center mt-2">
                <TextInput
                  value={minTip}
                  onChangeText={onChangeMinTip}
                  onBlur={onBlurMinTip}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  className="flex-1 text-theme-neutrals-100 bg-theme-neutrals-900 border border-theme-neutrals-700 rounded-xl px-3 h-11"
                  editable={!submitting && !tipSubmitting}
                />
                {tipSubmitting ? (
                  <View className="ml-3 h-11 items-center justify-center">
                    <ActivityIndicator size="small" color="#9CA3AF" />
                  </View>
                ) : tipSaved ? (
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
