/**
 * DmSafetyBanner — scam warning above a DM thread.
 *
 * Wallet-drainer scams arrive by DM: an account wearing Mal's name says your
 * profile is missing or there is a "node issue", and sends a link to fix it.
 *  - red, when the other person's name reads as a team name they don't own;
 *  - amber, when they have sent a link.
 * Same rules and copy as dehubweb's DmSafetyBanner.
 */
import React, { memo } from "react";
import { View, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { staffImpersonated } from "../../libs/impersonation";

const LINK = /(https?:\/\/|www\.)|\b[a-z0-9-]+\.(com|io|net|org|xyz|app|site|online|link|live|top|info|cc|me|co|dev|pro|gg|vip|club|fun)\b/i;

export function hasLink(text?: string | null): boolean {
  return !!text && LINK.test(text);
}

interface Props {
  peer: { address?: string | null; displayName?: string | null; username?: string | null } | null | undefined;
  peerSentLink: boolean;
}

const DmSafetyBannerComponent: React.FC<Props> = ({ peer, peerSentLink }) => {
  const { t } = useTranslation();
  const impersonated = staffImpersonated(peer);
  if (!impersonated && !peerSentLink) return null;
  const danger = !!impersonated;
  const tone = danger
    ? { bg: "rgba(239,68,68,0.16)", border: "rgba(239,68,68,0.45)", text: "#FCA5A5", icon: "#F87171" }
    : { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.45)", text: "#FCD34D", icon: "#FBBF24" };

  return (
    <View
      accessibilityRole="alert"
      testID="dm-safety-banner"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: "rgba(9,9,11,0.82)",
        borderColor: tone.border,
      }}
    >
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, backgroundColor: tone.bg }} />
      <Ionicons name="shield-half-outline" size={16} color={tone.icon} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 16, color: tone.text }}>
        {danger ? (
          <>
            <Text style={{ fontWeight: "700" }}>
              {t("dmSafety.notReal", { defaultValue: "This is not the real {{name}}.", name: impersonated })}
            </Text>{" "}
            {t("dmSafety.neverLink", {
              defaultValue:
                "The Riftn team will never DM you a link to fix your profile or wallet. Do not open links, connect your wallet or sign anything. Block and report this account.",
            })}
          </>
        ) : (
          t("dmSafety.linkCaution", {
            defaultValue:
              "Careful with links. Riftn will never ask you to connect your wallet, sign, or share your seed phrase to fix your account.",
          })
        )}
      </Text>
    </View>
  );
};

export default memo(DmSafetyBannerComponent);
