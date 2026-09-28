import { Platform } from 'react-native';
import { apiClient } from '../libs';
import { supabase } from './supabase';

export async function requestAccountErasure() {
  const { data } = await supabase.auth.getSession();
  const apple = data.session?.user.identities?.some(identity => identity.provider === 'apple');
  let appleAuthorizationCode: string | undefined;
  if (apple && Platform.OS === 'ios') {
    const AppleAuthentication: typeof import('expo-apple-authentication') = require('expo-apple-authentication');
    // A fresh code lets the server revoke Apple's authorization without ever
    // persisting the Apple token or the device credential in account data.
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!credential.authorizationCode) throw new Error('Apple authorization is required');
    appleAuthorizationCode = credential.authorizationCode;
  }
  const response = await apiClient.post<{ status: boolean; result?: { status: string } }>(
    '/account/erase', {
      confirmation: 'DELETE', appleAuthorizationCode,
      appleRefreshToken: data.session?.provider_refresh_token || undefined,
    }, { timeoutMs: 60000 },
  );
  if (!response.status || !response.result) throw new Error('Deletion was not accepted');
  return response.result;
}
