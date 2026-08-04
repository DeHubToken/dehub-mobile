import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import { WEBSITE_LINK } from "../../config/links";
import { openInApp } from "../../libs/links.utils";
import type { LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";

export interface LegacyAccountWarningModalProps {
  visible: boolean;
  accounts: LegacyAccountMatch[];
  /** User chose to proceed with a brand-new wallet anyway. */
  onCreateAnyway: () => void;
  onClose: () => void;
}

/**
 * Gate shown instead of silently creating a wallet when this Supabase
 * identity's email matches a pre-migration (Web3Auth-era) DeHub account.
 *
 * Mobile has no Web3Auth SDK to reconstruct that old key itself (see
 * libs/wallet-core/legacy-detect.ts) — only dehubweb can run that recovery —
 * so this can only warn and send the user there, not self-serve it. Still
 * far better than the silent duplicate-account creation this replaces: the
 * user gets a chance to keep their real account (followers, uploads, DHB
 * balance) instead of it being orphaned behind a fresh empty one.
 */
const LegacyAccountWarningModal: React.FC<LegacyAccountWarningModalProps> = ({
  visible,
  accounts,
  onCreateAnyway,
  onClose,
}) => {
  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" blurIntensity={50} maxHeight="88%">
      <ScrollView className="px-6 pt-6 pb-8" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
          <Ionicons name="warning-outline" size={22} color="#fbbf24" />
          <Text className="text-white text-xl font-bold">Existing account found</Text>
        </View>
        <Text className="text-theme-neutrals-400 text-sm mb-4">
          This login is linked to an older DeHub account. Creating a new wallet here will NOT
          recover it — you'd end up with a separate, empty account instead.
        </Text>

        <View className="rounded-xl border border-white/10 bg-white/5 p-3" style={{ gap: 8 }}>
          {accounts.map((a, i) => (
            <View key={i} className="flex-row items-center justify-between">
              <Text className="text-white text-sm">
                {a.username ? `@${a.username}` : "Unnamed account"}
                {a.signupMethod ? ` · ${a.signupMethod}` : ""}
              </Text>
              {typeof a.badgeBalance === "number" && (
                <Text className="text-green-300 text-xs">{a.badgeBalance.toLocaleString()} DHB</Text>
              )}
            </View>
          ))}
        </View>

        <Text className="text-theme-neutrals-400 text-sm mt-4 mb-2">
          Recovering an old account needs a one-time step only available on the DeHub website —
          this device can't reconstruct that old wallet's key.
        </Text>

        <TouchableOpacity
          onPress={() => openInApp(WEBSITE_LINK)}
          className="rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent flex-row justify-center"
          style={{ gap: 8 }}
        >
          <Ionicons name="open-outline" size={18} color="#FFFFFF" />
          <Text className="text-white text-sm font-medium">Recover on dehub.io</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCreateAnyway} className="mt-4 items-center py-2">
          <Text className="text-theme-neutrals-500 text-xs">
            I don't want that account — create a new one anyway
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onClose} className="mt-2 items-center py-2">
          <Text className="text-theme-neutrals-500 text-xs">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassModal>
  );
};

export default LegacyAccountWarningModal;
