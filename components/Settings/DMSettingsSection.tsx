import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Switch, TextInput, ActivityIndicator } from "react-native";
import { useAuth } from "../../context/AuthContext";
import {
  DmAction,
  DmDisableStatus,
} from "../../services/enums/dm-preferences.enum";
import { updateDmUserStatus } from "../../services/dm/dm.service";
import { toastError, toastInfo } from "../../libs";
import { Ionicons } from "@expo/vector-icons";

const DMSettingsSection: React.FC = () => {
  const { user, patchUser } = useAuth();

  const initial = useMemo(() => {
    const disables = ((user as any)?.dmSettings?.disables ||
      []) as DmDisableStatus[];
    const fee = Number((user as any)?.dmSettings?.perMessageFee || 0);
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
  const [dmSubmitting, setDmSubmitting] = useState<boolean>(false);
  const [feeSubmitting, setFeeSubmitting] = useState<boolean>(false);
  const [feeSaved, setFeeSaved] = useState<boolean>(false);

  const dmKey = useMemo(() => {
    const disables = JSON.stringify(
      ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[]
    );
    const f = String((user as any)?.dmSettings?.perMessageFee ?? 0);
    return `${disables}|${f}`;
  }, [user]);

  // Keep in sync with user after server updates, but avoid clobbering in-flight UI
  useEffect(() => {
    if (dmSubmitting || feeSubmitting) return;
    setDmsEnabled(initial.dmsEnabled);
    setAllowNew(initial.allowNew);
    setFee(String(initial.fee));
  }, [dmKey]);

  const optimisticPatch = useCallback(
    (next: { dmsEnabled: boolean; allowNew: boolean; fee: number }) => {
      const disables: DmDisableStatus[] = !next.dmsEnabled
        ? [DmDisableStatus.ALL]
        : !next.allowNew
        ? [DmDisableStatus.NEW_DM]
        : [DmDisableStatus.ACTIVE_ALL];
      patchUser(
        (prev: any) =>
          ({
            dmSettings: {
              ...(prev?.dmSettings || {}),
              address: prev?.walletAddress || prev?.address,
              disables,
              perMessageFee: next.fee,
            },
          } as any)
      ).catch(() => {});
    },
    [patchUser]
  );

  const submit = useCallback(
    async (opts?: {
      desired?: { action: DmAction; status: DmDisableStatus };
      spinner?: "toggle" | "fee";
    }) => {
      const address = (
        ((user as any)?.walletAddress || (user as any)?.address || "") as string
      ).toLowerCase();
      if (!address) {
        toastInfo("You must be signed in");
        return;
      }
      const parsedFee = Number(fee);
      if (!Number.isFinite(parsedFee) || parsedFee < 0) {
        toastInfo("Per-message fee must be a non-negative number");
        return;
      }

      const desired =
        opts?.desired ||
        (!dmsEnabled
          ? { action: DmAction.Disable, status: DmDisableStatus.ALL }
          : !allowNew
          ? { action: DmAction.Disable, status: DmDisableStatus.NEW_DM }
          : { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL });

      if (opts?.spinner === "fee") setFeeSubmitting(true);
      else setDmSubmitting(true);
      const prev = {
        disables: ((user as any)?.dmSettings?.disables ||
          []) as DmDisableStatus[],
        fee: Number((user as any)?.dmSettings?.perMessageFee || 0),
      };

      optimisticPatch({ dmsEnabled, allowNew, fee: parsedFee });
      try {
        await updateDmUserStatus(
          address,
          desired.status,
          desired.action,
          parsedFee
        );
        if (opts?.spinner === "fee") {
          setFeeSubmitting(false);
          setFeeSaved(true);
          setTimeout(() => setFeeSaved(false), 1000);
        }
      } catch (e) {
        // revert
        patchUser(
          () =>
            ({
              dmSettings: {
                address,
                disables: prev.disables,
                perMessageFee: prev.fee,
              },
            } as any)
        ).catch(() => {});
        toastError(e, "Failed to update DM preferences");
      } finally {
        if (opts?.spinner === "fee") setFeeSubmitting(false);
        else setDmSubmitting(false);
      }
    },
    [user, dmsEnabled, allowNew, fee, optimisticPatch, patchUser]
  );

  const onToggleDmsEnabled = useCallback(
    (val: boolean) => {
      setDmsEnabled(val);
      if (val) {
        setAllowNew(true);
        setTimeout(
          () =>
            submit({
              desired: {
                action: DmAction.Enable,
                status: DmDisableStatus.ACTIVE_ALL,
              },
              spinner: "toggle",
            }).catch(() => {}),
          0
        );
      } else {
        setAllowNew(false);
        setTimeout(
          () =>
            submit({
              desired: {
                action: DmAction.Disable,
                status: DmDisableStatus.ALL,
              },
              spinner: "toggle",
            }).catch(() => {}),
          0
        );
      }
    },
    [submit]
  );

  const onToggleAllowNew = useCallback(
    (val: boolean) => {
      setAllowNew(val);
      if (val) {
        setDmsEnabled(true);
        setTimeout(
          () =>
            submit({
              desired: {
                action: DmAction.Enable,
                status: DmDisableStatus.ACTIVE_ALL,
              },
              spinner: "toggle",
            }).catch(() => {}),
          0
        );
      } else {
        setTimeout(
          () =>
            submit({
              desired: {
                action: DmAction.Disable,
                status: DmDisableStatus.NEW_DM,
              },
              spinner: "toggle",
            }).catch(() => {}),
          0
        );
      }
    },
    [submit]
  );

  const onChangeFee = useCallback((t: string) => {
    const cleaned = t.replace(/[^0-9.]/g, "");
    setFee(cleaned);
  }, []);

  const onBlurFee = useCallback(() => {
    submit({ spinner: "fee" }).catch(() => {});
  }, [submit]);

  return (
    <View className="mb-8">
      <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
        Direct Messages
      </Text>
      <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
        <View className="px-4 py-4 flex-row items-center justify-between">
          <View>
            <Text className="text-theme-neutrals-100 text-sm font-medium">Enable DMs</Text>
            <Text className="text-theme-neutrals-500 text-xs mt-1">
              Turn off to block all messages.
            </Text>
          </View>
          <Switch
            value={dmsEnabled}
            onValueChange={onToggleDmsEnabled}
            disabled={dmSubmitting}
            trackColor={{ false: '#374151', true: '#10b981' }}
            thumbColor={dmsEnabled ? '#34D399' : '#6B7280'}
          />
        </View>
        <View className="h-px bg-theme-neutrals-700" />
        <View
          className={`px-4 py-4 flex-row items-center justify-between ${
            !dmsEnabled ? "opacity-60" : ""
          }`}
        >
          <View className="flex-1 pr-3">
            <Text className="text-theme-neutrals-100 text-sm font-medium">Allow New DMs</Text>
            <Text className="text-theme-neutrals-500 text-xs mt-1">
              {dmsEnabled
                ? "If off, only people you've chatted with can message you."
                : "Turn on DMs to allow new messages."}
            </Text>
          </View>
          <Switch
            value={allowNew}
            onValueChange={onToggleAllowNew}
            disabled={!dmsEnabled || dmSubmitting}
            trackColor={{ false: '#374151', true: '#10b981' }}
            thumbColor={allowNew ? '#34D399' : '#6B7280'}
          />
        </View>
        <View className="h-px bg-theme-neutrals-700" />
        <View className="px-4 py-4">
          <Text className="text-theme-neutrals-100 text-sm font-medium">Per-Message Fee (DHB)</Text>
          <Text className="text-theme-neutrals-500 text-xs mt-1">
            Charge users per message. Set to 0 for free DMs.
          </Text>

          <View className="flex-row items-center mt-2">
            <TextInput
              value={fee}
              onChangeText={onChangeFee}
              onBlur={onBlurFee}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#A6A9AC"
              className="flex-1 text-theme-neutrals-100 bg-theme-neutrals-900 border border-theme-neutrals-700 rounded-lg px-3 h-11"
              editable={!dmSubmitting && !feeSubmitting}
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
          {!dmsEnabled ? (
            <View className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 mt-3">
              <Text className="text-red-300 text-[12px]">
                All DMs are disabled. New DMs are blocked by default.
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

export default DMSettingsSection;
