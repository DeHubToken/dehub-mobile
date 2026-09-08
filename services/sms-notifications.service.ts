import { apiClient } from '../libs';

/**
 * Text notifications — credit, number and prices
 * ==============================================
 * Client for `/notification/sms/*` on the DeHub API.
 *
 * This is the only notification channel that costs money, so it is the only one
 * with an API of its own. The switch itself is not here: turning texts on and
 * off is `notificationPreferences.smsEnabled`, written through the same
 * `updateNotificationPreferences` call every other toggle on the notification
 * settings screen uses. What lives here is the part with a price on it — the
 * balance, the deposit that fills it, and the number the messages go to.
 *
 * Three things about the flow that are not obvious from the call sites:
 *
 * - **The client never prices anything and never credits anything.** `status()`
 *   says what a message costs and where to send DHB; the wallet sends it; and
 *   `claimDeposit()` hands the server a hash it reads off the chain itself.
 *   Nothing the client claims about the amount is trusted.
 * - **`claimDeposit` is safe to repeat, and must be.** It answers
 *   `pending: true` while the receipt catches up, and a hash that has already
 *   been credited is credited exactly once however many times it is sent. So a
 *   dropped response is a retry, never a second payment.
 * - **Verifying the number costs one message.** Deliberately — it proves the
 *   number is reachable on the same route the notifications will take, before
 *   the reader is promised anything.
 *
 * Mirrors web's `src/lib/api/dehub/sms-notifications.ts`, but the paths differ
 * by an `/api` prefix: `env.API_URL` already ends in `/api`, so endpoints here
 * are written without it. Copying a path across from web verbatim gives
 * `/api/api/…`, which 404s on every call.
 */

export interface SmsPriceBand {
  band: string;
  priceDhb: number;
  priceUsd: number;
}

export interface SmsNotificationStatus {
  /** False when the platform has no gateway or treasury — off for everybody. */
  available: boolean;
  /** True once cumulative deposits have cleared the minimum. */
  unlocked: boolean;
  balanceDhb: number;
  balanceUsd: number;
  /** Masked. The full number is never returned, not even to its owner. */
  phone: string | null;
  phoneVerified: boolean;
  /** A verification is in flight for this number, masked. */
  pendingPhone: string | null;
  minDepositDhb: number;
  minDepositUsd: number;
  /** Where to send DHB. Null when the platform has no treasury configured. */
  depositAddress: string | null;
  chains: { chainId: number; tokenAddress: string }[];
  /** Price of one text to the verified number, once there is one. */
  priceDhb: number | null;
  priceUsd: number | null;
  prices: SmsPriceBand[];
  /**
   * Values the "what to text" preference may hold, in display order,
   * starting with 'all'. Served rather than hardcoded so this client can
   * never offer a choice the server would refuse to honour.
   */
  scopes: string[];
  /** Display only. Every figure above is denominated in DHB. */
  dhbUsdPeg: number;
  messagesSent: number;
  messagesRemaining: number | null;
}

export interface SmsQuote {
  band: string;
  priceDhb: number;
  priceUsd: number;
  /** True when we cannot deliver to that country at any price. */
  blocked: boolean;
}

export interface SmsDepositResult {
  credited: boolean;
  /** The chain has not caught up. The hash is still good — ask again. */
  pending?: true;
  amountDhb?: number;
  status: SmsNotificationStatus;
}

/** Every endpoint answers `{ status, result }`; this unwraps it. */
interface Envelope<T> {
  status: boolean;
  result: T;
}

export const smsNotificationsService = {
  /**
   * Read the whole channel state.
   *
   * Returns null rather than throwing on an older server that has no such
   * route: a settings row that cannot answer the question stays disabled, and
   * there is nothing the reader could do about a failed status read.
   */
  async status(): Promise<SmsNotificationStatus | null> {
    try {
      const res = await apiClient.get<Envelope<SmsNotificationStatus>>(
        '/notification/sms/status',
        { isAuthRequired: true, quiet: true },
      );
      return res.result;
    } catch {
      return null;
    }
  },

  /** What a text to this number would cost, before anyone commits to it. */
  async quote(phone: string): Promise<SmsQuote> {
    const res = await apiClient.fetch<Envelope<SmsQuote>>('/notification/sms/quote', {
      isAuthRequired: true,
      params: { phone },
    });
    return res.result;
  },

  /**
   * Credit a DHB transfer against the balance.
   *
   * Idempotent on the hash. Callers keep asking while `pending` is true rather
   * than sending a second transfer.
   */
  async claimDeposit(txHash: string, chainId: number): Promise<SmsDepositResult> {
    const res = await apiClient.post<Envelope<SmsDepositResult>>('/notification/sms/deposit', {
      txHash,
      chainId,
    });
    return res.result;
  },

  /** Text a six-digit code to a number. Costs one message. */
  async requestPhoneCode(phone: string): Promise<{ sent: true; priceDhb: number }> {
    const res = await apiClient.post<Envelope<{ sent: true; priceDhb: number }>>(
      '/notification/sms/phone/request',
      { phone },
    );
    return res.result;
  },

  async verifyPhoneCode(code: string): Promise<SmsNotificationStatus> {
    const res = await apiClient.post<Envelope<SmsNotificationStatus>>(
      '/notification/sms/phone/verify',
      { code },
    );
    return res.result;
  },

  /** Forget the number. Turns the switch off with it; credit is untouched. */
  async removePhone(): Promise<SmsNotificationStatus> {
    const res = await apiClient.delete<Envelope<SmsNotificationStatus>>(
      '/notification/sms/phone',
    );
    return res.result;
  },
};
