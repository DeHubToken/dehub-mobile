/**
 * Top builders on the Requests board.
 *
 * Points:
 *   +10 for each of your requests that shipped
 *   +1  for each upvote your requests received
 *   +2  for each comment on someone else's request (counts up to 20 comments)
 *
 * Team accounts are left out so the board shows the community.
 * "This month" counts ships by the day they shipped, upvotes on requests
 * posted this month, and comments written this month.
 */

export const SHIPPED_POINTS = 10;
export const VOTE_POINTS = 1;
export const COMMENT_POINTS = 2;
export const COMMENT_CAP = 20;

/** Team accounts that never appear on the board. */
export const TEAM_USERNAMES = new Set(['maldoteth', 'assistant']);
export const TEAM_WALLETS = new Set(['0x9324840523a5d17dd12a2f11a9472e5a199c1937']);

export interface BuilderRequestRow {
  id: string;
  author_wallet_address: string;
  author_username: string | null;
  author_avatar: string | null;
  status: string;
  vote_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface BuilderCommentRow {
  wallet_address: string;
  username: string | null;
  feature_request_id: string;
  created_at: string;
}

export interface TopBuilder {
  wallet: string;
  username: string | null;
  avatar: string | null;
  shipped: number;
  votes: number;
  comments: number;
  shippedPoints: number;
  votePoints: number;
  commentPoints: number;
  points: number;
  lastShippedAt: string | null;
}

export type BuilderPeriod = 'month' | 'all';

const SHIPPED = new Set(['shipped', 'completed']);

export function isTeamAccount(wallet: string | null | undefined, username: string | null | undefined): boolean {
  if (wallet && TEAM_WALLETS.has(wallet.toLowerCase())) return true;
  if (username && TEAM_USERNAMES.has(username.toLowerCase())) return true;
  return false;
}

export function periodStart(period: BuilderPeriod, now: Date = new Date()): number {
  if (period === 'all') return 0;
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export function rankBuilders(
  requests: BuilderRequestRow[],
  comments: BuilderCommentRow[],
  since: number,
): TopBuilder[] {
  const map = new Map<string, TopBuilder>();
  const get = (wallet: string, username: string | null, avatar: string | null) => {
    const key = wallet.toLowerCase();
    let b = map.get(key);
    if (!b) {
      b = {
        wallet: key, username, avatar,
        shipped: 0, votes: 0, comments: 0,
        shippedPoints: 0, votePoints: 0, commentPoints: 0, points: 0,
        lastShippedAt: null,
      };
      map.set(key, b);
    }
    if (!b.username && username) b.username = username;
    if (!b.avatar && avatar) b.avatar = avatar;
    return b;
  };

  const authorOf = new Map<string, string>();
  for (const r of requests) {
    if (!r.author_wallet_address) continue;
    authorOf.set(r.id, r.author_wallet_address.toLowerCase());
    if (isTeamAccount(r.author_wallet_address, r.author_username)) continue;
    const b = get(r.author_wallet_address, r.author_username, r.author_avatar);
    if (SHIPPED.has(r.status) && Date.parse(r.updated_at) >= since) {
      b.shipped += 1;
      if (!b.lastShippedAt || r.updated_at > b.lastShippedAt) b.lastShippedAt = r.updated_at;
    }
    if (Date.parse(r.created_at) >= since) b.votes += Math.max(0, r.vote_count ?? 0);
  }

  for (const c of comments) {
    if (!c.wallet_address || isTeamAccount(c.wallet_address, c.username)) continue;
    if (Date.parse(c.created_at) < since) continue;
    const author = authorOf.get(c.feature_request_id);
    if (!author || author === c.wallet_address.toLowerCase()) continue;
    get(c.wallet_address, c.username, null).comments += 1;
  }

  const out: TopBuilder[] = [];
  for (const b of map.values()) {
    b.shippedPoints = b.shipped * SHIPPED_POINTS;
    b.votePoints = b.votes * VOTE_POINTS;
    b.commentPoints = Math.min(b.comments, COMMENT_CAP) * COMMENT_POINTS;
    b.points = b.shippedPoints + b.votePoints + b.commentPoints;
    if (b.points > 0) out.push(b);
  }
  out.sort((a, b) =>
    b.points - a.points
    || (b.lastShippedAt ?? '').localeCompare(a.lastShippedAt ?? '')
    || (a.username ?? a.wallet).localeCompare(b.username ?? b.wallet));
  return out;
}
