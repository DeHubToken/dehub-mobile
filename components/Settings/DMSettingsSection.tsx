import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import { useUser, useAuthActions } from "../../context/AuthContext";
import Icon from "../ui/Icon";
import CustomSwitch from "../ui/CustomSwitch";
import {
  DmAction,
  DmDisableStatus,
} from "../../services/enums/dm-preferences.enum";
import { updateDmUserStatus } from "../../services/dm/dm.api";
import { toastError, toastInfo } from "../../libs";

const DMSettingsSection: React.FC = () => {
  const user = useUser();
  const { patchUser } = useAuthActions();

  const initial = useMemo(() => {
    const disables = ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[];
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
        disables: ((user as any)?.dmSettings?.disables || []) as DmDisableStatus[],
        fee: Number((user as any)?.dmSettings?.perMessageFee || 0),
      };

      optimisticPatch({ dmsEnabled, allowNew, fee: parsedFee });
      try {
        await updateDmUserStatus(address, desired.status, desired.action, parsedFee);
        if (opts?.spinner === "fee") {
          setFeeSubmitting(false);
          setFeeSaved(true);
          setTimeout(() => setFeeSaved(false), 1000);
        }
      } catch (e) {
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
              desired: { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL },
              spinner: "toggle",
            }).catch(() => {}),
          0
        );
      } else {
        setAllowNew(false);
        setTimeout(
          () =>
            submit({
              desired: { action: DmAction.Disable, status: DmDisableStatus.ALL },
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
              desired: { action: DmAction.Enable, status: DmDisableStatus.ACTIVE_ALL },
              spinner: "toggle",
            }).catch(() => {}),
          0
        );
      } else {
        setTimeout(
          () =>
            submit({
              desired: { action: DmAction.Disable, status: DmDisableStatus.NEW_DM },
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
    <>
      <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">
        Direct Messages
      </Text>
      <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
        <View className="px-4 py-3.5 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 pr-3">
            <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
              <Icon name="MessageSquare" size={18} color="#9ca3af" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-sm font-medium">Enable DMs</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                Turn off to block all messages
              </Text>
            </View>
          </View>
          <CustomSwitch
            value={dmsEnabled}
            onValueChange={onToggleDmsEnabled}
            disabled={dmSubmitting}
          />
        </View>
        <View className="h-px bg-theme-neutrals-700 ml-16" />
        <View className={`px-4 py-3.5 flex-row items-center justify-between ${!dmsEnabled ? "opacity-40" : ""}`}>
          <View className="flex-row items-center flex-1 pr-3">
            <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
              <Icon name="UserPlus" size={18} color="#9ca3af" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-sm font-medium">Allow New DMs</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {dmsEnabled
                  ? "If off, only existing chats can message you"
                  : "Turn on DMs first"}
              </Text>
            </View>
          </View>
          <CustomSwitch
            value={allowNew}
            onValueChange={onToggleAllowNew}
            disabled={!dmsEnabled || dmSubmitting}
          />
        </View>
        <View className="h-px bg-theme-neutrals-700 ml-16" />
        <View className="px-4 py-3.5">
          <View className="flex-row items-center mb-2">
            <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
              <Icon name="Coins" size={18} color="#9ca3af" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-sm font-medium">Per-Message Fee (DHB)</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                Charge users per message. Set 0 for free.
              </Text>
            </View>
          </View>
          <View className="flex-row items-center mt-1 ml-12">
            <TextInput
              value={fee}
              onChangeText={onChangeFee}
              onBlur={onBlurFee}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#6b7280"
              className="flex-1 text-white bg-theme-neutrals-900 border border-theme-neutrals-700 rounded-xl px-3.5 h-11 text-sm"
              editable={!dmSubmitting && !feeSubmitting}
            />
            {feeSubmitting ? (
              <View className="ml-3 h-11 items-center justify-center">
                <ActivityIndicator size="small" color="#6b7280" />
              </View>
            ) : feeSaved ? (
              <View className="ml-3 h-11 items-center justify-center">
                <Icon name="CircleCheck" size={18} color="#34D399" />
              </View>
            ) : null}
          </View>
          {!dmsEnabled && (
            <View className="bg-red-500/10 border border-red-500/30 rounded-xl p-2.5 mt-3 ml-12">
              <Text className="text-red-300 text-[11px]">
                All DMs are disabled. New DMs are blocked by default.
              </Text>
            </View>
          )}
        </View>
      </View>
    </>
  );
};

export default DMSettingsSection;
