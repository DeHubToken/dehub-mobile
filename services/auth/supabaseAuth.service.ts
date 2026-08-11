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

/**
 * Phone login step 1 — send a 6-digit code.
 *
 * Not supabase.auth.signInWithOtp({ phone }), which is what this used to call.
 * That path needs Supabase's native Phone provider, and the provider is off
 * because routing it to CloudTalk requires Authentication -> Hooks -> Send SMS,
 * a toggle this project's management surface doesn't expose. GoTrue rejects the
 * phone grant outright while it is off, so every mobile phone sign-in failed
 * with "Unsupported phone provider" no matter what the SMS side was doing.
 *
 * The web app hit the same wall and answered it with the request-phone-otp /
 * verify-phone-otp edge functions, which generate, store and check the code
 * themselves and send it through CloudTalk directly. Mobile now uses the same
 * pair, so both clients share one implementation, one rate limit and one
 * message template.
 *
 * `phone` must be E.164 — the function rejects anything else. PhoneLoginFlow
 * enforces the identical regex before we get here.
 */
export async function sendPhoneOtp(phone: string): Promise<void> {
  // These functions answer 200 with { error } rather than a non-2xx, because
  // functions.invoke() only surfaces a body on 2xx. Same check as
  // fetchAgoraToken: the transport error first, then the payload error.
  const { data, error } = await supabase.functions.invoke("request-phone-otp", {
    body: { phone: phone.trim() },
  });
  if (error) {
    log.warn("sendPhoneOtp:invoke:error", error.message);
    throw new Error(error.message || "Failed to send code");
  }
  if (data?.error) {
    log.warn("sendPhoneOtp:error", data.error);
    throw new Error(data.error);
  }
}

/**
 * Phone login step 2 — verify the code and return the Supabase user id.
 *
 * verify-phone-otp hands back a real access/refresh pair rather than a user id
 * alone, so the session has to be installed on this client before the id means
 * anything to the callers that follow (wallet provisioning reads the signed-in
 * user). setSession also persists it through AsyncStorage, which is what keeps
 * the user signed in across app launches.
 */
export async function verifyPhoneOtp(phone: string, token: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("verify-phone-otp", {
    body: { phone: phone.trim(), code: token.trim() },
  });
  if (error) {
    log.warn("verifyPhoneOtp:invoke:error", error.message);
    throw new Error(error.message || "Invalid or expired code");
  }
  if (data?.error) {
    log.warn("verifyPhoneOtp:error", data.error);
    throw new Error(data.error);
  }

  const session = data?.session;
  if (!session?.access_token || !session?.refresh_token) {
    log.warn("verifyPhoneOtp:missing-session");
    throw new Error("Sign-in failed. Please try again.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  const userId = sessionData?.session?.user?.id;
  if (sessionError || !userId) {
    log.warn("verifyPhoneOtp:setSession:error", sessionError?.message);
    throw new Error(sessionError?.message || "Sign-in failed. Please try again.");
  }
  return userId;
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
    // Phone-login accounts get a synthetic @phone.dehub.internal email so they
    // can sign in via password (see cosmic-echo-hero's verify-phone-otp) — never
    // a real address, so it must never surface as "the user's email".
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
