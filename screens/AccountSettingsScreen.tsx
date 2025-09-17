import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ScreenNames } from '../navigation/ScreenNames';
import { toastSuccess, toastError } from '../libs';
import ScreenHeader from '../components/ScreenHeader';
import { logoutWeb3Auth } from '../config/web3auth.config';
import FullScreenLoader from '../components/FullScreenLoader';
import { Ionicons } from '@expo/vector-icons';
import { openExternalLink, openInApp } from '../libs/links.utils';
import { TERMS_OF_SERVICE_LINK, PRIVACY_POLICY_LINK, DELETE_DATA_OR_ACCOUNT_LINK, SUPPORT_MAIL, DEV_MAIL } from '../config/links';

// Lightweight Account Settings screen focused on account-level actions.
// Extend later with preferences, linked wallets, notifications, privacy, etc.
const AccountSettingsScreen: React.FC<any> = ({ navigation }) => {
  const { signOut, user } = useAuth();
  const [signingOut, setSigningOut] = useState<boolean>(false);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logoutWeb3Auth(); // end remote Web3Auth session
      await signOut();        // clear local auth + tokens
      toastSuccess('Logout successful');
            // Let RootNavigator react to isSignedIn flip; no manual reset.
      // Let root navigator swap stacks; fallback to root if still mounted
      if (navigation?.navigate) {
        navigation.navigate(ScreenNames.Root as never);
      }
    } catch (e) {
      console.error('[AccountSettings] signOut error', e);
      toastError(e, 'Sign out failed.');
    } finally {
      setSigningOut(false);
    }
  }, [signingOut, signOut]);

  const handleReportBug = useCallback(() => {
    try {
      const username = (user?.username || user?.email || 'Anonymous').toString();
      const subject = encodeURIComponent(`Dehub.io | Bug Report | ${username}`);
      const to = encodeURIComponent(`${SUPPORT_MAIL},${DEV_MAIL}`);
      const mailto = `mailto:${to}?subject=${subject}`;
      // open mailto with Linking via openInApp fallback path
      openExternalLink(mailto);
    } catch (e) {
      console.warn('[Settings] report bug mail failed', e);
    }
  }, [user]);

  return (
    <View className="flex-1 bg-black">
      {(signingOut) && <FullScreenLoader message="Signing out…" />}
      <ScreenHeader title="Settings" canGoBack />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {/* Account */}
        <View className="mb-8">
          <Text className="text-gray-400 text-xs uppercase mb-2">Account</Text>
          <View className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
            <View className="px-4 py-3 border-b border-gray-800">
              <Text className="text-white text-sm font-medium">Logged in as</Text>
              <Text className="text-gray-400 text-sm mt-1">{user?.username || user?.email || 'Anonymous'}</Text>
            </View>
            <TouchableOpacity
              onPress={handleSignOut}
              disabled={signingOut}
              className={`px-4 py-4 flex-row items-center justify-between ${signingOut ? 'opacity-50' : ''}`}
            >
              <View className="flex-row items-center">
                {signingOut && <ActivityIndicator size="small" color="#f87171" />}
                <Text className="text-red-500 font-semibold text-sm ml-2">{signingOut ? 'Logging out...' : 'Log Out'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Preferences */}
        <View className="mb-8">
          <Text className="text-gray-400 text-xs uppercase mb-2">Preferences</Text>
          <View className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
            <TouchableOpacity disabled className="px-4 py-4 flex-row items-center justify-between opacity-60">
              <View>
                <Text className="text-white text-sm">Appearance</Text>
                <Text className="text-gray-500 text-xs mt-1">Theme, dark mode</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
            <View className="h-px bg-gray-800" />
            <TouchableOpacity disabled className="px-4 py-4 flex-row items-center justify-between opacity-60">
              <View>
                <Text className="text-white text-sm">Notifications</Text>
                <Text className="text-gray-500 text-xs mt-1">Push, mentions</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
            <View className="h-px bg-gray-800" />
            <TouchableOpacity disabled className="px-4 py-4 flex-row items-center justify-between opacity-60">
              <View>
                <Text className="text-white text-sm">Data Saver</Text>
                <Text className="text-gray-500 text-xs mt-1">Reduce image/video usage</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Privacy & Security */}
        <View className="mb-8">
          <Text className="text-gray-400 text-xs uppercase mb-2">Privacy & Security</Text>
          <View className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
            <TouchableOpacity disabled className="px-4 py-4 flex-row items-center justify-between opacity-60">
              <View>
                <Text className="text-white text-sm">Blocked Accounts</Text>
                <Text className="text-gray-500 text-xs mt-1">Manage your block list</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
            <View className="h-px bg-gray-800" />
            <TouchableOpacity disabled className="px-4 py-4 flex-row items-center justify-between opacity-60">
              <View>
                <Text className="text-white text-sm">Two-factor Authentication</Text>
                <Text className="text-gray-500 text-xs mt-1">Add extra security</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
            <View className="h-px bg-gray-800" />
            <TouchableOpacity
              onPress={() => openInApp(DELETE_DATA_OR_ACCOUNT_LINK)}
              className="px-4 py-4 flex-row items-center justify-between"
            >
              <View>
                <Text className="text-white text-sm">Delete Account / Data</Text>
                <Text className="text-gray-500 text-xs mt-1">Learn how to request deletion</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Support & Legals */}
        <View className="mb-8">
          <Text className="text-gray-400 text-xs uppercase mb-2">Support & Legals</Text>
          <View className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
            <TouchableOpacity
              onPress={handleReportBug}
              className="px-4 py-4 flex-row items-center justify-between"
            >
              <Text className="text-white text-sm">Report a Bug</Text>
              <Ionicons name="open-outline" size={18} color="#9ca3af" />
            </TouchableOpacity>
            <View className="h-px bg-gray-800" />
            <TouchableOpacity
              onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
              className="px-4 py-4 flex-row items-center justify-between"
            >
              <Text className="text-white text-sm">Terms of Service</Text>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
            <View className="h-px bg-gray-800" />
            <TouchableOpacity
              onPress={() => openInApp(PRIVACY_POLICY_LINK)}
              className="px-4 py-4 flex-row items-center justify-between"
            >
              <Text className="text-white text-sm">Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View className="mt-4">
          <Text className="text-center text-gray-600 text-xs">v1.0.0 • More preferences coming soon</Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default AccountSettingsScreen;
