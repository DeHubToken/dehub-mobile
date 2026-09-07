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
