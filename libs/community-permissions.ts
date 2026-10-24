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
import { translateCopy as _translateCopy } from "../i18n/copy";

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

const PERMISSION_DENIED_COPY: Record<string, string> = {
  get change_info() { return _translateCopy("copy.a03a692d724f", { defaultValue: "You do not have permission to change community info" }); },
  get delete_messages() { return _translateCopy("copy.fe7e45703caf", { defaultValue: "You do not have permission to delete messages" }); },
  get restrict_members() { return _translateCopy("copy.76ae16eb8065", { defaultValue: "You do not have permission to ban users" }); },
  get invite_users() { return _translateCopy("copy.d835fb6c743c", { defaultValue: "You do not have permission to invite users via link" }); },
  get pin_messages() { return _translateCopy("copy.7813733a02b3", { defaultValue: "You do not have permission to pin messages" }); },
  get manage_events() { return _translateCopy("copy.002286513398", { defaultValue: "You do not have permission to manage events" }); },
  get add_admins() { return _translateCopy("copy.045c8cd3aa81", { defaultValue: "You do not have permission to add new admins" }); },
  get remain_anonymous() { return _translateCopy("copy.b31ff2d0eb1a", { defaultValue: "You do not have permission to remain anonymous" }); },
  get send_messages() { return _translateCopy("copy.26073cdcaa76", { defaultValue: "You do not have permission to send messages" }); },
  get send_media() { return _translateCopy("copy.deeab29dde62", { defaultValue: "You do not have permission to send media" }); },
  get embed_links() { return _translateCopy("copy.90c724915b1b", { defaultValue: "You do not have permission to embed links" }); },
  get add_members() { return _translateCopy("copy.b05480861091", { defaultValue: "You do not have permission to add members" }); },
  get create_events() { return _translateCopy("copy.6741361174ce", { defaultValue: "You do not have permission to create events" }); },
};

const ERROR_COPY: Record<string, string> = {
  get not_authenticated() { return _translateCopy("copy.d4eb6104ebd9", { defaultValue: "Connect your wallet first" }); },
  get cannot_moderate_yourself() { return _translateCopy("copy.018c5aecd6c3", { defaultValue: "You cannot do that to yourself" }); },
  get cannot_moderate_the_owner() { return _translateCopy("copy.04fcef5b5b26", { defaultValue: "The owner cannot be moderated" }); },
  get only_the_owner_can_moderate_an_admin() { return _translateCopy("copy.c0cafd3f4fda", { defaultValue: "Only the owner can moderate another admin" }); },
  get only_the_owner_can_transfer_ownership() { return _translateCopy("copy.2264da39007c", { defaultValue: "Only the owner can transfer ownership" }); },
  get only_the_owner_can_delete_a_community() { return _translateCopy("copy.82226ff838ca", { defaultValue: "Only the owner can delete this community" }); },
  get new_owner_must_be_an_active_member() { return _translateCopy("copy.f0c575ccd7be", { defaultValue: "Pick an active member to hand the community to" }); },
  get member_not_found() { return _translateCopy("copy.8202e88f9b4a", { defaultValue: "That member is no longer here" }); },
  get member_is_not_active() { return _translateCopy("copy.55d25bbc9a7c", { defaultValue: "That member is not active" }); },
  get member_is_not_banned() { return _translateCopy("copy.cbb2315229e5", { defaultValue: "That member is not banned" }); },
  get no_pending_request() { return _translateCopy("copy.9db7738dd45c", { defaultValue: "That request is no longer pending" }); },
  get message_not_found() { return _translateCopy("copy.9a064ac60abe", { defaultValue: "That message is already gone" }); },
  get role_must_be_admin_or_member() { return _translateCopy("copy.5e2c9b601cf1", { defaultValue: "Unsupported role" }); },
  get already_the_owner() { return _translateCopy("copy.c833a76e8f1a", { defaultValue: "They already own this community" }); },
  get membership_updates_require_rpc() { return _translateCopy("copy.68024bd2022b", { defaultValue: "That change is no longer allowed directly" }); },
  get cannot_join_on_behalf_of_another_wallet() { return _translateCopy("copy.07fac032f756", { defaultValue: "You can only join with your own wallet" }); },
  get cannot_post_as_another_wallet() { return _translateCopy("copy.e490c5f0bcb9", { defaultValue: "You can only post as yourself" }); },
  get cannot_edit_another_members_message() { return _translateCopy("copy.50164dfe3302", { defaultValue: "You can only edit your own messages" }); },
  get you_cannot_post_in_this_community() { return _translateCopy("copy.fa864aef958f", { defaultValue: "You do not have permission to post here" }); },
  get you_cannot_send_media_in_this_community() { return _translateCopy("copy.462380995d63", { defaultValue: "You do not have permission to send media here" }); },
  get you_are_banned_from_this_community() { return _translateCopy("copy.46ffd9568a13", { defaultValue: "You are banned from this community" }); },
  get invite_not_found() { return _translateCopy("copy.bf38732f4aad", { defaultValue: "That invite link does not exist" }); },
  get invite_revoked() { return _translateCopy("copy.1957c0d6df16", { defaultValue: "That invite link was revoked" }); },
  get invite_expired() { return _translateCopy("copy.817a32289f0a", { defaultValue: "That invite link has expired" }); },
  get invite_exhausted() { return _translateCopy("copy.b064bd1adffd", { defaultValue: "That invite link has reached its limit" }); },
};

/** Turns a raised Postgres condition into something worth showing a human. */
export function communityErrorMessage(error: unknown, fallback: string): string {
  const raw = String((error as { message?: string } | null)?.message ?? "");
  if (!raw) return fallback;

  const permission = raw.match(/permission_denied:(\w+)/);
  if (permission) {
    return PERMISSION_DENIED_COPY[permission[1]] ?? _translateCopy("copy.7b2d32bd2e67", { defaultValue: "You do not have permission to {{value1}}", value1: permission[1].replace(/_/g, " ") });
  }

  const slow = raw.match(/slow_mode_active:(\d+)/);
  if (slow) {
    const seconds = Number(slow[1]);
    return seconds >= 60
      ? _translateCopy("copy.014892720459", { defaultValue: "Slow mode is on — one message every {{value1}} min", value1: Math.round(seconds / 60) })
      : _translateCopy("copy.52c789c095cf", { defaultValue: "Slow mode is on — one message every {{value1}}s", value1: seconds });
  }

  for (const [code, copy] of Object.entries(ERROR_COPY)) {
    if (raw.includes(code)) return copy;
  }
  return fallback;
}
