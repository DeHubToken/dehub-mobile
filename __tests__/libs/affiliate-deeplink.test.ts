import { buildReferralDeepLink, sanitizeDeepLinkPath } from "../../libs/affiliate-deeplink";

describe("sanitizeDeepLinkPath", () => {
  it("keeps Riftn paths and full Riftn URLs", () => {
    expect(sanitizeDeepLinkPath("docs/getting-started")).toBe("/docs/getting-started");
    expect(sanitizeDeepLinkPath("https://dehub.io/app/stores?x=1")).toBe("/app/stores?x=1");
    expect(sanitizeDeepLinkPath("https://staging.dehub.io/bounties")).toBe("/bounties");
    expect(sanitizeDeepLinkPath("https://riftn.com/app/requests?tab=shipped")).toBe("/app/requests?tab=shipped");
    expect(sanitizeDeepLinkPath("https://www.riftn.com/bounties")).toBe("/bounties");
    expect(sanitizeDeepLinkPath("https://notriftn.com/bounties")).toBeNull();
  });
  it("refuses anything that leaves Riftn or loops", () => {
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
  it("keeps the invite link's name tag after the page path", () => {
    expect(buildReferralDeepLink("https://riftn.com/r/ABC?n=z95t", "/docs")).toBe("https://riftn.com/r/ABC/docs?n=z95t");
    expect(buildReferralDeepLink("https://riftn.com/r/ABC?n=z95t", "/app/stores?x=1")).toBe("https://riftn.com/r/ABC/app/stores?x=1&n=z95t");
    expect(buildReferralDeepLink("https://riftn.com/r/ABC?n=z95t", "")).toBe("https://riftn.com/r/ABC?n=z95t");
  });
});
