/**
 * The support desk endpoints.
 *
 * **The prefix.** `env.API_URL` already ends in `/api`, so paths here are
 * written without it. Web's twin writes the same endpoints *with* `/api` — a
 * path copied across verbatim becomes `/api/api/support/tickets` and 404s.
 *
 * **The counts.** The server sends `openCount`/`closedCount` so no client has
 * to know which statuses mean "still waiting on a human", but they are derived
 * locally when absent — an installed app has to keep working against an API
 * older than it is.
 */
import {
  createSupportTicket,
  getMySupportTickets,
  isTicketOpen,
} from '../../services/support.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

describe('services/support.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never writes the /api prefix the base URL already carries', async () => {
    mockGet.mockResolvedValue({ result: { tickets: [] } });
    await getMySupportTickets();
    expect(mockGet.mock.calls[0][0]).toBe('/support/tickets');
  });

  it('reads tickets as the signed-in user and keeps the server counts', async () => {
    mockGet.mockResolvedValue({
      result: { tickets: [{ ref: 'DH-A', status: 'open' }], openCount: 1, closedCount: 0 },
    });

    const result = await getMySupportTickets();

    expect(mockGet.mock.calls[0][1]).toMatchObject({ isAuthRequired: true });
    expect(result.openCount).toBe(1);
    expect(result.tickets).toHaveLength(1);
  });

  it('derives the counts when an older API omits them', async () => {
    mockGet.mockResolvedValue({
      result: {
        tickets: [
          { ref: 'DH-A', status: 'open' },
          { ref: 'DH-B', status: 'in_progress' },
          { ref: 'DH-C', status: 'closed' },
        ],
      },
    });

    const result = await getMySupportTickets();

    expect(result.openCount).toBe(2);
    expect(result.closedCount).toBe(1);
  });

  it('survives a response carrying no tickets array at all', async () => {
    mockGet.mockResolvedValue({ result: {} });
    const result = await getMySupportTickets();
    expect(result.tickets).toEqual([]);
    expect(result.openCount).toBe(0);
  });

  it('files a ticket and returns the reference', async () => {
    mockPost.mockResolvedValue({ result: { ref: 'DH-K3M7QP', status: 'open', emailed: true } });

    const result = await createSupportTicket({
      category: 'bug',
      severity: 'normal',
      subject: 'Uploads stick on pending',
      description: 'Every upload sits on pending and never publishes.',
    });

    expect(mockPost.mock.calls[0][0]).toBe('/support/tickets');
    expect(mockPost.mock.calls[0][1]).toMatchObject({ subject: 'Uploads stick on pending' });
    expect(mockPost.mock.calls[0][2]).toMatchObject({ isAuthRequired: true });
    expect(result.ref).toBe('DH-K3M7QP');
  });

  it('lets the server refusal reach the caller unchanged', async () => {
    mockPost.mockRejectedValue(new Error('The description is too thin to act on.'));

    await expect(
      createSupportTicket({ category: 'bug', severity: 'low', subject: 'x', description: 'y' }),
    ).rejects.toThrow('The description is too thin to act on.');
  });

  it('treats only open and in_progress as still waiting on a human', () => {
    expect(isTicketOpen('open')).toBe(true);
    expect(isTicketOpen('in_progress')).toBe(true);
    expect(isTicketOpen('resolved')).toBe(false);
    expect(isTicketOpen('closed')).toBe(false);
  });
});
