import { isReservedUsername } from "../../libs/reserved-usernames";

describe("isReservedUsername brand names", () => {
  it("refuses riftn and its lookalikes", () => {
    for (const name of [
      "riftn", "RIFTN", "@Riftn", "riftn_", "riftn1", "riftn_official",
      "riftnhq", "r1ftn", "rlftn", "official_riftn", "the_riftn", "realriftn",
    ]) {
      expect(isReservedUsername(name)).toBe(true);
    }
  });

  it("leaves names that only contain riftn mid-word alone", () => {
    for (const name of ["driftnet", "swiftnode", "rift", "rif_tom"]) {
      expect(isReservedUsername(name)).toBe(false);
    }
  });
});
