import { apiClient } from "../../libs/api.client";
import { getFileName, guessMime } from "../../libs/assets.util";
import { getAccountSummaries } from "../user.service";
import { DmAction, DmDisableStatus } from "../enums/dm-preferences.enum";
import {
  getOtherParticipant,
  type DmConversation,
  type DmMessage,
  type DmMsgType,
  type DmUser,
  type UploadDmMediaParams,
} from "./dm.types";

function firstBadgeBalance(...values: unknown[]): number | string | null | undefined {
  return values.find((value) => {
    if (typeof value === "number") return Number.isFinite(value);
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));
  }) as number | string | null | undefined;
}

/** Merge the thin DM participant shape with the canonical account row. */
export function mergeDmUserProfile(user: DmUser, profile: Record<string, any>): DmUser {
  return {
    ...user,
    username: user.username || profile.username,
    address: user.address || profile.address || profile.walletAddress || profile.wallet_address,
    displayName: user.displayName || profile.displayName || profile.display_name,
    avatarImageUrl:
      user.avatarImageUrl || profile.avatarImageUrl || profile.avatarUrl || profile.avatar_url,
    badgeBalance: firstBadgeBalance(
      user.badgeBalance,
      profile.badgeBalance,
      profile.badge_balance,
      profile.stakedDHB,
      profile.staked,
    ),
    badgeLock: user.badgeLock || profile.badgeLock || profile.badge_lock || null,
    stakedDHB: user.stakedDHB ?? profile.stakedDHB,
    staked: user.staked ?? profile.staked,
  };
}

function sameDmUser(a: DmUser | undefined, b: DmUser): boolean {
  if (!a) return false;
  if (a._id && b._id && String(a._id) === String(b._id)) return true;
  const aAddress = String(a.address || "").toLowerCase();
  const bAddress = String(b.address || "").toLowerCase();
  return !!aAddress && aAddress === bAddress;
}

/**
 * Contacts intentionally return a compact participant. Web fills any missing
 * identity fields from account_info; doing the same here keeps badges and
 * names consistent across clients and lets React Native render one packed row.
 */
export async function enrichDmContacts(
  contacts: DmConversation[],
  myAddress: string,
): Promise<DmConversation[]> {
  const missing = contacts.flatMap((conversation) => {
    const other = getOtherParticipant(conversation, undefined, myAddress);
    if (!other?.address) return [];
    const hasBadgeBalance = firstBadgeBalance(other.badgeBalance) !== undefined;
    return other.displayName && hasBadgeBalance ? [] : [other.address];
  });
  const profiles = await getAccountSummaries(missing).catch(() => []);
  const profileByAddress = new Map(profiles.map(profile => [profile.address.toLowerCase(), profile] as const));
  return contacts.map((conversation) => {
      const other = getOtherParticipant(conversation, undefined, myAddress);
      if (!other) return conversation;

      const hasBadgeBalance = firstBadgeBalance(other.badgeBalance) !== undefined;
      if (other.displayName && hasBadgeBalance) {
        return conversation;
      }

      if (!other.address) return conversation;
      const profile = profileByAddress.get(other.address.toLowerCase());
      if (!profile) return conversation;
        const merged = mergeDmUserProfile(other, profile);

        return {
          ...conversation,
          participants: conversation.participants.map((entry) =>
            sameDmUser(entry.participant, other)
              ? { ...entry, participant: merged }
              : entry,
          ),
          messages: conversation.messages?.map((message) =>
            typeof message.sender === "object" && sameDmUser(message.sender, other)
              ? { ...message, sender: merged }
              : message,
          ),
        };
    });
}


export async function getContactsByAddress(
  address: string,
): Promise<DmConversation[]> {
  const addr = (address || "").toLowerCase();
  const contacts = await apiClient.get<DmConversation[]>(`/dm/contacts/${addr}`);
  return Array.isArray(contacts) ? enrichDmContacts(contacts, addr) : contacts;
}

export async function getConversation(id: string): Promise<DmConversation> {
  return apiClient.get<DmConversation>(`/dm/${id}`);
}


export interface GetMessagesParams {
  address: string;
  q?: string;
  skip?: number;
  limit?: number;
}

export interface GetMessagesResponse {
  messages: DmMessage[];
}

export async function getMessages(
  conversationId: string,
  params: GetMessagesParams,
): Promise<GetMessagesResponse> {
  const qs = new URLSearchParams();
  if (params.address) qs.set("address", params.address.toLowerCase());
  if (params.q) qs.set("q", params.q);
  if (typeof params.skip === "number") qs.set("skip", String(params.skip));
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  return apiClient.get<GetMessagesResponse>(
    `/dm/messages/${conversationId}?${qs.toString()}`,
  );
}


export async function uploadDmMedia(
  params: UploadDmMediaParams,
): Promise<DmMessage> {
  const { conversationId, senderId, files, msgType, voiceDuration, content, txHash, tipTxHash, replyTo } =
    params;

  const form = new FormData();
  for (const f of files) {
    const name =
      f?.name && String(f.name).trim() ? f.name : getFileName(f.uri, "file");
    const type =
      f?.type && String(f.type).includes("/")
        ? f.type
        : guessMime(f.uri, "application/octet-stream");
    form.append("files", { uri: f.uri, name, type } as unknown as Blob);
  }
  form.append("conversationId", String(conversationId));
  form.append("senderId", String(senderId));
  if (msgType) form.append("msgType", msgType);
  if (voiceDuration != null)
    form.append("voiceDuration", String(voiceDuration));
  if (content) form.append("content", content);
  if (txHash) form.append("txHash", txHash);
  if (tipTxHash) form.append("tipTxHash", tipTxHash);
  if (replyTo) form.append("replyTo", String(replyTo));

  return apiClient.post<DmMessage>("/dm/upload", form, {
    isAuthRequired: true,
  });
}


export interface VerifyDmFeeResult {
  verified: boolean;
  txHash?: string;
  error?: string;
}

export async function verifyDmFee(
  senderAddress: string,
  receiverAddress: string,
  txHash: string,
): Promise<VerifyDmFeeResult> {
  return apiClient.post<VerifyDmFeeResult>(
    "/dm/verify-dm-fee",
    { senderAddress, receiverAddress, txHash },
    { isAuthRequired: true },
  );
}

export interface TipNotifyResult {
  success: boolean;
  tipId?: string;
}

export async function tipNotify(params: {
  txHash: string;
  conversationId: string;
  senderAddress: string;
  chainId?: number;
  tokenAddress?: string;
  amount?: string;
}): Promise<TipNotifyResult> {
  return apiClient.post<TipNotifyResult>("/dm/tip-notify", params, {
    isAuthRequired: true,
  });
}


/**
 * The person being granted access is `userAddress`, not `address`.
 *
 * The server takes the list OWNER from the auth token and ignores any
 * `address` in the body, so a body keyed `address` arrived with the one
 * required field missing and came back 400 — both of these have always failed.
 */
export async function addFreeAccess(address: string): Promise<void> {
  await apiClient.post(
    "/dm/free-access",
    { userAddress: address },
    { isAuthRequired: true },
  );
}

export async function removeFreeAccess(address: string): Promise<void> {
  await apiClient.delete("/dm/free-access", {
    data: { userAddress: address },
    isAuthRequired: true,
  } as any);
}

/**
 * The response is `{ success, address, data }`, where `data` holds account
 * objects — not the bare array this used to claim. Callers treat the result as
 * addresses (they filter it with `!==`), so the addresses are what comes back.
 *
 * Typed as an array it was never one, so `Array.isArray(list) ? list : []` at
 * the call site discarded every response and the list rendered empty.
 */
export async function getFreeAccessList(
  creatorAddress: string,
): Promise<string[]> {
  const res = await apiClient.get<{ data?: Array<{ address?: string }> }>(
    `/dm/free-access/${creatorAddress}`,
    { isAuthRequired: true },
  );
  return (res?.data ?? [])
    .map((u) => (u?.address || "").toLowerCase())
    .filter(Boolean);
}


export interface DmUserStatus {
  address: string;
  disables?: DmDisableStatus[];
  perMessageFee?: number;
  freeAccessUsers?: string[];
}

export async function getDmUserStatus(
  address: string,
): Promise<DmUserStatus> {
  const addr = (address || "").toLowerCase();
  return apiClient.get<DmUserStatus>(`/dm/user-status/${addr}`, {
    isAuthRequired: true,
  });
}

export async function updateDmUserStatus(
  address: string,
  status: DmDisableStatus,
  action: DmAction,
  perMessageFee?: number,
): Promise<{ message?: string; data?: DmUserStatus }> {
  const addr = (address || "").toLowerCase();
  const payload: Record<string, unknown> = { status, action };
  if (perMessageFee !== undefined) payload.perMessageFee = perMessageFee;
  return apiClient.post(`/dm/user-status/${addr}`, payload, {
    isAuthRequired: true,
  });
}


export async function searchDmUsers(query: string): Promise<DmConversation[]> {
  return apiClient.get<DmConversation[]>(
    `/dm/search?searchQuery=${encodeURIComponent(query)}`,
    { isAuthRequired: true },
  );
}


/** Permanently delete a conversation (hard-delete own msgs, remove from contacts). */
export async function deleteConversation(
  dmId: string,
  address: string,
): Promise<{ success: boolean; message?: string; deletedMessages?: number }> {
  return apiClient.delete(`/dm/conversation/${dmId}`, {
    data: { address },
    isAuthRequired: true,
  } as any);
}

export async function bulkDeleteMessages(
  dmId: string,
  messageIds: string[],
  address: string,
): Promise<void> {
  await apiClient.post(
    "/dm/delete-messages",
    { dmId, messageIds, address },
    { isAuthRequired: true },
  );
}

export async function pinDmMessage(
  dmId: string,
  messageId: string,
  address: string,
): Promise<void> {
  await apiClient.post(
    `/dm/${dmId}/pin`,
    { messageId, address },
    { isAuthRequired: true },
  );
}

export async function unpinDmMessage(
  dmId: string,
  messageId: string,
  address: string,
): Promise<void> {
  await apiClient.delete(`/dm/${dmId}/pin`, {
    data: { messageId, address },
    isAuthRequired: true,
  } as any);
}
