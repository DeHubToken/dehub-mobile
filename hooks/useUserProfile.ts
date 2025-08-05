import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { User } from '../context/AuthContext';

export function useUserProfile() {
  const { user, updateUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProfile = async (userData: Partial<User>) => {
    setLoading(true);
    setError(null);
    try {
      await updateUserProfile(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    updateProfile,
    loading,
    error,
  };
}
