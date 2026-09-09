import {
  legacyAccountsForProvider,
  matchRecoveredLegacyAccount,
} from "../../libs/wallet-core/legacy-match";
import type { LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";

const googleAccount: LegacyAccountMatch = {
  signupMethod: "google",
  ethAddress: "0x1111111111111111111111111111111111111111",
  username: "nickrookie",
};
const emailAccount: LegacyAccountMatch = {
  signupMethod: "email",
  ethAddress: "0x2222222222222222222222222222222222222222",
  username: "second-profile",
};

describe("legacy account wallet matching", () => {
  it("matches the profile Safe rather than showing the recovered owner EOA", () => {
    expect(
      matchRecoveredLegacyAccount(
        [googleAccount, emailAccount],
        "email_passwordless",
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        googleAccount.ethAddress,
      ),
    ).toBe(googleAccount);
  });

  it("does not trust provider metadata when a predicted Safe disagrees", () => {
    expect(
      matchRecoveredLegacyAccount(
        [googleAccount, emailAccount],
        "google",
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).toBeUndefined();
  });

  it("uses a unique provider only when Safe prediction is unavailable", () => {
    expect(
      matchRecoveredLegacyAccount(
        [googleAccount, emailAccount],
        "google",
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        null,
      ),
    ).toBe(googleAccount);
  });

  it("treats passwordless email aliases as the same old login", () => {
    expect(legacyAccountsForProvider([googleAccount, emailAccount], "email_passwordless"))
      .toEqual([emailAccount]);
  });
});
