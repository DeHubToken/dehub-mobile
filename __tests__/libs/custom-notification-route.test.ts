jest.mock("../../services/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "job-uuid" } }) }) }) }) },
}));
jest.mock("../../libs/custom-notifications", () => ({
  CUSTOM_ID_PREFIX: "custom_",
  markCustomNotificationRead: jest.fn(async () => undefined),
}));
jest.mock("../../libs/deeplink.events", () => ({ emitStageDeepLink: jest.fn() }));
jest.mock("../../libs/stage-notifications", () => ({ stageDeepLinkFor: (id?: string) => ({ id }) }));
jest.mock("../../navigation/ScreenNames", () => ({
  ScreenNames: new Proxy({}, { get: (_t, key) => String(key) }),
}));

import { isCustomPushType, openCustomPush } from "../../libs/custom-notification-route";
import { markCustomNotificationRead } from "../../libs/custom-notifications";

describe("openCustomPush", () => {
  const nav = jest.fn();
  beforeEach(() => nav.mockReset());

  it("a reply on a request opens that request with the comment", () => {
    expect(openCustomPush(nav, {
      type: "feature_request_reply", customId: "row-1", referenceId: "req-1", referenceCommentId: "c-1",
    }, "0xabc")).toBe(true);
    expect(nav).toHaveBeenCalledWith("FeatureRequests", { requestId: "req-1", commentId: "c-1" });
    expect(markCustomNotificationRead).toHaveBeenCalledWith("custom_row-1", "0xabc");
  });

  it("governance comments and results open the proposal", () => {
    openCustomPush(nav, { type: "governance_comment_like", referenceId: "p-1", referenceCommentId: "c-9" });
    expect(nav).toHaveBeenLastCalledWith("GovernanceProposal", { proposalId: "p-1", commentId: "c-9" });
    openCustomPush(nav, { type: "governance_result", referenceId: "p-1" });
    expect(nav).toHaveBeenLastCalledWith("GovernanceProposal", { proposalId: "p-1", commentId: undefined });
  });

  it("DAO rows open the DAO with their proposal", () => {
    openCustomPush(nav, { type: "dao_vote_deadline", referenceId: "d-1" });
    expect(nav).toHaveBeenLastCalledWith("Dao", { proposalId: "d-1" });
  });

  it("community mentions open the chat", () => {
    openCustomPush(nav, { type: "community_mention", referenceId: "devs" });
    expect(nav).toHaveBeenLastCalledWith("CommunityDetail", { slug: "devs", tab: "chat" });
  });

  it("leaves API types to the existing handler", () => {
    expect(isCustomPushType("comment_reply")).toBe(false);
    expect(openCustomPush(nav, { type: "comment_reply" })).toBe(false);
    expect(nav).not.toHaveBeenCalled();
  });
});
