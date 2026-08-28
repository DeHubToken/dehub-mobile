/**
 * The drift record that carries "the account is not at the wallet this device
 * holds" from the Supabase exchange to the signature login that follows.
 *
 * Two properties matter and both are safety, not convenience:
 *  - it is consumed once, so a failed rescue cannot be retried against a state
 *    the first attempt may already have changed;
 *  - it authorises a move ONLY onto the identity's own wallet, so an imported
 *    or external wallet still means "switch accounts" rather than dragging an
 *    account onto a key the user reached deliberately.
 */
import {
  recordWalletDrift,
  takeWalletDrift,
  clearWalletDrift,
  isIdentitysOwnWallet,
  type WalletDrift,
} from "../../libs/wallet-drift";

const LINKED = "0x05636EAAe9326438a86dAc8ff94b17304F51a174";
const OWNER_EOA = "0x4de2d88519C60591B812E651870EBaBc0FaB93E4";
const OWNER_SAFE = "0x1111111111111111111111111111111111111111";
const STRANGER = "0x9999999999999999999999999999999999999999";
const UID = "0e1bcf94-191f-43ea-84ce-e77bc5b1285f";

const drift = (): WalletDrift => ({
  linked: LINKED.toLowerCase(),
  ownerEoa: OWNER_EOA.toLowerCase(),
  supabaseUserId: UID,
});

beforeEach(() => {
  clearWalletDrift();
});

describe("wallet drift record", () => {
  it("normalises the addresses it stores", () => {
    recordWalletDrift({ linked: LINKED, ownerEoa: OWNER_EOA, supabaseUserId: UID });

    expect(takeWalletDrift()).toEqual({
      linked: LINKED.toLowerCase(),
      ownerEoa: OWNER_EOA.toLowerCase(),
      supabaseUserId: UID,
    });
  });

  it("hands the drift out exactly once", () => {
    recordWalletDrift({ linked: LINKED, ownerEoa: OWNER_EOA, supabaseUserId: UID });

    expect(takeWalletDrift()).not.toBeNull();
    expect(takeWalletDrift()).toBeNull();
  });

  it("is empty when no drift was seen", () => {
    expect(takeWalletDrift()).toBeNull();
  });

  it("can be dropped without being consumed — sign-out must not leak it", () => {
    recordWalletDrift({ linked: LINKED, ownerEoa: OWNER_EOA, supabaseUserId: UID });
    clearWalletDrift();

    expect(takeWalletDrift()).toBeNull();
  });
});

describe("isIdentitysOwnWallet", () => {
  it("accepts the owner EOA itself", () => {
    expect(isIdentitysOwnWallet(drift(), OWNER_EOA, null)).toBe(true);
  });

  it("accepts the Safe predicted from that EOA", () => {
    expect(isIdentitysOwnWallet(drift(), OWNER_SAFE, OWNER_SAFE)).toBe(true);
  });

  it("ignores case on both sides", () => {
    expect(isIdentitysOwnWallet(drift(), OWNER_SAFE.toUpperCase(), OWNER_SAFE)).toBe(true);
    expect(isIdentitysOwnWallet(drift(), OWNER_EOA.toUpperCase(), null)).toBe(true);
  });

  it("refuses a wallet the user reached some other way", () => {
    expect(isIdentitysOwnWallet(drift(), STRANGER, OWNER_SAFE)).toBe(false);
  });

  it("refuses when the prediction could not be computed", () => {
    // null is "not proven", never "close enough" — an unavailable prediction
    // must not authorise moving somebody's account.
    expect(isIdentitysOwnWallet(drift(), OWNER_SAFE, null)).toBe(false);
  });

  it("refuses the linked address itself — there is nothing to move", () => {
    expect(isIdentitysOwnWallet(drift(), LINKED, null)).toBe(false);
  });
});
