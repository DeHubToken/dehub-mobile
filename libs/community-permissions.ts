/**
 * Community permission resolution
 * ===============================
 * Native mirror of web's `resolvePermission` / `useCommunityAbilities`, which in
 * turn mirror `public.community_permission()` in the database. Kept in the same
 * order as the SQL so the three stay comparable when any one of them changes.
 *
 * The database is the authority — every privileged write goes through a
 * SECURITY DEFINER RPC that re-checks. This exists so the UI does not offer a
 * control the server would refuse.
 */
import type {
  AdminRight,
  Community,
  CommunityMember,
  CommunityRight,
  MemberRight,
} from "../types/community";

export const ADMIN_RIGHTS: { key: AdminRight; labelKey: string; hintKey: string }[] = [
  { key: "change_info", labelKey: "changeInfo", hintKey: "changeInfoHint" },
  { key: "delete_messages", labelKey: "deleteMessages", hintKey: "deleteMessagesHint" },
  { key: "restrict_members", labelKey: "restrictMembers", hintKey: "restrictMembersHint" },
  { key: "invite_users", labelKey: "inviteUsers", hintKey: "inviteUsersHint" },
  { key: "pin_messages", labelKey: "pinMessages", hintKey: "pinMessagesHint" },
  { key: "manage_events", labelKey: "manageEvents", hintKey: "manageEventsHint" },
  { key: "add_admins", labelKey: "addAdmins", hintKey: "addAdminsHint" },
  { key: "remain_anonymous", labelKey: "remainAnonymous", hintKey: "remainAnonymousHint" },
];

export const MEMBER_RIGHTS: { key: MemberRight; labelKey: string; hintKey: string }[] = [
  { key: "send_messages", labelKey: "sendMessages", hintKey: "sendMessagesHint" },
  { key: "send_media", labelKey: "sendMedia", hintKey: "sendMediaHint" },
  { key: "embed_links", labelKey: "embedLinks", hintKey: "embedLinksHint" },
  { key: "add_members", labelKey: "addMembers", hintKey: "addMembersHint" },
  { key: "create_events", labelKey: "createEvents", hintKey: "createEventsHint" },
  { key: "pin_messages", labelKey: "pinMessages", hintKey: "pinMessagesHint" },
  { key: "change_info", labelKey: "changeInfo", hintKey: "changeInfoMemberHint" },
];

/** What a freshly promoted admin gets, matching Telegram's defaults. */
export const DEFAULT_ADMIN_PERMISSIONS: Record<AdminRight, boolean> = {
  change_info: true,
  delete_messages: true,
  restrict_members: true,
  invite_users: true,
  pin_messages: true,
  manage_events: true,
  add_admins: false,
  remain_anonymous: false,
};

export const DEFAULT_MEMBER_PERMISSIONS: Record<MemberRight, boolean> = {
  send_messages: true,
  send_media: true,
  embed_links: true,
  add_members: true,
  create_events: true,
  pin_messages: false,
  change_info: false,
};

const MUTING_RIGHTS: CommunityRight[] = ["send_messages", "send_media", "embed_links"];

/** Rights that put at least one tab in the Manage sheet. */
const PANEL_RIGHTS: AdminRight[] = ["change_info", "restrict_members", "invite_users", "add_admins"];

/** Every right that makes someone a moderator of any kind. */
const MODERATION_RIGHTS: AdminRight[] = [
  ...PANEL_RIGHTS,
  "delete_messages",
  "pin_messages",
  "manage_events",
];

/**
 * A timed ban whose clock has run out is not a ban. Nothing sweeps those rows
 * back to 'active', so the database resolves expiry on read — community_permission
 * and community_is_active_member both special-case it, as does the rejoin policy.
 * The client has to agree, or every duration in the ban picker means "forever".
 */
export function isEffectivelyActive(member: CommunityMember | null | undefined): boolean {
  if (!member) return false;
  if (member.status === "active") return true;
  if (member.status !== "banned" || !member.banned_until) return false;
  const until = new Date(member.banned_until).getTime();
  return !Number.isNaN(until) && until <= Date.now();
}

/** True only while a ban is still running. */
export function isActivelyBanned(member: CommunityMember | null | undefined): boolean {
  return member?.status === "banned" && !isEffectivelyActive(member);
}

export function resolvePermission(
  community: Pick<Community, "default_permissions"> | null | undefined,
  member: CommunityMember | null | undefined,
  right: CommunityRight,
): boolean {
  if (!isEffectivelyActive(member) || !member) return false;
  if (member.role === "owner") return true;

  if (member.role === "admin") {
    const granted = member.permissions?.[right as AdminRight];
    if (typeof granted === "boolean") return granted;
  } else if (
    member.muted_until &&
    new Date(member.muted_until).getTime() > Date.now() &&
    MUTING_RIGHTS.includes(right)
  ) {
    return false;
  }

  return community?.default_permissions?.[right as MemberRight] === true;
}

export interface CommunityAbilities {
  role: "owner" | "admin" | "member" | null;
  isOwner: boolean;
  isAdmin: boolean;
  /** Any moderation power at all, including chat-only rights like pinning. */
  isModerator: boolean;
  /**
   * Would the Manage sheet have at least one tab? An admin holding only
   * pin_messages moderates in the chat but has nothing to open, so the entry
   * points key off this rather than isModerator to avoid a dead button.
   */
  canManage: boolean;
  /**
   * change_info is also a *member* right, so it alone must not unlock privacy,
   * slow mode or the default-permission map. Those need rank as well — the
   * server enforces the same split.
   */
  canManageSettings: boolean;
  isMuted: boolean;
  mutedUntil: Date | null;
  can: (right: CommunityRight) => boolean;
}

export function getCommunityAbilities(
  community: Community | null | undefined,
  membership: CommunityMember | null | undefined,
): CommunityAbilities {
  const role = (isEffectivelyActive(membership) ? membership!.role : null) as CommunityAbilities["role"];
  const can = (right: CommunityRight) => resolvePermission(community, membership, right);
  const mutedUntil = membership?.muted_until ? new Date(membership.muted_until) : null;
  const mutedValid = !!mutedUntil && !Number.isNaN(mutedUntil.getTime());

  return {
    role,
    isOwner: role === "owner",
    isAdmin: role === "admin",
    isModerator: role === "owner" || (role === "admin" && MODERATION_RIGHTS.some(can)),
    canManage: role === "owner" || (role === "admin" && PANEL_RIGHTS.some(can)),
    canManageSettings: role === "owner" || (role === "admin" && can("change_info")),
    isMuted: role === "member" && mutedValid && (mutedUntil as Date).getTime() > Date.now(),
    mutedUntil: mutedValid ? mutedUntil : null,
    can,
  };
}

/** An indefinite mute is stored as a far-future finite date, not 'infinity'. */
export const FOREVER_YEAR = 9000;

export function isForever(date: Date | null): boolean {
  return !!date && date.getFullYear() >= FOREVER_YEAR;
}

export const RESTRICTION_DURATIONS: { labelKey: string; seconds: number | null }[] = [
  { labelKey: "oneHour", seconds: 60 * 60 },
  { labelKey: "eightHours", seconds: 60 * 60 * 8 },
  { labelKey: "oneDay", seconds: 60 * 60 * 24 },
  { labelKey: "oneWeek", seconds: 60 * 60 * 24 * 7 },
  { labelKey: "forever", seconds: null },
];

export function durationToTimestamp(seconds: number | null): string | null {
  if (seconds === null) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export const SLOW_MODE_OPTIONS: { labelKey: string; seconds: number }[] = [
  { labelKey: "off", seconds: 0 },
  { labelKey: "tenSeconds", seconds: 10 },
  { labelKey: "thirtySeconds", seconds: 30 },
  { labelKey: "oneMinute", seconds: 60 },
  { labelKey: "fiveMinutes", seconds: 300 },
  { labelKey: "fifteenMinutes", seconds: 900 },
  { labelKey: "oneHour", seconds: 3600 },
];

export const ADMIN_LOG_VERBS: Record<string, string> = {
  promote_admin: "promoted",
  demote_admin: "demoted",
  transfer_ownership: "transferred ownership to",
  ban_member: "banned",
  unban_member: "unbanned",
  kick_member: "removed",
  mute_member: "muted",
  unmute_member: "unmuted",
  approve_member: "approved",
  reject_member: "rejected",
  delete_message: "deleted a message from",
  purge_messages: "deleted all messages from",
  pin_message: "pinned a message from",
  unpin_message: "unpinned a message from",
  update_settings: "updated the community settings",
  create_invite: "created an invite link",
  revoke_invite: "revoked an invite link",
  invite_used: "invited",
};

const RIGHT_LABELS: Record<string, string> = {
  change_info: "change community info",
  delete_messages: "delete messages",
  restrict_members: "ban users",
  invite_users: "invite users via link",
  pin_messages: "pin messages",
  manage_events: "manage events",
  add_admins: "add new admins",
  remain_anonymous: "remain anonymous",
  send_messages: "send messages",
  send_media: "send media",
  embed_links: "embed links",
  add_members: "add members",
  create_events: "create events",
};

const ERROR_COPY: Record<string, string> = {
  not_authenticated: "Connect your wallet first",
  cannot_moderate_yourself: "You cannot do that to yourself",
  cannot_moderate_the_owner: "The owner cannot be moderated",
  only_the_owner_can_moderate_an_admin: "Only the owner can moderate another admin",
  only_the_owner_can_transfer_ownership: "Only the owner can transfer ownership",
  only_the_owner_can_delete_a_community: "Only the owner can delete this community",
  new_owner_must_be_an_active_member: "Pick an active member to hand the community to",
  member_not_found: "That member is no longer here",
  member_is_not_active: "That member is not active",
  member_is_not_banned: "That member is not banned",
  no_pending_request: "That request is no longer pending",
  message_not_found: "That message is already gone",
  role_must_be_admin_or_member: "Unsupported role",
  already_the_owner: "They already own this community",
  membership_updates_require_rpc: "That change is no longer allowed directly",
  cannot_join_on_behalf_of_another_wallet: "You can only join with your own wallet",
  cannot_post_as_another_wallet: "You can only post as yourself",
  cannot_edit_another_members_message: "You can only edit your own messages",
  you_cannot_post_in_this_community: "You do not have permission to post here",
  you_cannot_send_media_in_this_community: "You do not have permission to send media here",
  you_are_banned_from_this_community: "You are banned from this community",
  invite_not_found: "That invite link does not exist",
  invite_revoked: "That invite link was revoked",
  invite_expired: "That invite link has expired",
  invite_exhausted: "That invite link has reached its limit",
};

/** Turns a raised Postgres condition into something worth showing a human. */
export function communityErrorMessage(error: unknown, fallback: string): string {
  const raw = String((error as { message?: string } | null)?.message ?? "");
  if (!raw) return fallback;

  const permission = raw.match(/permission_denied:(\w+)/);
  if (permission) {
    const label = RIGHT_LABELS[permission[1]] ?? permission[1].replace(/_/g, " ");
    return `You do not have permission to ${label}`;
  }

  const slow = raw.match(/slow_mode_active:(\d+)/);
  if (slow) {
    const seconds = Number(slow[1]);
    return seconds >= 60
      ? `Slow mode is on — one message every ${Math.round(seconds / 60)} min`
      : `Slow mode is on — one message every ${seconds}s`;
  }

  for (const [code, copy] of Object.entries(ERROR_COPY)) {
    if (raw.includes(code)) return copy;
  }
  return fallback;
}
