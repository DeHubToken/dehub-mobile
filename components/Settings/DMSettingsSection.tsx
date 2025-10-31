import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Switch, TextInput, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { DmAction, DmDisableStatus } from '../../services/enums/dm-preferences.enum';
import { updateDmUserStatus } from '../../services/dm/dm.service';
import { toastError, toastInfo } from '../../libs';
import { Ionicons } from '@expo/vector-icons';

const DMSettingsSection: React.FC = () => {
  const { user, patchUser } = useAuth();

  const initial = useMemo(() => {
    const disables = ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[];
    const minTip = Number((user as any)?.dmSettings?.minTipDhb || 0);
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
  const [dmSubmitting, setDmSubmitting] = useState<boolean>(false);
  const [tipSubmitting, setTipSubmitting] = useState<boolean>(false);
  const [tipSaved, setTipSaved] = useState<boolean>(false);

  const dmKey = useMemo(() => {
    const disables = JSON.stringify(((user as any)?.dmSettings?.disables || []) as DmDisableStatus[]);
    const tip = String((user as any)?.dmSettings?.minTipDhb ?? 0);
    return `${disables}|${tip}`;
  }, [user]);

  // Keep in sync with user after server updates, but avoid clobbering in-flight UI
  useEffect(() => {
    if (dmSubmitting || tipSubmitting) return;
    setDmsEnabled(initial.dmsEnabled);
    setAllowNew(initial.allowNew);
    setMinTip(String(initial.minTip));
  }, [dmKey]);

  const optimisticPatch = useCallback((next: { dmsEnabled: boolean; allowNew: boolean; minTip: number }) => {
    const disables: DmDisableStatus[] = !next.dmsEnabled
      ? [DmDisableStatus.ALL]
      : (!next.allowNew ? [DmDisableStatus.NEW_DM] : [DmDisableStatus.ACTIVE_ALL]);
    patchUser((prev: any) => ({
      dmSettings: {
        ...(prev?.dmSettings || {}),
        address: prev?.walletAddress || prev?.address,
        disables,
        minTipDhb: next.minTip,
      },
    }) as any).catch(() => {});
  }, [patchUser]);

  const submit = useCallback(async (opts?: { desired?: { action: DmAction; status: DmDisableStatus }; spinner?: 'toggle' | 'tip' }) => {
    const address = (((user as any)?.walletAddress || (user as any)?.address || '') as string).toLowerCase();
    if (!address) {
      toastInfo('You must be signed in');
      return;
    }
    const parsedMin = Number(minTip);
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      toastInfo('Minimum tip must be a non-negative number');
      return;
    }

    const desired = opts?.desired || (
      !dmsEnabled
        ? { action: DmAction.Disable, status: DmDisableStatus.ALL }
        : !allowNew
        ? { action: DmAction.Disable, status: DmDisableStatus.NEW_DM }
        : { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL }
    );

    if (opts?.spinner === 'tip') setTipSubmitting(true); else setDmSubmitting(true);
    const prev = {
      disables: ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[],
      min: Number((user as any)?.dmSettings?.minTipDhb || 0),
    };

    optimisticPatch({ dmsEnabled, allowNew, minTip: parsedMin });
    try {
      await updateDmUserStatus(address, desired.status, desired.action, parsedMin);
      if (opts?.spinner === 'tip') {
        setTipSubmitting(false);
        setTipSaved(true);
        setTimeout(() => setTipSaved(false), 1000);
      }
    } catch (e) {
      // revert
      patchUser(() => ({ dmSettings: { address, disables: prev.disables, minTipDhb: prev.min } }) as any).catch(() => {});
      toastError(e, 'Failed to update DM preferences');
    } finally {
      if (opts?.spinner === 'tip') setTipSubmitting(false); else setDmSubmitting(false);
    }
  }, [user, dmsEnabled, allowNew, minTip, optimisticPatch, patchUser]);

  const onToggleDmsEnabled = useCallback((val: boolean) => {
    setDmsEnabled(val);
    if (val) {
      setAllowNew(true);
      setTimeout(() => submit({ desired: { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL }, spinner: 'toggle' }).catch(() => {}), 0);
    } else {
      setAllowNew(false);
      setTimeout(() => submit({ desired: { action: DmAction.Disable, status: DmDisableStatus.ALL }, spinner: 'toggle' }).catch(() => {}), 0);
    }
  }, [submit]);

  const onToggleAllowNew = useCallback((val: boolean) => {
    setAllowNew(val);
    if (val) {
      setDmsEnabled(true);
      setTimeout(() => submit({ desired: { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL }, spinner: 'toggle' }).catch(() => {}), 0);
    } else {
      setTimeout(() => submit({ desired: { action: DmAction.Disable, status: DmDisableStatus.NEW_DM }, spinner: 'toggle' }).catch(() => {}), 0);
    }
  }, [submit]);

  const onChangeMinTip = useCallback((t: string) => {
    const cleaned = t.replace(/[^0-9.]/g, '');
    setMinTip(cleaned);
  }, []);

  const onBlurMinTip = useCallback(() => {
    submit({ spinner: 'tip' }).catch(() => {});
  }, [submit]);

  return (
    <View className="mb-8">
      <Text className="text-gray-400 text-xs uppercase mb-2">Direct Messages</Text>
      <View className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
        <View className="px-4 py-4 flex-row items-center justify-between">
          <View>
            <Text className="text-white text-sm">Enable DMs</Text>
            <Text className="text-gray-500 text-xs mt-1">Turn off to block all messages.</Text>
          </View>
          <Switch value={dmsEnabled} onValueChange={onToggleDmsEnabled} disabled={dmSubmitting} />
        </View>
        <View className="h-px bg-gray-800" />
        <View className={`px-4 py-4 flex-row items-center justify-between ${!dmsEnabled ? 'opacity-60' : ''}`}>
          <View className="flex-1 pr-3">
            <Text className="text-white text-sm">Allow New DMs</Text>
            <Text className="text-gray-500 text-xs mt-1">{dmsEnabled ? "If off, only people you've chatted with can message you." : "Turn on DMs to allow new messages."}</Text>
          </View>
          <Switch value={allowNew} onValueChange={onToggleAllowNew} disabled={!dmsEnabled || dmSubmitting} />
        </View>
        <View className="h-px bg-gray-800" />
        <View className="px-4 py-4">
          <Text className="text-white text-sm">Minimum tip (DHB)</Text>
          <Text className="text-gray-500 text-xs mt-1">Set to 0 to allow without a tip.</Text>
          <View className="flex-row items-center mt-2">
            <TextInput
              value={minTip}
              onChangeText={onChangeMinTip}
              onBlur={onBlurMinTip}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#9ca3af"
              className="flex-1 text-white bg-gray-950 border border-gray-800 rounded-lg px-3 h-11"
              editable={!dmSubmitting && !tipSubmitting}
            />
            {tipSubmitting ? (
              <View className="ml-3 h-11 items-center justify-center">
                <ActivityIndicator size="small" color="#9ca3af" />
              </View>
            ) : tipSaved ? (
              <View className="ml-3 h-11 items-center justify-center">
                <Ionicons name="checkmark-circle" size={18} color="#34D399" />
              </View>
            ) : null}
          </View>
          {!dmsEnabled ? (
            <View className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 mt-3">
              <Text className="text-red-300 text-[12px]">All DMs are disabled. New DMs are blocked by default.</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

export default DMSettingsSection;
