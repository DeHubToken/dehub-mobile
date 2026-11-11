import { readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const shell = read("components/Badge/ShowcaseShell.tsx");
const holder = read("components/Badge/BadgeShowcase.tsx");
const streamer = read("components/Badge/StreamerShowcase.tsx");

// The badge dock sits between the details and the action buttons, one even
// gap apart, with the buttons as the last row above the bottom edge.
describe("badge showcase layout", () => {
  it("draws the footer after the dock and gives the bottom gap to whichever is last", () => {
    expect(shell.indexOf("{footer ? (")).toBeGreaterThan(shell.indexOf("styles.dockWrap"));
    expect(shell).toMatch(/styles\.dockWrap, !footer && \{ marginBottom: bottomGap \}/);
    expect(shell).toMatch(/styles\.footerWrap, \{ marginBottom: bottomGap \}/);
    expect(shell).toMatch(/dockWrap: \{ marginTop: SECTION_GAP/);
    expect(shell).toMatch(/footerWrap: \{ marginTop: SECTION_GAP/);
  });

  it("puts both showcases' buttons in the footer, not the details column", () => {
    // The App Store build drops the holder footer (buy and docs) outside the
    // US storefront, where a web link-out is allowed.
    expect(holder).toMatch(/footer=\{IS_APP_STORE_BUILD && !purchaseOfferVisible\(\) \? undefined : \(api\) => <HolderActions api=\{api\} \/>\}/);
    expect(streamer).toMatch(/footer=\{\(api\) => <StreamerActions /);
    expect(holder).not.toMatch(/ui\.actions/);
    expect(streamer).not.toMatch(/ui\.actions/);
  });

  it("opens the badges chapter of the docs for the full breakdown", () => {
    expect(holder).toMatch(/\/docs\/dapps#badges/);
    expect(holder).not.toMatch(/ScreenNames\.Glossary/);
  });
});
