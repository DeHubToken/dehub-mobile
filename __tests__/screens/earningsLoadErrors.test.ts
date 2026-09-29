import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, "../..", path), "utf8");

// A failed earnings read used to render as "No income" and 0 DHB. Both screens
// now show Failed to load with a Retry, but only when there is nothing else to
// show: a failed refresh keeps the last good numbers.
describe("Command Centre load errors", () => {
  const screen = readSource("screens/CommandCentreScreen.tsx");

  it("shows the failure only when a query errored with no data", () => {
    expect(screen).toContain(
      "const incomeError = (tips.isError && !tips.data) || (ppv.isError && !ppv.data);",
    );
    expect(screen).toContain("const activityError = activity.isError && !activity.data;");
  });

  it("checks the income error after loading and before the empty state", () => {
    const loading = screen.indexOf("{incomeLoading ? (");
    const error = screen.indexOf(") : incomeError ? (");
    const empty = screen.indexOf(") : slices.length === 0 ? (");
    expect(loading).toBeGreaterThan(-1);
    expect(error).toBeGreaterThan(loading);
    expect(empty).toBeGreaterThan(error);
  });

  it("checks the activity error before the no-transactions copy", () => {
    const error = screen.indexOf(") : activityError ? (");
    expect(error).toBeGreaterThan(screen.indexOf("{activity.isLoading ? ("));
    expect(error).toBeLessThan(screen.indexOf('t("commandCentre.noTransactionsYet")'));
  });

  it("retries the queries that failed, with the shared strings", () => {
    expect(screen).toContain('t("common.failedToLoad")');
    expect(screen).toContain('t("common.retry")');
    expect(screen).toMatch(/incomeError \? \(\s*<LoadError\s+onRetry=\{\(\) => \{\s*void tips\.refetch\(\);\s*void ppv\.refetch\(\);/);
    expect(screen).toContain("<LoadError onRetry={() => void activity.refetch()} />");
  });
});

describe("Earnings load errors", () => {
  const screen = readSource("screens/EarningsScreen.tsx");

  it("keeps the previous lists when a read fails", () => {
    const check = screen.indexOf("if (tipErr || ppvErr) {");
    expect(check).toBeGreaterThan(-1);
    expect(screen.indexOf("setTips(")).toBeGreaterThan(check);
    expect(screen.indexOf("setPpv(")).toBeGreaterThan(check);
  });

  it("replaces the chart and stats with a failure card only when nothing is loaded", () => {
    expect(screen).toContain(
      "const showLoadError = loadError && tips.length === 0 && ppv.length === 0;",
    );
    const card = screen.indexOf("{showLoadError ? (");
    expect(card).toBeGreaterThan(-1);
    expect(card).toBeLessThan(screen.indexOf('t("earnings.incomeBreakdown")'));
    expect(screen).toContain("onPress={() => load()}");
    expect(screen).toContain("{recentTx.length === 0 && !loading && !showLoadError && (");
  });

  it("lifts the comparison inputs above the keyboard", () => {
    expect(screen).toContain("const keyboardOffset = useKeyboardOffset();");
    expect(screen).toMatch(
      /<KeyboardAvoidingView\s+style=\{\{ flex: 1, backgroundColor: "#010305" \}\}\s+behavior="padding"\s+keyboardVerticalOffset=\{keyboardOffset\}/,
    );
    expect(screen).toContain('keyboardShouldPersistTaps="handled"');
  });
});
