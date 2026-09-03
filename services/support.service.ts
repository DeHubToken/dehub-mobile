import { apiClient } from '../libs/api.client';

/**
 * The support desk, talked to directly.
 *
 * The assistant can file and read tickets too, but only by spending a paid
 * model round trip on it. These are the plain endpoints behind the same desk,
 * so the Support button costs nothing and reports the server's own words rather
 * than a paraphrase of them.
 */

export const SUPPORT_CATEGORIES = [
  'account_access',
  'wallet_or_transactions',
  'posting_or_uploads',
  'payments_or_subscriptions',
  'live_streaming',
  'content_or_moderation',
  'bug',
  'feature_request',
  'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_SEVERITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type SupportSeverity = (typeof SUPPORT_SEVERITIES)[number];

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

/** Still waiting on a human. Mirrors the server's `openStatuses`. */
export const OPEN_SUPPORT_STATUSES: SupportStatus[] = ['open', 'in_progress'];

export function isTicketOpen(status: string): boolean {
  return OPEN_SUPPORT_STATUSES.includes(status as SupportStatus);
}

export interface SupportTicket {
  ref: string;
  subject: string;
  category: SupportCategory;
  severity: SupportSeverity;
  status: SupportStatus;
  /** Written for the reporter to read. Internal admin notes are never sent. */
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketList {
  tickets: SupportTicket[];
  openCount: number;
  closedCount: number;
}

export interface FiledTicket {
  ref: string;
  status: string;
  emailed: boolean;
  /** Set when this was a re-tell of a ticket that is already open. */
  duplicateOf?: string;
}

export async function getMySupportTickets(limit = 25): Promise<SupportTicketList> {
  const response = await apiClient.get<any>('/support/tickets', {
    params: { limit },
    isAuthRequired: true,
  });
  const result = response?.result ?? response ?? {};
  const tickets: SupportTicket[] = Array.isArray(result.tickets) ? result.tickets : [];
  // Counts are computed server-side, but derive them here when they are absent
  // so an installed app still renders the list against an older API.
  const openCount =
    typeof result.openCount === 'number'
      ? result.openCount
      : tickets.filter((t) => isTicketOpen(t.status)).length;
  return { tickets, openCount, closedCount: result.closedCount ?? tickets.length - openCount };
}

export async function createSupportTicket(input: {
  category: SupportCategory;
  severity: SupportSeverity;
  subject: string;
  description: string;
  stepsToReproduce?: string;
  relatedUrl?: string;
  contactEmail?: string;
}): Promise<FiledTicket> {
  const response = await apiClient.post<any>('/support/tickets', { ...input }, {
    isAuthRequired: true,
  });
  return response?.result ?? response;
}
