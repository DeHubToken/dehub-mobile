jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../../libs', () => ({ apiClient: { post: jest.fn() } }));
jest.mock('../../services/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn() }));
import { apiClient } from '../../libs';
import { supabase } from '../../services/supabase';
import * as Apple from 'expo-apple-authentication';
import { requestAccountErasure } from '../../services/accountErasure.service';

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { identities: [{ provider: 'apple' }] } } } });
  (Apple.signInAsync as jest.Mock).mockResolvedValue({ authorizationCode: 'fresh-apple-code' });
  (apiClient.post as jest.Mock).mockResolvedValue({ status: true, result: { status: 'pending' } });
});
it('reauthenticates Apple users and submits a fresh authorization code for revocation', async () => {
  expect(await requestAccountErasure()).toEqual({ status: 'pending' });
  expect(apiClient.post).toHaveBeenCalledWith('/account/erase', {
    confirmation: 'DELETE', appleAuthorizationCode: 'fresh-apple-code', appleRefreshToken: undefined,
  }, { timeoutMs: 60000 });
});
it('does not submit deletion when Apple reauthentication is cancelled', async () => {
  (Apple.signInAsync as jest.Mock).mockRejectedValue(new Error('cancelled'));
  await expect(requestAccountErasure()).rejects.toThrow('cancelled');
  expect(apiClient.post).not.toHaveBeenCalled();
});
it('lets email users delete without an Apple authorization prompt', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { identities: [{ provider: 'email' }] } } } });
  await requestAccountErasure();
  expect(Apple.signInAsync).not.toHaveBeenCalled();
});
it('does not show success for an unaccepted deletion request', async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: false });
  await expect(requestAccountErasure()).rejects.toThrow('Deletion was not accepted');
});
