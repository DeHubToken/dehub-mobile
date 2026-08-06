export type CommunityRole = "owner" | "admin" | "member";
export type CommunityMemberStatus = "active" | "pending" | "banned";

/**
 * Per-admin rights, and the group-wide member defaults. Both maps are resolved
 * by libs/community-permissions, which mirrors public.community_permission() in
 * the database — the server is the authority, this is only so the UI can hide
 * controls it would refuse.
 */
export type AdminRight =
  | "change_info"
  | "delete_messages"
  | "restrict_members"
  | "invite_users"
  | "pin_messages"
  | "manage_events"
  | "add_admins"
  | "remain_anonymous";

export type MemberRight =
  | "send_messages"
  | "send_media"
  | "embed_links"
  | "add_members"
  | "create_events"
  | "pin_messages"
  | "change_info";

export type CommunityRight = AdminRight | MemberRight;

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
  /** 0 = off. Owners and admins are exempt. */
  slow_mode_seconds: number;
  default_permissions: Partial<Record<MemberRight, boolean>> | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  wallet_address: string;
  role: CommunityRole;
  status: CommunityMemberStatus;
  joined_at: string;
  /** Per-admin rights. Empty for owners (who hold everything) and for members. */
  permissions: Partial<Record<AdminRight, boolean>> | null;
  custom_title: string | null;
  muted_until: string | null;
  ban_reason: string | null;
  banned_until: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  promoted_by: string | null;
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

export interface CommunityChatMessage {
  id: string;
  community_id: string;
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  content: string;
  message_type: string;
  image_url: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  pinned_at: string | null;
  pinned_by: string | null;
  edited_at: string | null;
  reply_to?: {
    id: string;
    content: string;
    sender_name: string;
  };
}

export interface CommunityInviteLink {
  id: string;
  community_id: string;
  code: string;
  name: string | null;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  requires_approval: boolean;
  revoked_at: string | null;
  created_at: string;
}

export interface CommunityAdminLogEntry {
  id: string;
  community_id: string;
  actor_wallet_address: string;
  action: string;
  target_wallet_address: string | null;
  target_message_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface CommunityInvitePreview {
  is_valid: boolean;
  reason: string | null;
  requires_approval?: boolean;
  community_id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  member_count?: number;
}

export interface CommunitySettingsPatch {
  name?: string;
  description?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  is_private?: boolean;
  rules?: string[];
  slow_mode_seconds?: number;
  default_permissions?: Partial<Record<MemberRight, boolean>>;
  ticker_symbol?: string | null;
  ticker_contract_address?: string | null;
  ticker_chain_id?: string | null;
  ticker_pair_address?: string | null;
}
