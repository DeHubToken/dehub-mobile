import React, { createContext, useState, useEffect, useContext } from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
import { theme } from '../theme';
import { 
  hasSeenAuth, 
  setHasSeenAuth, 
  getAuthUser, 
  getAuthToken, 
  setAuthUser, 
  setAuthToken, 
  clearAuthData 
} from '../libs/authUtils';
import { AuthService } from '../services/auth.service';
import { apiClient } from '../libs/apiClient';

// Define the shape of the user object
export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  walletAddress?: string;
  authProvider?: string;
  // Add more user properties as needed
}

// Define the shape of the auth context
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isSignedIn: boolean;
  isFirstTimeUser: boolean;
  signOut: () => Promise<void>;
  skipAuth: () => Promise<void>;
  updateUserProfile: (userData: Partial<User>) => Promise<void>;
  signInWithWallet: (walletAddress: string, chainId: number) => Promise<void>;
  // Add more auth methods as needed
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider props
interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(true);

  // Initialize auth state
  useEffect(() => {
    // Load auth state from SecureStore
    const loadAuthState = async () => {
      try {
        const userData = await getAuthUser<User>();
        const token = await getAuthToken();
        const seenAuth = await hasSeenAuth();
        
        if (userData && token) {
          setUser(userData);
          setIsSignedIn(true);
        }
        
        if (seenAuth) {
          setIsFirstTimeUser(false);
        }
      } catch (error) {
        console.error('Failed to load auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthState();
  }, []);

  // Sign in with wallet
  const signInWithWallet = async (walletAddress: string, chainId: number) => {
    setIsLoading(true);
    try {
      // Use the auth service to authenticate with wallet
      const { user: walletUser, token } = await AuthService.signInWithWallet(walletAddress, chainId);
      
      // Store user and token (handled by service, but we still need to update the state)
      await setHasSeenAuth();
      
      // Update state
      setUser(walletUser);
      setIsSignedIn(true);
      setIsFirstTimeUser(false);
    } catch (error) {
      console.error('Wallet sign in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out method
  const signOut = async () => {
    setIsLoading(true);
    try {
      await clearAuthData();
      setUser(null);
      setIsSignedIn(false);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Skip auth method - allows users to use the app without signing in
  const skipAuth = async () => {
    try {
      await setHasSeenAuth();
      setIsFirstTimeUser(false);
    } catch (error) {
      console.error('Skip auth error:', error);
      throw error;
    }
  };

  // Update user profile
  const updateUserProfile = async (userData: Partial<User>) => {
    try {
      if (!user) throw new Error('User not authenticated');
      // In a real app, you would call an API to update the profile
      const updatedUser = { ...user, ...userData };
      await setAuthUser(updatedUser);
      setUser(updatedUser);
      return updatedUser;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  };

  // Create the context value object
  const authContextValue: AuthContextType = {
    user,
    isLoading,
    isSignedIn,
    isFirstTimeUser,
    signOut,
    skipAuth,
    signInWithWallet,
    updateUserProfile: async (userData: Partial<User>) => {
      const updated = await updateUserProfile(userData);
      return;
    },
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth loading component
export const AuthLoadingScreen: React.FC = () => {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
      <ActivityIndicator size="large" color={theme.colors.accent} />
    </View>
  );
};
