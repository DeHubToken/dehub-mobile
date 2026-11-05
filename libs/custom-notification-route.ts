/**
 * Where a Supabase-side notification opens, from a push tap.
 *
 * Feature requests, governance polls, the DAO, bounties, stages, communities
 * and mini apps write their notifications into Supabase, not the Riftn API.
 * The API now relays those rows as pushes (see the backend's
 * supabase-notification-relay), carrying the row's own reference fields:
 *
 *   customId            the row's uuid, so the tap can mark it read
 *   referenceId         request / proposal / community slug / job number ...
 *   referenceCommentId  the comment the row is about, where there is one
 *   referenceTitle      mini app path, trench symbol ...
 *
 * The targets match the rows in NotificationScreen one for one, so a push and
 * the row it mirrors always open the same place.
 */

import { ScreenNames } from "../navigation/ScreenNames";
import { supabase } from "../services/supabase";
import { emitStageDeepLink } from "./deeplink.events";
import { stageDeepLinkFor } from "./stage-notifications";
import { markCustomNotificationRead, CUSTOM_ID_PREFIX } from "./custom-notifications";

type Navigate = (name: any, params?: any) => void;

export interface CustomPushData {
  type?: string;
  customId?: string;
  referenceId?: string;
  referenceCommentId?: string;
  referenceTitle?: string;
}

const FEATURE_TYPES = new Set([
  "feature_request_like",
  "feature_request_comment",
  "feature_request_reply",
  "feature_request_mention",
  "feature_request_activity",
  "feature_request_new",
  "feature_request_comment_like",
  "feature_request_status",
]);

const GOVERNANCE_TYPES = new Set([
  "governance_vote",
  "governance_comment",
  "governance_reply",
  "governance_comment_like",
  "governance_result",
]);

const COMMUNITY_TYPES = new Set(["community_join", "community_mention", "community_here"]);
const WORK_TYPES = new Set(["work_application", "work_submission", "work_application_reply"]);

/** True for every type this module routes, so the push handler knows to hand it over. */
export function isCustomPushType(type: string | undefined): boolean {
  if (!type) return false;
  return (
    FEATURE_TYPES.has(type) ||
    GOVERNANCE_TYPES.has(type) ||
    COMMUNITY_TYPES.has(type) ||
    WORK_TYPES.has(type) ||
    type.startsWith("dao_") ||
    type === "stage_live" ||
    type === "stage_reminder" ||
    type === "miniapp" ||
    type === "trench_price_alert" ||
    type === "store_order" ||
    type === "remix" ||
    type === "fraction_settled" ||
    type === "fraction_sold" ||
    type === "fraction_delivered"
  );
}

async function openBounty(navigate: Navigate, jobNumber: string | undefined) {
  if (jobNumber) {
    try {
      const { data } = await supabase.from("work_jobs").select("id").eq("job_number", Number(jobNumber)).maybeSingle();
      const jobId = (data as { id?: string } | null)?.id;
      if (jobId) {
        navigate(ScreenNames.WorkJobDetail, { jobId });
        return;
      }
    } catch {
      // Fall through to the board.
    }
  }
  navigate(ScreenNames.Work);
}

/**
 * Open what a Supabase-side push names, and mark its row read. Returns false
 * for a type this module does not route, so the caller carries on.
 */
export function openCustomPush(navigate: Navigate, data: CustomPushData, walletAddress?: string | null): boolean {
  const type = data.type;
  if (!isCustomPushType(type)) return false;
  const ref = data.referenceId || undefined;
  const commentId = data.referenceCommentId || undefined;

  if (data.customId && walletAddress) {
    markCustomNotificationRead(`${CUSTOM_ID_PREFIX}${data.customId}`, walletAddress).catch(() => {});
  }

  if (FEATURE_TYPES.has(type!)) {
    if (ref) navigate(ScreenNames.FeatureRequests, { requestId: ref, commentId });
    else navigate(ScreenNames.FeatureRequests);
    return true;
  }
  if (GOVERNANCE_TYPES.has(type!)) {
    if (ref) navigate(ScreenNames.GovernanceProposal, { proposalId: ref, commentId });
    else navigate(ScreenNames.Notifications);
    return true;
  }
  if (type!.startsWith("dao_")) {
    navigate(ScreenNames.Dao, ref ? { proposalId: ref } : undefined);
    return true;
  }
  if (COMMUNITY_TYPES.has(type!)) {
    if (ref) navigate(ScreenNames.CommunityDetail, { slug: ref, ...(type === "community_join" ? {} : { tab: "chat" }) });
    else navigate(ScreenNames.Notifications);
    return true;
  }
  if (WORK_TYPES.has(type!)) {
    void openBounty(navigate, ref);
    return true;
  }
  if (type === "stage_live" || type === "stage_reminder") {
    emitStageDeepLink(stageDeepLinkFor(ref));
    return true;
  }
  if (type === "miniapp") {
    if (ref) navigate(ScreenNames.MiniApp, { slug: ref, from: "notification", ...(data.referenceTitle ? { url: data.referenceTitle } : {}) });
    else navigate(ScreenNames.Notifications);
    return true;
  }
  if (type === "trench_price_alert") {
    navigate(ScreenNames.ArcadeGame, { slug: "trenchstar", symbol: data.referenceTitle || "BTC" });
    return true;
  }
  if (type === "remix" || type === "fraction_settled") {
    const tokenId = Number(ref);
    if (Number.isFinite(tokenId) && tokenId > 0) navigate(ScreenNames.FeedDetail, { tokenId });
    else navigate(ScreenNames.Notifications);
    return true;
  }
  // Store orders and fraction hand-overs carry an action on the row itself.
  navigate(ScreenNames.Notifications);
  return true;
}
