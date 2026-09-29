/**
 * KeyboardAvoidingView measures itself with `onLayout`, which is relative to
 * its parent. On these screens the view sits below a ScreenHeader inside the
 * same parent, so its frame already includes the header. Adding the header
 * height to `keyboardVerticalOffset` as well counted it twice and left a
 * header-tall blank band between the form and the keyboard.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const SCREENS = [
  "screens/CareersScreen.tsx",
  "screens/CreatorsScreen.tsx",
  "screens/GovernanceProposalScreen.tsx",
  "screens/ListingDetailScreen.tsx",
  "screens/EditProfileScreen.tsx",
];

describe("keyboard offset on screens with a ScreenHeader above the form", () => {
  it.each(SCREENS)("%s renders the header as a sibling above the keyboard view", (path) => {
    const source = read(path);
    const header = source.indexOf("<ScreenHeader");
    const kav = source.indexOf("<KeyboardAvoidingView");
    expect(header).toBeGreaterThan(-1);
    expect(kav).toBeGreaterThan(header);
  });

  it.each(SCREENS)("%s passes only the status-bar inset", (path) => {
    const source = read(path);
    expect(source).toContain("useKeyboardOffset()");
    expect(source).not.toContain("SCREEN_HEADER_HEIGHT");
    expect(source).toContain("keyboardVerticalOffset={keyboardOffset}");
  });

  it("uses the same offset on Android as on iOS in Edit profile", () => {
    const source = read("screens/EditProfileScreen.tsx");
    expect(source).not.toMatch(/keyboardVerticalOffset=\{Platform\.OS/);
  });

  it("lifts the Usernames sell form by the status-bar inset only", () => {
    const source = read("components/Usernames/SellUsernamePanel.tsx");
    expect(source).toContain("keyboardVerticalOffset={insets.top}");
    expect(source).not.toContain("SCREEN_HEADER_HEIGHT");
  });
});
