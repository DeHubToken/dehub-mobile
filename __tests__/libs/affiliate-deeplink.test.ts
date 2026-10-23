import { buildReferralDeepLink, sanitizeDeepLinkPath } from "../../libs/affiliate-deeplink";

describe("sanitizeDeepLinkPath", () => {
  it("keeps DeHub paths and full DeHub URLs", () => {
    expect(sanitizeDeepLinkPath("docs/getting-started")).toBe("/docs/getting-started");
    expect(sanitizeDeepLinkPath("https://dehub.io/app/stores?x=1")).toBe("/app/stores?x=1");
    expect(sanitizeDeepLinkPath("https://staging.dehub.io/bounties")).toBe("/bounties");
  });
  it("refuses anything that leaves DeHub or loops", () => {
    expect(sanitizeDeepLinkPath("https://evil.com/x")).toBeNull();
    expect(sanitizeDeepLinkPath("//evil.com")).toBeNull();
    expect(sanitizeDeepLinkPath("/\\evil.com")).toBeNull();
    expect(sanitizeDeepLinkPath("javascript:alert(1)")).toBeNull();
    expect(sanitizeDeepLinkPath("/r/ABC")).toBeNull();
    expect(sanitizeDeepLinkPath("/")).toBeNull();
  });
  it("builds the link", () => {
    expect(buildReferralDeepLink("https://dehub.io/r/ABC", "/docs")).toMatch(/\/r\/ABC\/docs$/);
    expect(buildReferralDeepLink("https://dehub.io/r/ABC", "https://evil.com")).toMatch(/\/r\/ABC$/);
  });
});
