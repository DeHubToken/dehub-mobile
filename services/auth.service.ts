import { apiClient } from '../libs';
import { setAuthToken, setAuthUser, clearAuthData } from '../libs/authUtils';
import { User } from '../context/AuthContext';

// Interface for authentication responses
interface AuthResponse {
  user: User;
  token: string;
}

export const AuthService = {
  /**
   * Sign in a user
   * @param email User's email
   * @param password User's password
   * @returns Promise with user and token
   */
  async signIn(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>(
        '/auth/signin',
        { email, password },
        { isAuthRequired: false }
      );
      
      // Store auth data
      await setAuthToken(response.token);
      await setAuthUser(response.user);
      
      return response;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  },
  
  /**
   * Sign up a new user
   * @param email User's email
   * @param password User's password
   * @param username User's username
   * @returns Promise with user and token
   */
  async signUp(email: string, password: string, username: string): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>(
        '/auth/signup',
        { email, password, username },
        { isAuthRequired: false }
      );
      
      // Store auth data
      await setAuthToken(response.token);
      await setAuthUser(response.user);
      
      return response;
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  },
  
  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    try {
      // Call the signout endpoint if your API has one
      // await apiClient.post('/auth/signout', {});
      
      // Clear local auth data
      await clearAuthData();
    } catch (error) {
      console.error('Sign out error:', error);
      // Clear local auth data even if API call fails
      await clearAuthData();
      throw error;
    }
  },
  
  /**
   * Request a password reset
   * @param email User's email
   */
  async resetPassword(email: string): Promise<void> {
    try {
      await apiClient.post(
        '/auth/reset-password',
        { email },
        { isAuthRequired: false }
      );
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  },
  
  /**
   * Get the current user profile
   * @returns Promise with user data
   */
  async getCurrentUser(): Promise<User> {
    return await apiClient.get<User>('/auth/me');
  },
  
  /**
   * Update the user's profile
   * @param userData Partial user data to update
   * @returns Promise with updated user data
   */
  async updateProfile(userData: Partial<User>): Promise<User> {
    const updatedUser = await apiClient.patch<User>('/auth/profile', userData);
    await setAuthUser(updatedUser);
    return updatedUser;
  }
};
