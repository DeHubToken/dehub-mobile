export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  creator_wallet_address: string;
  is_private: boolean;
  member_count: number;
  rules: unknown[];
  ticker_symbol: string | null;
  ticker_contract_address: string | null;
  ticker_chain_id: string | null;
  ticker_pair_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  wallet_address: string;
  role: string;
  status: string;
  joined_at: string;
}

export interface PinnedCommunity {
  id: string;
  wallet_address: string;
  community_id: string;
  display_order: number;
  created_at: string;
  communities?: Community;
}

export type UserCommunityRow = CommunityMember & { communities: Community };
