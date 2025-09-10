import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ScreenNames } from '../navigation/ScreenNames';
import { toastSuccess, toastError } from '../libs';
import ScreenHeader from '../components/ScreenHeader';
import { logoutWeb3Auth } from '../config/web3auth.config';
import FullScreenLoader from '../components/FullScreenLoader';

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

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top','bottom']}>
      {(signingOut) && <FullScreenLoader message="Signing out…" />}
      <ScreenHeader title="Settings" canGoBack />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
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
              className={`px-4 py-4 flex-row items-center ${signingOut ? 'opacity-50' : ''}`}
            >
              {signingOut && <ActivityIndicator size="small" color="#f87171" className="mr-2" />}
              <Text className="text-red-500 font-semibold text-sm">{signingOut ? 'Logging out...' : 'Log Out'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View className="mt-10 opacity-60">
          <Text className="text-center text-gray-600 text-xs">v1.0.0 • More preferences coming soon</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AccountSettingsScreen;
