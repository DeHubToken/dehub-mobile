import { readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const reportBug = read("components/Settings/ReportBugModal.tsx");
const ens = read("components/Settings/EnsHandleSection.tsx");
const postInfo = read("screens/PostInfoScreen.tsx");
const showcase = read("components/Badge/showcaseUi.tsx");

// Button rows sized for English run off the panel edge in longer locales
// (de, fr, ru, uk). They wrap onto a second line instead, spaced by gap.
describe("button rows wrap in longer languages", () => {
  it("lets the Report a bug buttons wrap, spaced by gap rather than margins", () => {
    expect(reportBug).toContain('<View className="flex-row flex-wrap justify-end gap-2">');
    const row = reportBug.slice(reportBug.indexOf("flex-row flex-wrap justify-end gap-2"));
    const buttons = row.match(/className="h-11 px-4[^"]*"/g) ?? [];
    expect(buttons).toHaveLength(3);
    for (const cls of buttons) expect(cls).not.toMatch(/\bmr-2\b/);
  });

  it("lets the ENS sign and copy buttons wrap, spaced by gap rather than margins", () => {
    expect(ens).toMatch(
      /<View className="flex-row flex-wrap items-center gap-2 mt-2">\s+\{holderIsThisSession \?/,
    );
    expect(ens).toContain("className={`px-4 py-2.5 rounded-xl bg-white ${busy");
    expect(ens).not.toContain("`mr-2 px-4 py-2.5 rounded-xl bg-white");
  });

  it("shrinks only the fractions text so the Sell button stays inside the card", () => {
    expect(postInfo).toMatch(
      /<Text style=\{\[styles\.value, \{ flexShrink: 1 \}\]\}>\s+\{t\("postInfo\.yourFractions"/,
    );
    const shared = postInfo.match(/^\s+value: \{[^}]*\}/m)?.[0] ?? "";
    expect(shared).toContain("fontSize: 15");
    expect(shared).not.toContain("flexShrink");
  });

  it("gives the showcase title enough line height for accented capitals", () => {
    const title = showcase.match(/\btitle: \{[^}]*\}/)?.[0] ?? "";
    const fontSize = Number(title.match(/fontSize: (\d+)/)?.[1]);
    const lineHeight = Number(title.match(/lineHeight: (\d+)/)?.[1]);
    expect(fontSize).toBe(22);
    // Exo Bold needs about 1.33x its size for a full line; less clips accents
    // on capitals (É, Ü, Å) and Vietnamese stacked marks.
    expect(lineHeight).toBeGreaterThanOrEqual(Math.ceil(fontSize * 1.33));
  });
});
