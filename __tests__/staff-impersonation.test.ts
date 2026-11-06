import { staffImpersonated } from "../libs/impersonation";

const MAL = "0x9324840523a5d17dd12a2f11a9472e5a199c1937";
const STRANGER = "0x1111111111111111111111111111111111111111";

describe("staffImpersonated", () => {
  it("flags copies of Mal and staff from another wallet", () => {
    for (const displayName of ["Mal", "MaI", "Mal | Riftn Founder", "mal.eth", "Мal"]) {
      expect(staffImpersonated({ address: STRANGER, displayName })).toBe("Mal");
    }
    expect(staffImpersonated({ address: STRANGER, displayName: "Riftn Support" })).toBe("Riftn");
  });

  it("never flags the owner or ordinary names", () => {
    expect(staffImpersonated({ address: MAL, displayName: "mal", username: "maldoteth" })).toBeNull();
    for (const displayName of ["Malek", "Malik", "Kemal", "Mal Jones"]) {
      expect(staffImpersonated({ address: STRANGER, displayName })).toBeNull();
    }
  });
});
