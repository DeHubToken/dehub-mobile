import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassModal from '../ui/GlassModal';
import { SOCIAL_PROVIDERS, loginWithSocial, deriveAddressFromPrivateKey, isWeb3AuthConfigured } from '../../config/web3auth.config';
import { ChainId } from '../../config/constants';
import { useAuth } from '../../context/AuthContext';
import FullScreenLoader from '../FullScreenLoader';
import { toastError } from '../../libs';
import SocialLoginIcons from './SocialLoginIcons';

interface SignInGatewayModalProps { visible: boolean; onClose: () => void }

const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

const SignInGatewayModal: React.FC<SignInGatewayModalProps> = ({ visible, onClose }) => {
  const { signInWithWallet, needsUsername, isLoading: authLoading } = useAuth();
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState('');

  const handleSocialLogin = useCallback(async (provider: string) => {
    if (!isWeb3AuthConfigured()) {
      toastError('Social login unavailable. Please try again later.');
      return;
    }
    setIsLocalLoading(true);
    setCurrentProvider(provider);
    try {
      const result = await loginWithSocial(provider as any);
      const address = result.address || deriveAddressFromPrivateKey(result.privateKey);
      if (!address) throw new Error('Failed to obtain wallet address from Web3Auth');
      await signInWithWallet(address, TARGET_CHAIN_ID);
    } catch (e: any) {
      console.error('[SignInGatewayModal] Social login error', e);
      toastError(e, 'Login failed. Please retry.');
    } finally {
      setIsLocalLoading(false);
      setCurrentProvider('');
    }
  }, [signInWithWallet]);

  const handleProviderPress = useCallback((provider: string) => {
    handleSocialLogin(provider);
  }, [handleSocialLogin]);

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" blurIntensity={50}>
      <SafeAreaView className="max-h-[88%]">
          {(authLoading || isLocalLoading) && !needsUsername && (
            <FullScreenLoader message="Signing you in…" />
          )}
          <TouchableOpacity
            className="absolute right-5 top-3 z-10 px-3 py-2 rounded-full bg-gray-800"
            onPress={onClose}
            disabled={authLoading || isLocalLoading || needsUsername}
            accessibilityLabel="Close authentication modal"
          >
            <Text className={`text-white font-medium ${authLoading || isLocalLoading || needsUsername ? 'opacity-40' : ''}`}>Cancel</Text>
          </TouchableOpacity>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-5">
            <View className="items-center mt-8">
              <Text className="text-white text-2xl font-bold mb-3">Sign in to continue</Text>
              <Text className="text-gray-400 text-center text-sm mb-6">
                You need to sign in to perform this action.
              </Text>
            </View>
            <SocialLoginIcons
              onPress={handleProviderPress as any}
              busyProvider={isLocalLoading ? currentProvider : undefined}
              disabled={isLocalLoading}
            />
            <View className="mt-6 mb-4">
              <Text className="text-gray-500 text-[11px] text-center">
                By continuing, you agree to our <Text className="text-blue-400">Terms of Service</Text> and <Text className="text-blue-400">Privacy Policy</Text>.
              </Text>
            </View>
          </ScrollView>
      </SafeAreaView>
    </GlassModal>
  );
};

export default SignInGatewayModal;
