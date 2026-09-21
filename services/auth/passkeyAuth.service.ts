/**
 * Passkey-only sign-in — the passkey IS the account.
 *
 * No email, phone or OAuth identity behind it: the device's passkey
 * (fingerprint / face / device PIN through Android Credential Manager or
 * iOS AuthenticationServices) is registered against the `passkey-auth` edge
 * function, which verifies the WebAuthn response and hands back a real
 * Supabase session the same way `telegram-auth` and `verify-phone-otp` do.
 * From `setSession` on, this is any other sign-in: the caller gets a
 * Supabase user id and runs `provisionAndSignIn` with it.
 *
 * The relying party is dehub.io, so a passkey made here answers on the
 * website too (and the other way round) wherever the platform syncs it.
 * The server has to know the platform because a native request carries no
 * browser origin — Android presents its signing-certificate hash instead.
 */
import { Platform } from "react-native";
import { Passkey } from "react-native-passkey";
import { supabase } from "../supabase";
import { createLogger } from "../../libs/logger";

const log = createLogger("passkey-auth");

/** A server-side refusal with a machine-readable reason. */
export class PasskeyLoginError extends Error {
  code: string | null;
  constructor(message: string, code?: string | null) {
    super(message);
    this.name = "PasskeyLoginError";
    this.code = code ?? null;
  }
}

/** The person dismissed the OS passkey sheet. Not a failure. */
export class PasskeyCancelledError extends Error {
  constructor() {
    super("Passkey prompt cancelled");
    this.name = "PasskeyCancelledError";
  }
}

export function isPasskeyLoginAvailable(): boolean {
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("passkey-auth", {
    body: { ...body, platform: Platform.OS },
  });
  if (error) {
    log.warn("invoke:error", error.message);
    throw new PasskeyLoginError(error.message || "Passkey sign-in failed. Please try again.");
  }
  if (data?.error) {
    log.warn("server:error", data.error, data.code);
    throw new PasskeyLoginError(String(data.error), data.code ? String(data.code) : null);
  }
  return data as T;
}

/** react-native-passkey reports a dismissed sheet as an error with this code. */
function isCancel(e: unknown): boolean {
  const err = e as { error?: string; message?: string } | null;
  const text = `${err?.error ?? ""} ${err?.message ?? ""}`;
  return /UserCancelled|cancel/i.test(text);
}

async function adoptSession(session: { access_token?: string; refresh_token?: string } | undefined): Promise<string> {
  if (!session?.access_token || !session?.refresh_token) {
    log.warn("missing-session");
    throw new Error("Passkey sign-in failed. Please try again.");
  }
  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  const userId = data?.session?.user?.id;
  if (error || !userId) {
    log.warn("setSession:error", error?.message);
    throw new Error(error?.message || "Passkey sign-in failed. Please try again.");
  }
  return userId;
}

/** Create a brand-new account from a fresh passkey. Resolves the Supabase user id. */
export async function signUpWithPasskey(): Promise<string> {
  const deviceLabel = Platform.OS === "ios" ? "iPhone" : "Android device";
  const { options } = await call<{ options: Parameters<typeof Passkey.create>[0] }>({
    action: "register-options",
    deviceLabel,
    attach: false,
  });
  let response;
  try {
    response = await Passkey.create(options);
  } catch (e) {
    if (isCancel(e)) throw new PasskeyCancelledError();
    log.warn("create:error", e);
    throw new Error("Could not create a passkey on this device.");
  }
  const result = await call<{ session?: { access_token?: string; refresh_token?: string } }>({
    action: "register-verify",
    response,
    deviceLabel,
  });
  return adoptSession(result.session);
}

/**
 * Sign in with an existing DeHub passkey. Throws `PasskeyLoginError` with
 * code `UNKNOWN_CREDENTIAL` when the chosen passkey has no account, which
 * the screen turns into an offer to create one.
 */
export async function signInWithPasskey(): Promise<string> {
  const { options } = await call<{ options: Parameters<typeof Passkey.get>[0] }>({ action: "login-options" });
  let response;
  try {
    response = await Passkey.get(options);
  } catch (e) {
    if (isCancel(e)) throw new PasskeyCancelledError();
    log.warn("get:error", e);
    throw new Error("Could not use a passkey on this device.");
  }
  const result = await call<{ session?: { access_token?: string; refresh_token?: string } }>({
    action: "login-verify",
    response,
  });
  return adoptSession(result.session);
}
