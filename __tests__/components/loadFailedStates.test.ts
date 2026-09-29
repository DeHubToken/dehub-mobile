/**
 * A failed load is not an empty result.
 * =====================================
 * Each of these screens used to fall through to its "you have none" copy when
 * its request failed: SuperPowers told a badge holder to buy DHB, Active
 * sessions said nothing was signed in, and the Fractions tabs said the wallet
 * held nothing and the market had never traded. Each now shows the load-failed
 * line with a retry, and only while there is nothing cached to show instead.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("SuperPowers allowance panel", () => {
  const src = readSource("screens/SuperPowersScreen.tsx");

  it("reads the status query's error flag", () => {
    expect(src).toMatch(/isError:\s*statusFailed/);
  });

  it("shows load-failed with a retry between the tier panel and the no-badge panel", () => {
    const tier = src.indexOf("status?.tier ? (");
    const failed = src.indexOf("statusFailed && !status ? (");
    const noBadge = src.indexOf('t("superpowers.teamUpOpenToAll")');
    expect(tier).toBeGreaterThan(-1);
    expect(failed).toBeGreaterThan(tier);
    expect(noBadge).toBeGreaterThan(failed);

    const branch = src.slice(failed, noBadge);
    expect(branch).toContain('t("superpowers.loadFailed")');
    expect(branch).toContain('t("common.tryAgain")');
    expect(branch).toContain("refetchStatus()");
  });
});

describe("Active sessions", () => {
  const src = readSource("screens/ActiveSessionsScreen.tsx");

  it("tracks a load error, set on failure and cleared on success", () => {
    expect(src).toContain("const [loadError, setLoadError] = useState(false);");
    const success = src.indexOf("setSessions(data);");
    const failure = src.indexOf("toastError(e, t('sessions.loadFailed'))");
    expect(src.indexOf("setLoadError(false);", success)).toBeGreaterThan(success);
    expect(src.lastIndexOf("setLoadError(true);", failure)).toBeGreaterThan(success);
  });

  it("drops the '0 active sessions' header while the error shows", () => {
    expect(src).toContain("if (loadError && sessions.length === 0) return null;");
  });

  it("renders the retry state instead of 'No active sessions' on failure", () => {
    expect(src).toContain("<LoadErrorState message={t('sessions.loadFailed')} onRetry={handleRefresh} />");
    expect(src.indexOf("loadError ? (")).toBeLessThan(src.indexOf('t("sessions.noActive")'));
  });
});

describe("Fractions portfolio tab", () => {
  const src = readSource("components/Fractions/PortfolioTab.tsx");

  it("shows load-failed with a retry before the 'none held' copy, only when nothing is cached", () => {
    const failed = src.indexOf("portfolio.isError && positions.length === 0 ? (");
    const none = src.indexOf('t("fractions.noneHeldYet")');
    expect(failed).toBeGreaterThan(-1);
    expect(none).toBeGreaterThan(failed);

    const branch = src.slice(failed, none);
    expect(branch).toContain('t("fractions.loadFailed")');
    expect(branch).toContain('t("common.retry")');
    expect(branch).toContain("portfolio.refetch()");
  });
});

describe("Fractions activity tab", () => {
  const src = readSource("components/Fractions/ActivityTab.tsx");

  it("reads the error flag and shows load-failed with a retry in the empty slot", () => {
    expect(src).toMatch(/isError,[^}]*\}\s*=\s*useRecentTrades/);
    const failed = src.indexOf(") : isError ? (");
    const none = src.indexOf('t("fractions.nothingTradedYet")');
    expect(failed).toBeGreaterThan(-1);
    expect(none).toBeGreaterThan(failed);

    const branch = src.slice(failed, none);
    expect(branch).toContain('t("fractions.loadFailed")');
    expect(branch).toContain('t("common.retry")');
    expect(branch).toContain("refetch()");
  });

  it("does not blank cached trades when a refetch fails", () => {
    expect(src).toContain("data={isLoading ? [] : trades}");
    expect(src).not.toMatch(/data=\{[^}]*isError/);
  });
});
