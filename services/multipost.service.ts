import i18n from "i18next";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import { dehubAuthHeaders } from "./ai.service";
import { toastError, toastInfo, toastLoading, toastSuccess, toastWarning, dismissToast } from "../libs/toast";

export const MULTIPOST_PLATFORMS = [
  "twitter", "instagram", "facebook", "youtube", "tiktok", "linkedin",
  "threads", "pinterest", "reddit", "googlebusiness", "snapchat", "discord", "farcaster",
] as const;

export const PLATFORM_NAMES: Record<string, string> = {
  twitter: "X", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok",
  linkedin: "LinkedIn", threads: "Threads", pinterest: "Pinterest", reddit: "Reddit",
  googlebusiness: "Google Business", snapchat: "Snapchat", discord: "Discord", farcaster: "Farcaster",
};

export const MULTIPOST_REDIRECT = "dehub://multipost";

export interface SocialAccount { id: string; platform: string; username: string; pending?: boolean; approvalUrl?: string }
export interface MultipostStatus { credits: number; accounts: SocialAccount[] }

export class MultipostError extends Error {
  constructor(message: string, public status?: number, public data?: Record<string, any>) { super(message); }
}

async function call<T>(wallet: string | null, body: Record<string, unknown>): Promise<T> {
  const headers = await dehubAuthHeaders(wallet);
  const { data, error } = await supabase.functions.invoke("multipost", { body, headers });
  if (error) {
    const ctx = (error as any)?.context;
    let payload: Record<string, any> | undefined;
    try {
      if (ctx && typeof ctx.json === "function") payload = await ctx.json();
      else if (typeof ctx?.body === "string") payload = JSON.parse(ctx.body);
    } catch { /* not JSON */ }
    throw new MultipostError(payload?.error || error.message, ctx?.status, payload);
  }
  if (data?.ok === false && data?.error) throw new MultipostError(data.error, 400, data);
  return data as T;
}

export const getMultipostStatus = (wallet: string | null) => call<MultipostStatus>(wallet, { action: "status" });
export const disconnectAccount = (wallet: string | null, accountId: string) => call(wallet, { action: "disconnect", accountId });
/** Where to send the user, or null when the account is already connected. */
export const startConnect = async (wallet: string | null, platform: string) =>
  (await call<{ authUrl?: string }>(wallet, { action: "connect", platform, redirectUrl: MULTIPOST_REDIRECT })).authUrl ?? null;

/** Pay DHB for `credits` and have them credited. Returns the new balance. */
export async function buyCredits(wallet: string | null, credits: number): Promise<number> {
  const quote = await call<{ dhb: number; treasury: string }>(wallet, { action: "quote", credits });
  const { payPostQuota } = await import("./post-quota-payment");
  const payment = await payPostQuota(quote.dhb, quote.treasury, i18n.t("multiPost.payContext"));
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return (await call<{ credits: number }>(wallet, { action: "topup", credits, txHash: payment.txHash })).credits;
    } catch (err) {
      lastError = err;
      if (!(err instanceof MultipostError) || err.status !== 402) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastError;
}

export interface CrossPostMedia { uri: string; mimeType: string; name?: string }

async function uploadMedia(wallet: string | null, media: CrossPostMedia[]) {
  const video = media.find((m) => m.mimeType.startsWith("video/"));
  const picked = video ? [video] : media.filter((m) => m.mimeType.startsWith("image/")).slice(0, 4);
  const out: { url: string; type: "image" | "video" }[] = [];
  for (const item of picked) {
    const { uploadUrl, publicUrl } = await call<{ uploadUrl: string; publicUrl: string }>(wallet, {
      action: "presign", filename: item.name || item.uri.split("/").pop() || "upload", contentType: item.mimeType,
    });
    let uri = item.uri;
    if (!uri.startsWith("file://")) {
      const dest = `${FileSystem.cacheDirectory}crosspost-${Date.now()}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      uri = dest;
    }
    const res = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": item.mimeType },
    });
    if (res.status >= 300) throw new Error(i18n.t("multiPost.uploadFailed"));
    out.push({ url: publicUrl, type: item.mimeType.startsWith("video/") ? "video" : "image" });
  }
  return out;
}

/**
 * Send a finished dehub post to the selected external accounts. Never fails
 * the post itself. Missing credits are bought on the spot at the single-post price.
 */
export async function crossPost(input: {
  wallet: string | null;
  text: string;
  media: CrossPostMedia[];
  accountIds: string[];
  scheduledAt?: Date | string | null;
  tokenId?: string | number;
}): Promise<void> {
  if (!input.accountIds.length) return;
  const toastId = toastLoading(i18n.t("multiPost.postingToast", { count: input.accountIds.length }));
  try {
    const mediaItems = input.media.length ? await uploadMedia(input.wallet, input.media) : [];
    const body = {
      action: "publish",
      content: input.text.replace(/\[soundtrack:[^\]]*\]\s*/g, "").trim(),
      accountIds: input.accountIds,
      mediaItems,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : undefined,
      link: input.tokenId !== undefined ? `https://dehub.io/app/post/${input.tokenId}` : undefined,
    };
    type PublishResult = { sent: number; failed: number; scheduled: boolean; skipped: { platform: string; reason: string }[] };
    let result: PublishResult;
    try {
      result = await call<PublishResult>(input.wallet, body);
    } catch (err) {
      if (!(err instanceof MultipostError) || err.data?.code !== "INSUFFICIENT_CREDITS") throw err;
      const shortfall = Math.max(1, Number(err.data.needed) - Number(err.data.credits ?? 0));
      toastInfo(i18n.t("multiPost.payingToast", { count: shortfall }));
      await buyCredits(input.wallet, shortfall);
      result = await call<PublishResult>(input.wallet, body);
    }
    dismissToast(toastId);
    const names = (reasons: string[] | null) => (result.skipped ?? [])
      .filter((s) => (reasons ? reasons.includes(s.reason) : !["needs_video", "needs_media", "no_schedule"].includes(s.reason)))
      .map((s) => PLATFORM_NAMES[s.platform] ?? s.platform)
      .join(", ");
    const media = names(["needs_video", "needs_media"]);
    const schedule = names(["no_schedule"]);
    const other = names(null);
    if (media) toastInfo(i18n.t("multiPost.skippedToast", { platforms: media }));
    if (schedule) toastInfo(i18n.t("multiPost.skippedScheduleToast", { platforms: schedule }));
    if (other) toastInfo(i18n.t("multiPost.skippedOtherToast", { platforms: other }));
    if (result.failed > 0) {
      toastWarning(i18n.t("multiPost.partialToast", { sent: result.sent, failed: result.failed }));
    } else {
      toastSuccess(i18n.t(result.scheduled ? "multiPost.scheduledToast" : "multiPost.postedToast", { count: result.sent }));
    }
  } catch (err: any) {
    dismissToast(toastId);
    toastError(null, i18n.t("multiPost.failedToast", { error: err?.message ?? String(err) }));
  }
}
