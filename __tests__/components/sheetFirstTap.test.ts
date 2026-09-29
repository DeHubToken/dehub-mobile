import { readFileSync } from "fs";
import { join } from "path";

// Each of these sheets holds a TextInput and the buttons or rows you tap right
// after typing inside one ScrollView. With RN's default ("never") the first tap
// only closes the keyboard, so Confirm / Spend / a search result needs two taps.
const sheets = [
  ["components", "Usernames", "OffersPanel.tsx"],
  ["components", "common", "BoostSheet.tsx"],
  ["components", "common", "SpendPowerSheet.tsx"],
];

describe("sheets take the first tap after typing", () => {
  it.each(sheets)("%s/%s/%s lets taps through while the keyboard is up", (...parts) => {
    const source = readFileSync(join(process.cwd(), ...parts), "utf8");
    const tags = source.match(/<ScrollView\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag).toContain('keyboardShouldPersistTaps="handled"');
    }
  });
});
