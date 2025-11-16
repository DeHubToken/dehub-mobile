import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { ScreenNames } from "../navigation/ScreenNames";
import { toastSuccess, toastError } from "../libs";
import ScreenHeader from "../components/ScreenHeader";
import { logoutWeb3Auth } from "../config/web3auth.config";
import FullScreenLoader from "../components/FullScreenLoader";
import ReportBugModal from "../components/Settings/ReportBugModal";
import ExportPrivateKeyModal from "../components/Settings/ExportPrivateKeyModal";
import { Ionicons } from "@expo/vector-icons";
import { openInApp } from "../libs/links.utils";
import {
  TERMS_OF_SERVICE_LINK,
  PRIVACY_POLICY_LINK,
  DELETE_DATA_OR_ACCOUNT_LINK,
  SUPPORT_MAIL,
  DEV_MAIL,
} from "../config/links";
import DMSettingsSection from "../components/Settings/DMSettingsSection";
import { ChainId } from "../config/constants";
import ChainSwitchModal from "../components/Settings/ChainSwitchModal";
import BlockedAccountsModal from "../components/Settings/BlockedAccountsModal";

// Lightweight Account Settings screen focused on account-level actions.
// Extend later with preferences, linked wallets, notifications, privacy, etc.
const AccountSettingsScreen: React.FC<any> = ({ navigation }) => {
  const {
    signOut,
    user,
    patchUser,
    chainId,
    authMethod,
    isSignedIn,
    needsUsername,
  } = useAuth();
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [bugModalVisible, setBugModalVisible] = useState<boolean>(false);
  const [exportPkVisible, setExportPkVisible] = useState<boolean>(false);
  const [chainModalVisible, setChainModalVisible] = useState<boolean>(false);
  const [blockedModalVisible, setBlockedModalVisible] =
    useState<boolean>(false);
  const isImported = authMethod === "local";
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logoutWeb3Auth(); // end remote Web3Auth session
      await signOut(); // clear local auth + tokens
      toastSuccess("Logout successful");
      // Reset the root navigator to App -> Root (tabs) -> Home specifically
      // navigation?.getParent?.()?.reset({
      //   index: 0,
      //   routes: [
      //     {
      //       name: ScreenNames.App as never,
      //       // Nested state to land on BottomTabNavigator Root -> Home tab
      //       state: {
      //         index: 0,
      //         routes: [
      //           {
      //             name: ScreenNames.Root as never,
      //             state: {
      //               index: 0,
      //               routes: [{ name: ScreenNames.Home as never }],
      //             },
      //           } as never,
      //         ],
      //       },
      //     } as never,
      //   ],
      // });
    } catch (e) {
      console.error("[AccountSettings] signOut error", e);
      toastError(e, "Sign out failed.");
    } finally {
      setSigningOut(false);
    }
  }, [signingOut, signOut]);

  const handleReportBug = useCallback(() => {
    setBugModalVisible(true);
  }, []);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {signingOut && <FullScreenLoader message="Signing out…" />}
      <ScreenHeader title="Settings" canGoBack />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
      >
        {/* Account */}
        <View className="mb-8">
          <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
            Account
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <View className="px-4 py-3 border-b border-theme-neutrals-700">
              <Text className="text-theme-accent-foreground text-sm font-semibold">
                Logged in as
              </Text>
              <Text className="text-theme-neutrals-400 text-sm mt-1">
                {(user?.username || user?.email || "Anonymous") +
                  (isImported ? " (imported)" : "")}
              </Text>
            </View>
            {/* Active Chain (opens modal) */}
            <TouchableOpacity
              onPress={() => setChainModalVisible(true)}
              className="px-4 py-4 flex-row items-center justify-between active:bg-theme-neutrals-700"
            >
              <View className="flex-1 pr-2">
                <Text className="text-theme-neutrals-100 text-sm font-medium">
                  Switch Active Chain
                </Text>
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  {chainId === ChainId.BASE_MAINNET
                    ? "Base"
                    : chainId === ChainId.BSC_MAINNET
                    ? "BNB"
                    : `Chain ID ${chainId ?? "N/A"}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
            <View className="h-px bg-theme-neutrals-700" />
            {/* Gas Sponsorship status */}
            <View className="px-4 py-4 flex-row items-center justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-theme-neutrals-100 text-sm font-medium">
                  Gas Sponsorship
                </Text>
                {isImported ? (
                  <Text className="text-theme-neutrals-500 text-xs mt-1">
                    Gas sponsorship is unavailable for imported accounts
                  </Text>
                ) : (
                  <Text className="text-theme-neutrals-500 text-xs mt-1">
                    Transaction fees covered by the app
                  </Text>
                )}
              </View>
              {isImported ? (
                <View className="bg-theme-neutrals-700/30 px-2 py-1 rounded-full">
                  <Text className="text-theme-neutrals-400 text-[10px] font-semibold">
                    Disabled
                  </Text>
                </View>
              ) : (
                <View className="bg-emerald-500/20 px-2 py-1 rounded-full">
                  <Text className="text-emerald-400 text-[10px] font-semibold">
                    Enabled
                  </Text>
                </View>
              )}
            </View>
            <View className="h-px bg-theme-neutrals-700" />
            <TouchableOpacity
              onPress={() => setExportPkVisible(true)}
              className="px-4 py-4 flex-row items-center justify-between active:bg-theme-neutrals-700"
            >
              <View>
                <Text className="text-white text-sm">Export Private Key</Text>
                <Text className="text-gray-500 text-xs mt-1">
                  Reveal your wallet’s private key (advanced)
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
            <View className="h-px bg-theme-neutrals-700" />
            <TouchableOpacity
              onPress={handleSignOut}
              disabled={signingOut}
              className={`px-4 py-4 flex-row items-center justify-between active:bg-theme-neutrals-700 ${
                signingOut ? "opacity-50" : ""
              }`}
            >
              <View className="flex-row items-center">
                {signingOut && (
                  <ActivityIndicator size="small" color="#f87171" />
                )}
                <Text className="text-destructive font-semibold text-sm ml-2">
                  {signingOut ? "Logging out..." : "Log Out"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
        {/* Direct Messages */}
        <DMSettingsSection />

        {/* Preferences */}
        <View className="mb-8">
          <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
            Preferences
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <TouchableOpacity
              disabled
              className="px-4 py-4 flex-row items-center justify-between opacity-60"
            >
              <View>
                <Text className="text-theme-neutrals-100 text-sm">
                  Appearance
                </Text>
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  Theme, dark mode
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
            <View className="h-px bg-theme-neutrals-700" />
            <TouchableOpacity
              disabled
              className="px-4 py-4 flex-row items-center justify-between opacity-60"
            >
              <View>
                <Text className="text-theme-neutrals-100 text-sm">
                  Notifications
                </Text>
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  Push, mentions
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
            <View className="h-px bg-theme-neutrals-700" />
            <TouchableOpacity
              disabled
              className="px-4 py-4 flex-row items-center justify-between opacity-60"
            >
              <View>
                <Text className="text-theme-neutrals-100 text-sm">
                  Data Saver
                </Text>
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  Reduce image/video usage
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Privacy & Security */}
        <View className="mb-8">
          <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
            Privacy & Security
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <TouchableOpacity
              onPress={() => setBlockedModalVisible(true)}
              className="px-4 py-4 flex-row items-center justify-between active:bg-theme-neutrals-700"
            >
              <View>
                <Text className="text-theme-neutrals-100 text-sm font-medium">
                  Blocked Accounts
                </Text>
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  {((user?.blocklist?.blocked?.length || 0) as number) > 0
                    ? `${user?.blocklist?.blocked?.length} blocked`
                    : "You haven’t blocked anyone"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
            <View className="h-px bg-theme-neutrals-700" />
            <TouchableOpacity
              disabled
              className="px-4 py-4 flex-row items-center justify-between opacity-60"
            >
              <View>
                <Text className="text-theme-neutrals-100 text-sm">
                  Two-factor Authentication
                </Text>
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  Add extra security
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
            <View className="h-px bg-theme-neutrals-700" />
            <TouchableOpacity
              onPress={() => openInApp(DELETE_DATA_OR_ACCOUNT_LINK)}
              className="px-4 py-4 flex-row items-center justify-between active:bg-theme-neutrals-700"
            >
              <View>
                <Text className="text-theme-neutrals-100 text-sm font-medium">
                  Delete Account / Data
                </Text>
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  Learn how to request deletion
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Support & Legals */}
        <View className="mb-8">
          <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
            Support & Legals
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <TouchableOpacity
              onPress={handleReportBug}
              className="px-4 py-4 flex-row items-center justify-between active:bg-theme-neutrals-700"
            >
              <Text className="text-theme-neutrals-100 text-sm font-medium">
                Report a Bug
              </Text>
              <Ionicons name="open-outline" size={18} color="#9ca3af" />
            </TouchableOpacity>
            <View className="h-px bg-theme-neutrals-700" />
            <TouchableOpacity
              onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
              className="px-4 py-4 flex-row items-center justify-between active:bg-theme-neutrals-700"
            >
              <Text className="text-theme-neutrals-100 text-sm font-medium">
                Terms of Service
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
            <View className="h-px bg-theme-neutrals-700" />
            <TouchableOpacity
              onPress={() => openInApp(PRIVACY_POLICY_LINK)}
              className="px-4 py-4 flex-row items-center justify-between active:bg-theme-neutrals-700"
            >
              <Text className="text-theme-neutrals-100 text-sm font-medium">
                Privacy Policy
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View className="mt-4">
          <Text className="text-center text-theme-neutrals-600 text-xs">
            v1.0.0 • More preferences coming soon
          </Text>
        </View>
      </ScrollView>
      <ReportBugModal
        visible={bugModalVisible}
        onClose={() => setBugModalVisible(false)}
        username={(user?.username || user?.email || "Anonymous") as string}
      />
      <ExportPrivateKeyModal
        visible={exportPkVisible}
        onClose={() => setExportPkVisible(false)}
      />
      <ChainSwitchModal
        visible={chainModalVisible}
        onClose={() => setChainModalVisible(false)}
      />
      <BlockedAccountsModal
        visible={blockedModalVisible}
        onClose={() => setBlockedModalVisible(false)}
      />
    </View>
  );
};

export default AccountSettingsScreen;
