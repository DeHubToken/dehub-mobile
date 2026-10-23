/**
 * Hold-gated post sheet: shows what the post needs and re-reads the viewer's
 * balances on "Verify & Unlock". Port of web's locked drawer +
 * VerifyUnlockButton.
 *
 * The app decides the gate locally from the signed-in user's balanceData
 * (libs/validators.util), so verifying means refreshing that data and
 * reading the gate again. Falling short offers the DHB top-up.
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useThemeRootStyle } from "../../context/ThemeContext";
import { useAuthActions, useAuthState, useUser } from "../../context/AuthContext";
import { useStreamAccessInfo } from "../../libs/validators.util";
import { isDhbHoldingsGate, ownedDhbHoldings } from "../../libs/holdings-gate";
import { formatCompactNumber } from "../../libs/numbers.util";
import { toastSuccess } from "../../libs/toast";
import { ScreenNames } from "../../navigation/ScreenNames";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The post, as FeedCard and the gate helpers read it. */
  post: any;
}

export default function HoldGateSheet({ visible, onClose, post }: Props) {
  const { t } = useTranslation();
  const rootStyle = useThemeRootStyle();
  const navigation = useNavigation<any>();
  const user = useUser() as any;
  const { isSignedIn } = useAuthState();
  const { requireAuth, refreshUser } = useAuthActions();
  const access = useStreamAccessInfo(post);
  const locked = !!access?.streamStatus?.isLockedWithLockContent;

  const info = post?.streamInfo || {};
  const needed = Number(info.lockContentAmount ?? info.lockAmount ?? 0);
  const symbol: string = info.lockContentTokenSymbol || "DHB";
  const isDhb = isDhbHoldingsGate(
    symbol,
    info.lockContentContractAddress,
    Array.isArray(info.lockContentChainIds) ? info.lockContentChainIds : [info.lockContentChainIds ?? 8453],
  );

  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setChecking(false);
      setChecked(false);
      closedRef.current = false;
    }
  }, [visible]);

  // After a refresh, the gate is read again from the fresh balances.
  useEffect(() => {
    if (!visible || !checked || checking || closedRef.current) return;
    if (!locked) {
      closedRef.current = true;
      toastSuccess(t("copy.3aefdd5f5915", { defaultValue: "Content unlocked! 🎉" }));
      onClose();
    }
  }, [visible, checked, checking, locked, onClose, t]);

  const verify = () => {
    if (!isSignedIn) {
      requireAuth(() => {});
      return;
    }
    setChecking(true);
    setChecked(false);
    Promise.resolve(refreshUser())
      .catch(() => {})
      .finally(() => {
        setChecking(false);
        setChecked(true);
      });
  };

  const held = isDhb ? ownedDhbHoldings(user?.balanceData ?? []) : null;
  const short = checked && !checking && locked;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" blurIntensity={50}>
      <View style={[{ paddingHorizontal: 16, paddingBottom: 28, gap: 14 }, rootStyle]}>
        <View style={{ alignItems: "center", paddingTop: 12 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="Lock" size={18} color="#fff" />
          <Text className="text-white text-lg font-semibold">{t("drawers.gatedTitle", { defaultValue: "Gated content" })}</Text>
        </View>

        {needed > 0 && (
          <View
            className="border border-white/10"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)" }}
          >
            <Text className="text-white text-sm">{t("drawers.mustHoldToView", { defaultValue: "Must hold to view" })}</Text>
            <Text className="text-white text-lg font-bold">
              {formatCompactNumber(needed)} {symbol}
            </Text>
          </View>
        )}

        <Text className="text-white/60 text-sm" style={{ textAlign: "center" }}>
          {t("drawers.gatedDescription", { defaultValue: "Hold the required tokens in your wallet to unlock this content." })}
        </Text>

        <Pressable
          onPress={checking ? undefined : verify}
          className="border border-white/15"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", opacity: checking ? 0.6 : 1 }}
          accessibilityRole="button"
        >
          {checking ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="ShieldCheck" size={16} color="#fff" />}
          <Text className="text-white text-sm font-semibold">
            {checking
              ? t("copy.48201f5584e2", { defaultValue: "Checking your balance…" })
              : t("copy.ff701a069af2", { defaultValue: "Verify & Unlock" })}
          </Text>
        </Pressable>

        {short && (
          <>
            <Text className="text-red-400 text-xs" style={{ textAlign: "center" }}>
              {held !== null
                ? t("postGate.holdShort", {
                    held: formatCompactNumber(Math.floor(held)),
                    needed: formatCompactNumber(needed),
                    symbol,
                  })
                : t("postGate.holdShortUnknown", { needed: formatCompactNumber(needed), symbol })}
            </Text>
            {isDhb && (
              <Pressable
                onPress={() => {
                  onClose();
                  navigation.navigate(ScreenNames.Dpay, { initialTab: "buy" });
                }}
                style={{ alignSelf: "center", paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                <Text className="text-white text-xs font-semibold">{t("dpay.topUp")}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </GlassModal>
  );
}
