// Supabase Auth identity layer — mirrors cosmic-echo-hero's use of Supabase
// purely as an identity/OTP provider. The DeHub backend handshake (sign a
// message with the local wallet, POST /mobile/auth) stays unchanged; this
// module only establishes *who the person is* before a local wallet is
// provisioned/reused for them.
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "../supabase";
import { createLogger } from "../../libs/logger";

const log = createLogger("supabaseAuth");

/** OAuth redirect URI — must not depend on Constants.linkingUri being set. */
function getOAuthRedirectUri(): string {
  try {
    return Linking.createURL("auth-callback");
  } catch (e) {
    log.warn("getOAuthRedirectUri:createURL:error", e);
  }
  // Bare/dev-client fallback when expo-linking can't resolve hostUri
  // (Constants.linkingUri undefined → removeScheme(undefined).replace(...) crash).
  return "dehub://auth-callback";
}

export async function sendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) {
    log.warn("sendEmailOtp:error", error.message);
    throw new Error(error.message || "Failed to send code");
  }
}

/** Verifies the emailed code and returns the Supabase user id. */
export async function verifyEmailOtp(email: string, token: string): Promise<string> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  });
  if (error) {
    log.warn("verifyEmailOtp:error", error.message);
    throw new Error(error.message || "Invalid or expired code");
  }
  const userId = data?.user?.id;
  if (!userId) throw new Error("Sign-in failed. Please try again.");
  return userId;
}

// Phone OTP goes through request-phone-otp/verify-phone-otp instead of
// supabase.auth.signInWithOtp/verifyOtp — the native path needs Authentication
// -> Hooks -> Send SMS enabled on the Supabase dashboard to route delivery
// through CloudTalk, and that toggle isn't reachable on this project. The
// edge functions do the same job directly (see cosmic-echo-hero's
// supabase/functions/verify-phone-otp) and hand back a normal session.
export async function sendPhoneOtp(phone: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("request-phone-otp", {
    body: { phone: phone.trim() },
  });
  if (error) {
    log.warn("sendPhoneOtp:error", error.message);
    throw new Error(error.message || "Failed to send code");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
}

/** Verifies the texted code, establishes the session, and returns the Supabase user id. */
export async function verifyPhoneOtp(phone: string, token: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("verify-phone-otp", {
    body: { phone: phone.trim(), code: token.trim() },
  });
  if (error) {
    log.warn("verifyPhoneOtp:error", error.message);
    throw new Error(error.message || "Invalid or expired code");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  const session = data?.session;
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error("Sign-in failed. Please try again.");
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (sessionError || !sessionData?.user?.id) {
    log.warn("verifyPhoneOtp:setSession:error", sessionError?.message);
    throw new Error(sessionError?.message || "Could not establish session");
  }
  return sessionData.user.id;
}

/** Opens an OAuth browser flow for the given provider and returns the Supabase user id. */
async function signInWithOAuthProvider(
  provider: "google" | "apple",
  queryParams?: Record<string, string>
): Promise<string> {
  const redirectTo = getOAuthRedirectUri();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...(queryParams ? { queryParams } : {}),
    },
  });
  if (error || !data?.url) {
    log.warn(`signInWith:${provider}:start:error`, error?.message);
    throw new Error(error?.message || `Could not start ${provider} sign-in`);
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    throw new Error(`${provider} sign-in was cancelled`);
  }

  // Supabase returns tokens in the URL fragment (#access_token=...&refresh_token=...).
  const fragment = result.url.split("#")[1] || result.url.split("?")[1] || "";
  const params = new URLSearchParams(fragment);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) {
    throw new Error(`${provider} sign-in did not return a session`);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError || !sessionData?.user?.id) {
    log.warn(`signInWith:${provider}:setSession:error`, sessionError?.message);
    throw new Error(sessionError?.message || "Could not establish session");
  }
  return sessionData.user.id;
}

export async function signInWithGoogle(): Promise<string> {
  // The system browser keeps Google's cookies across app sign-outs, so
  // without this Google silently reuses the last-chosen account —
  // "signing in with a different account" would quietly re-authenticate
  // the previous identity instead of showing the account picker.
  return signInWithOAuthProvider("google", { prompt: "select_account" });
}

export async function signInWithApple(): Promise<string> {
  return signInWithOAuthProvider("apple");
}

/** The current Supabase session's access token, or null if not signed in. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch (e) {
    log.warn("getSupabaseAccessToken:error", e);
    return null;
  }
}

/** The current Supabase session's user id, or null if not signed in. */
export async function getSupabaseUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch (e) {
    log.warn("getSupabaseUserId:error", e);
    return null;
  }
}

/**
 * web3AuthMeta for the current Supabase user — the join key the DeHub
 * backend stores (as web3AuthMeta.verifierId) to recognize this identity on
 * a future login without a wallet signature. Must match dehubweb's
 * getSupabaseAuthMeta() (verifier: 'dehub-supabase') so an account linked
 * from one platform is recognized from the other.
 */
export async function getSupabaseAuthMeta(): Promise<Record<string, any> | undefined> {
  try {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    if (!u) return undefined;
    const md = (u.user_metadata ?? {}) as Record<string, unknown>;
    // Phone-login accounts get a synthetic @phone.dehub.internal email so
    // they can sign in via password (see cosmic-echo-hero's verify-phone-otp)
    // — never a real address, so it must never surface as "the user's email".
    const realEmail = u.email?.endsWith("@phone.dehub.internal") ? undefined : u.email;
    return {
      typeOfLogin: (u.app_metadata?.provider as string) || "email",
      verifier: "dehub-supabase",
      verifierId: u.id,
      email: realEmail ?? (md.email as string | undefined),
      name: (md.full_name as string) ?? (md.name as string) ?? undefined,
      profileImage: (md.avatar_url as string) ?? (md.picture as string) ?? undefined,
    };
  } catch (e) {
    log.warn("getSupabaseAuthMeta:error", e);
    return undefined;
  }
}
