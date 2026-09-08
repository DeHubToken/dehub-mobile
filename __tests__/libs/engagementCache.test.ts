import { applyEngagement, clearAllEngagement, peekEngagement, reconcileEngagement } from "../../libs/engagementCache";

beforeEach(clearAllEngagement);

it("carries confirmed totals to another feed still holding older viewer flags", () => {
  applyEngagement("1", { isLiked: true, myReaction: "love", likeCount: 2 });
  reconcileEngagement([{ tokenId: 1, isLiked: true, myReaction: "love", totalVotes: { for: 12 } }]);
  const result = peekEngagement({ tokenId: 1, isLiked: false, totalVotes: { for: 1 } });
  expect(result.likeCount).toBe(12);
  expect(result.myReaction).toBe("love");
});

it("accepts refreshed votes while an unrelated save is still pending", () => {
  applyEngagement("1", { isLiked: true, myReaction: "love", likeCount: 2, isSaved: true });
  const result = peekEngagement({ tokenId: 1, isLiked: true, myReaction: "love", isSaved: false, totalVotes: { for: 12 } });
  expect(result.likeCount).toBe(12);
  expect(result.isSaved).toBe(true);
  expect(result.myReaction).toBe("love");
});

it("accepts refreshed reposts while a reaction is still pending", () => {
  applyEngagement("1", { isLiked: true, myReaction: "love", likeCount: 2, isReposted: true, repostCount: 1 });
  const result = peekEngagement({ tokenId: 1, isLiked: false, isReposted: true, reposts: 7, totalVotes: { for: 1 } });
  expect(result.likeCount).toBe(2);
  expect(result.repostCount).toBe(7);
});

it("does not confirm a reaction swap from polarity alone", () => {
  applyEngagement("1", { isLiked: true, myReaction: "love", likeCount: 2 });
  const result = peekEngagement({ tokenId: 1, isLiked: true, myReaction: "like", totalVotes: { for: 1 } });
  expect(result.myReaction).toBe("love");
  expect(result.likeCount).toBe(2);
});

it("preserves local engagement when the response has no viewer fields", () => {
  applyEngagement("1", { isLiked: true, myReaction: "love", likeCount: 2 });
  expect(peekEngagement({ tokenId: 1, totalVotes: { for: 1 } }).likeCount).toBe(2);
});
