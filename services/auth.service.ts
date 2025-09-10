import { apiClient } from "../libs";
import { setAuthToken, setAuthUser, clearAuthData } from "../libs/authUtils";
import {
  getOrCreateAuthSignature,
  buildAuthRequestPayload,
} from "../libs/web3.auth.sign";
import { User } from "../context/AuthContext";

// Interface for authentication responses
interface AuthResponse {
  user: User;
  token: string;
  needsUsername?: boolean;
}

export const AuthService = {
  /**
   * Authenticate user with a wallet address
   * */
  async signInWithWallet(
    address: string,
    chainId: number
  ): Promise<AuthResponse> {
    try {
      const sigMeta = await getOrCreateAuthSignature(address);
      const authPayload = buildAuthRequestPayload(address, sigMeta);
      const response = await apiClient.post<AuthResponse>(
        "/mobile/auth",
        { chainId, ...authPayload },
        { isAuthRequired: false }
      );
      const augmentedUser = { ...response.user, authSignature: sigMeta } as any;
      const needsUsername =
        !augmentedUser.username || augmentedUser.username.trim().length === 0;
      if (needsUsername) {
        // Store token immediately so username update calls are authenticated
        await setAuthToken(response.token);
        return { user: augmentedUser, token: response.token, needsUsername };
      }
      await setAuthToken(response.token);
      await setAuthUser(augmentedUser);
      return {
        user: augmentedUser,
        token: response.token,
        needsUsername: false,
      };
    } catch (error) {
      console.error("Wallet sign in error:", error);
      throw error;
    }
  },

  /**
   * Check username availability (assumed endpoint /check-username?username=)
   * Adjust path if backend differs.
   */
  async checkUsernameAvailability(
    rawUsername: string
  ): Promise<{ available: boolean; message?: string }> {
    if (!rawUsername || typeof rawUsername !== "string")
      return { available: false, message: "Username required" };
    const username = rawUsername.trim();
    if (username.length < 3 || username.length > 30)
      return { available: false, message: "3-30 chars required" };
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return { available: false, message: "Only letters, numbers, _" };
    try {
      const res = await apiClient.get<any>(
        `/username/check?username=${encodeURIComponent(username)}`,
        { isAuthRequired: false }
      );
      // Expected shape: { status, available, username }
      if (res?.status === true && typeof res.available === "boolean") {
        return {
          available: res.available,
          message: res.available ? "Available" : "Taken",
        };
      }
      return { available: false, message: res?.message || "Unavailable" };
    } catch (e: any) {
      console.warn(
        "[AuthService] checkUsernameAvailability error",
        e?.message || e
      );
      return { available: false, message: "Lookup failed" };
    }
  },

  /**
   * Update username/profile via FormData (endpoint assumed /update_profile)
   * Uses provided token (not yet persisted) to authorize.
   */
  async updateUsername(username: string, token: string): Promise<User> {
    throw new Error("updateUsername deprecated; use updateProfile");
  },

  async updateProfile(data: Record<string, any>): Promise<Partial<User>> {
    const formData = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, v as any);
    });
    const body = await apiClient.post<any>("/update_profile", formData, {
      isAuthRequired: true,
    });
    if (body?.error)
      throw new Error(
        body?.error_msg || body?.message || "Profile update failed"
      );
    return data as Partial<User>;
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
      console.error("Sign out error:", error);
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
        "/auth/reset-password",
        { email },
        { isAuthRequired: false }
      );
    } catch (error) {
      console.error("Password reset error:", error);
      throw error;
    }
  },

  /**
   * Get the current user profile
   * @returns Promise with user data
   */
  async getCurrentUser(): Promise<User> {
    return await apiClient.get<User>("/auth/me");
  },

  /**
   * Update the user's profile
   * @param userData Partial user data to update
   * @returns Promise with updated user data
   */
  // (JSON patch updateProfile removed in favor of FormData version above)
};
