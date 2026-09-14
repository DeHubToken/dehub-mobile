import { apiClient } from '../libs';

/**
 * The email address this account can sign in with, if it has one.
 *
 * The address is returned masked (`ab***@example.com`) — the backend never
 * hands the full one back, which is the right call for a screen anyone can
 * shoulder-surf, and enough to answer "is there one, and which".
 *
 * Linking an address is web-only for now (it needs the code round trip), so on
 * mobile this is read-only: it tells the notification settings screen whether
 * email notifications can be delivered at all.
 */
export interface EmailLinkStatus {
  status: boolean;
  linked: boolean;
  email: string | null;
  /**
   * The address a notification email would go to, or null if there is none.
   * Not the same as `linked`, which only says the sign-in link was written by
   * the wallet-email flow — almost every address on the platform came from a
   * social login instead. Absent on older servers.
   */
  notifyEmail?: string | null;
  canLink: boolean;
  source: string | null;
}

export async function getEmailLinkStatus(): Promise<EmailLinkStatus | null> {
  try {
    return await apiClient.get<EmailLinkStatus>('/account/email-link/status', {
      isAuthRequired: true,
      quiet: true,
    });
  } catch {
    // A settings row that cannot answer the question just stays disabled;
    // there is nothing for the reader to do about a failed status read.
    return null;
  }
}

/**
 * The same question, asked in a way that also repairs the answer.
 *
 * A Google or email signup proves an address to Supabase, and nothing ever
 * copied it onto the DeHub account — which is the one place the notification
 * mailer looks. So `notifyEmail` came back null for nearly everyone and this
 * screen greyed the switch out, telling people to add the address they had
 * just signed in with. Logins record it now, but that only reaches someone the
 * next time they sign in; this is the same write, offered on demand.
 *
 * The Supabase session goes in the body. The server verifies it and writes the
 * address only when the session belongs to the identity this account is
 * already linked to — holding a session for somebody else attaches nothing.
 *
 * Falls back to the plain status read: the API deploys by hand and the app
 * ships when it ships, so there is a window where this route answers 404, and
 * a settings row must not go blank over it.
 */
export async function syncEmailLinkStatus(): Promise<EmailLinkStatus | null> {
  let supabaseAccessToken: string | null = null;
  try {
    const { getSupabaseAccessToken } = await import('./auth/supabaseAuth.service');
    supabaseAccessToken = await getSupabaseAccessToken();
  } catch {
    // No session to offer; the status read below still answers.
  }

  try {
    return await apiClient.post<EmailLinkStatus>(
      '/account/email-link/sync',
      supabaseAccessToken ? { supabaseAccessToken } : {},
      { isAuthRequired: true, quiet: true },
    );
  } catch {
    return getEmailLinkStatus();
  }
}
