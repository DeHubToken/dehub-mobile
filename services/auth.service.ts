import { apiClient } from "../libs";
import { setAuthToken, setAuthUser, clearAuthData, setRefreshToken, setTokenExpiresAt, getRefreshToken } from "../libs/auth.utils";
import {
  getOrCreateAuthSignature,
  buildAuthRequestPayload,
} from "../libs/web3.auth.sign";
import { User } from "../context/AuthContext";

// Interface for authentication responses
interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
  needsUsername?: boolean;
}

/**
 * Thrown when the backend has no wallet linked to this Supabase identity yet
 * (or the link is ambiguous). The caller must fall back to the signature
 * flow, which is what creates the link — a normal state for a first-ever
 * login on this identity, not an error to surface to the user.
 */
export class WalletNotLinkedError extends Error {
  constructor(message = "No wallet is linked to this login yet.") {
    super(message);
    this.name = "WalletNotLinkedError";
  }
}

/**
 * Thrown when the backend already has MORE THAN ONE wallet linked to this
 * Supabase identity and refuses to pick one automatically. This is a data
 * state, not a "first login" state — it must never be handled by silently
 * provisioning and linking yet another wallet, since that would add a third
 * conflicting link and make the ambiguity permanently worse. The only
 * correct recovery is the user signing in with the specific wallet they mean
 * to use (Import Wallet), which is unambiguous proof of which account is
 * theirs.
 */
export class WalletLinkAmbiguousError extends Error {
  constructor(message = "This login is linked to more than one wallet. Please sign in with your wallet.") {
    super(message);
    this.name = "WalletLinkAmbiguousError";
  }
}

export const AuthService = {
  /**
   * Authenticate user with a wallet address
   * */
  async signInWithWallet(
    address: string,
    chainId: number,
    opts?: { privateKey?: string; storePrivateKey?: boolean; web3AuthMeta?: Record<string, any> }
  ): Promise<AuthResponse> {
    try {
      const sigMeta = await getOrCreateAuthSignature(
        address,
        undefined,
        chainId
      );
      const authPayload = buildAuthRequestPayload(address, sigMeta);
      const body: Record<string, any> = { chainId, ...authPayload };
      if (opts?.privateKey && typeof opts.privateKey === "string") {
        body.privateKey = opts.privateKey;
        body.storePrivateKey = true;
      }
      if (opts?.web3AuthMeta && typeof opts.web3AuthMeta === "object") {
        body.web3AuthMeta = opts.web3AuthMeta;
        // Prove ownership of the Supabase identity named in web3AuthMeta.
        // The backend only stores an identity link it can verify (token
        // subject must equal verifierId) and then makes it EXCLUSIVE across
        // accounts; without the token it drops any link that would collide
        // with another account — see backend vetSupabaseIdentityLink.
        try {
          const { getSupabaseAccessToken } = await import("./auth/supabaseAuth.service");
          const supabaseToken = await getSupabaseAccessToken();
          if (supabaseToken) body.supabaseAccessToken = supabaseToken;
        } catch {}
      }
      // if (typeof opts?.storePrivateKey === "boolean") {
      //   body.storePrivateKey = opts.storePrivateKey;
      // }
      const response = await apiClient.post<AuthResponse>(
        "/mobile/auth",
        body,
        { isAuthRequired: false }
      );
      const augmentedUser = { ...response.user, authSignature: sigMeta } as any;
      // Use isNewAccount from backend response to determine if username setup is needed
      const needsUsername = !!(response as any)?.result?.isNewAccount;
      const storeTokens = async () => {
        await setAuthToken(response.token);
        if (response.refreshToken) await setRefreshToken(response.refreshToken);
        if (response.expiresIn) await setTokenExpiresAt(Date.now() + response.expiresIn * 1000);
      };
      if (needsUsername) {
        // Store token immediately so username update calls are authenticated
        await storeTokens();
        return { user: augmentedUser, token: response.token, refreshToken: response.refreshToken, expiresIn: response.expiresIn, needsUsername };
      }
      await storeTokens();
      return {
        user: augmentedUser,
        token: response.token,
        refreshToken: response.refreshToken,
        expiresIn: response.expiresIn,
        needsUsername: false,
      };
    } catch (error) {
      console.error("Wallet sign in error:", error);
      throw error;
    }
  },

  /**
   * Exchange a Supabase access token (Google/email sign-in) for a DeHub
   * session, with no wallet signature — used to recognize an account this
   * Supabase identity is already linked to (established previously by
   * signInWithWallet's web3AuthMeta), instead of always minting a new local
   * wallet on first mobile login.
   *
   * Mirrors dehubweb's authenticateWithSupabaseSession: does not create
   * accounts or link wallets — throws WalletNotLinkedError (backend 409) when
   * this identity has no link yet, so the caller can fall back to the
   * signature flow to establish one.
   */
  async authenticateWithSupabaseSession(
    supabaseAccessToken: string
  ): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<any>(
        "/web/auth/supabase",
        {},
        {
          isAuthRequired: false,
          // Sent as a header rather than in the body so it does not land in
          // request logs that record bodies.
          headers: { Authorization: `Bearer ${supabaseAccessToken}` },
          // Failures here are normal control flow (409 not-linked on every
          // first login, ambiguous-link on polluted identities) and are fully
          // handled below — mirrors the web client, which logs these as a
          // warn and falls back to signing instead of surfacing an error.
          quiet: true,
        }
      );
      const needsUsername = !!response?.result?.isNewAccount;
      await setAuthToken(response.token);
      if (response.refreshToken) await setRefreshToken(response.refreshToken);
      if (response.expiresIn) await setTokenExpiresAt(Date.now() + response.expiresIn * 1000);
      return {
        user: response.user,
        token: response.token,
        refreshToken: response.refreshToken,
        expiresIn: response.expiresIn,
        needsUsername,
      };
    } catch (error: any) {
      const isAmbiguous =
        error?.code === "WALLET_LINK_AMBIGUOUS" ||
        /more than one wallet/i.test(error?.message || "");
      if (isAmbiguous) {
        throw new WalletLinkAmbiguousError(error?.message);
      }
      if (error?.status === 409 || error?.code === "WALLET_NOT_LINKED") {
        throw new WalletNotLinkedError(error?.message);
      }
      console.error("Supabase session auth error:", error);
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
      // Revoke the refresh token on the backend (best-effort)
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        try {
          await apiClient.post('/auth/logout', { refreshToken });
        } catch {}
      }

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
   * Log out from all devices — revokes all refresh tokens for the user
   */
  async logoutAllDevices(): Promise<void> {
    try {
      await apiClient.post('/auth/logout-all', {});
    } catch (error) {
      console.error("Logout all devices error:", error);
    }
    await clearAuthData();
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
