jest.mock("../../services/supabase", () => ({ supabase: {} }));
jest.mock("../../libs/misc", () => ({ shareProfile: jest.fn() }));
jest.mock("../../libs/supabase-wallet-client", () => ({ withWalletHeader: (q: unknown) => q }));
jest.mock("../../libs/shareRef", () => ({ setShareRefCode: jest.fn() }));

import { buildInviteLink, inviteLinkTag } from "../../libs/affiliate";

describe("invite link name tag", () => {
  it("matches the web app's hash", () => {
    // riftn-web src/lib/inviteLink.test.ts pins the same value.
    expect(inviteLinkTag("Mart Vader")).toBe("z95t");
    expect(inviteLinkTag("@martvader")).toBe(inviteLinkTag(" MartVader "));
  });
  it("changes with the name", () => {
    expect(inviteLinkTag("Mart Vader")).not.toBe(inviteLinkTag("Brave Mercury"));
  });
  it("builds tagged and bare links", () => {
    expect(buildInviteLink("YWXRY67Q", "Mart Vader")).toBe("https://riftn.com/r/YWXRY67Q?n=z95t");
    expect(buildInviteLink("YWXRY67Q")).toBe("https://riftn.com/r/YWXRY67Q");
  });
});
