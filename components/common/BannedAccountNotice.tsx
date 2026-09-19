/**
 * BannedAccountNotice — what a banned account is told, wherever it tries to write.
 *
 * A ban on DeHub is read-only, not locked-out: the account keeps its sign-in,
 * its feed, its conversations and its data until the person asks for it to be
 * deleted. The API refuses every write with `403 ACCOUNT_BANNED` — this is the
 * part that says so up front, instead of letting somebody type a post that was
 * never going to send.
 *
 * `variant="panel"` fills a composer that has been taken away. `variant="line"`
 * is the one-line form for sitting above an input that is still on screen.
 * Renders nothing at all when the account is not banned.
 */
import React, { memo } from "react";
import { View, Text, Linking, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useBannedAccount } from "../../hooks/useBannedAccount";
import { ScreenNames } from "../../navigation/ScreenNames";

const DELETE_ACCOUNT_URL = "https://dehub.io/delete-account";

interface BannedAccountNoticeProps {
  variant?: "panel" | "line";
  className?: string;
}

const BannedAccountNoticeComponent: React.FC<BannedAccountNoticeProps> = ({
  variant = "panel",
  className = "",
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { isBanned, bannedReason } = useBannedAccount();

  if (!isBanned) return null;

  if (variant === "line") {
    return (
      <View
        className={`flex-row items-center rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 ${className}`}
      >
        <Ionicons name="ban-outline" size={14} color="#FCD34D" />
        <Text className="flex-1 ml-1.5 text-[12px] text-amber-200">
          {t("banned.line")}
        </Text>
      </View>
    );
  }

  return (
    <View
      className={`items-center rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-6 ${className}`}
    >
      <Ionicons name="ban-outline" size={24} color="#FCD34D" />
      <Text className="mt-3 text-[14px] font-semibold text-amber-100 text-center">
        {t("banned.title")}
      </Text>
      <Text className="mt-2 text-[12px] leading-5 text-amber-200/90 text-center">
        {t("banned.body")}
      </Text>
      {bannedReason ? (
        <Text className="mt-2 text-[12px] text-amber-200/70 text-center">
          {t("banned.reason", { reason: bannedReason })}
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={() => navigation.navigate(ScreenNames.Dex as never)}
        className="mt-3 rounded-lg bg-amber-300 px-3 py-2"
      >
        <Text className="text-[12px] font-semibold text-amber-950">
          {t("dex.title")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => Linking.openURL(DELETE_ACCOUNT_URL)}
        className="mt-3 py-1"
      >
        <Text className="text-[12px] font-medium text-amber-200 underline">
          {t("banned.deleteAccount")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export const BannedAccountNotice = memo(BannedAccountNoticeComponent);
export default BannedAccountNotice;
