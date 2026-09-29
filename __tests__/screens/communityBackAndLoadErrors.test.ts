import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const en = JSON.parse(readSource("i18n/locales/en.json"));
const hasKey = (key: string) =>
  typeof key.split(".").reduce<any>((node, part) => node?.[part], en) === "string";

describe("community page back navigation and load errors", () => {
  const detail = readSource("screens/CommunityDetailScreen.tsx");
  const invite = readSource("screens/CommunityInviteScreen.tsx");
  const dangerZone = readSource("components/Communities/manage/DangerZone.tsx");

  const loadStart = detail.indexOf("const load = useCallback(");
  const loadBody = detail.slice(loadStart, detail.indexOf("}, [slug, walletAddress]);", loadStart));
  const catchBody = loadBody.slice(loadBody.indexOf("} catch {"));

  it("keeps the back arrow on the not-found page", () => {
    expect(detail).not.toContain("canGoBack={false}");
  });

  it("goes back to Communities instead of stacking a new one on the dead page", () => {
    expect(detail).toContain("navigation.popTo(ScreenNames.Communities)");
    expect(detail).not.toContain("navigation.navigate(ScreenNames.Communities)");
    expect(invite).toContain("navigation.popTo(ScreenNames.Communities)");
    expect(invite).not.toContain("navigation.navigate(ScreenNames.Communities)");
    expect(dangerZone).toContain("navigation.popTo(ScreenNames.Communities)");
    expect(dangerZone).not.toContain("navigation.navigate(ScreenNames.Communities)");
  });

  it("treats a failed read as a load error, not as 'not found'", () => {
    expect(catchBody).toContain("setLoadError(true)");
    // A failed refresh must not blank a page that is already showing.
    expect(catchBody).not.toMatch(/^\s*setCommunity\(null\);/m);
    expect(catchBody).toContain("if (loadedSlugRef.current !== slug) setCommunity(null);");
    // The community only lands after its sub-reads, so a half-failed first load never renders.
    expect(loadBody.indexOf("setCommunity(c)")).toBeGreaterThan(loadBody.indexOf("await Promise.all("));
  });

  it("lets the roster and pin reads fail without failing the page, but not membership", () => {
    expect(loadBody).toContain("getCommunityMembers(c.id, walletAddress || null).catch(() => null)");
    expect(loadBody).toContain("getPinnedCommunities(walletAddress).catch(() => null)");
    expect(loadBody).toContain(
      "walletAddress ? getCommunityMembership(c.id, walletAddress) : Promise.resolve(null)",
    );
    expect(loadBody).toContain("if (m) setMembers(m);");
    expect(loadBody).toContain("if (pins) setIsPinned(");
  });

  it("shows a retry with a back arrow when the community could not be read", () => {
    const notFound = detail.indexOf("if (!community) {");
    const errorBranch = detail.indexOf("if (loadError) {", notFound);
    expect(errorBranch).toBeGreaterThan(notFound);
    expect(errorBranch).toBeLessThan(detail.indexOf('t("communities.communityNotFound")'));
    const branch = detail.slice(errorBranch, detail.indexOf("</View>", errorBranch));
    expect(branch).toContain('<ScreenHeader title={t("communities.title")} />');
    expect(branch).toContain('message={t("communities.loadFailed")}');
    expect(branch).toContain("setLoading(true);");
    expect(branch).toContain("void load();");
  });

  it("lifts the About tab above the keyboard by the root inset only", () => {
    expect(detail).toContain("const keyboardOffset = useKeyboardOffset();");
    expect(detail.indexOf("const keyboardOffset = useKeyboardOffset();")).toBeLessThan(
      detail.indexOf("if (loading) {"),
    );
    const kav = detail.indexOf("<KeyboardAvoidingView");
    expect(kav).toBeGreaterThan(-1);
    expect(detail.slice(kav, detail.indexOf("<ScrollView", kav))).toContain(
      "keyboardVerticalOffset={keyboardOffset}",
    );
    expect(detail.indexOf("</ScrollView>", kav)).toBeLessThan(
      detail.indexOf("</KeyboardAvoidingView>", kav),
    );
    expect(detail).not.toContain("SCREEN_HEADER_HEIGHT");
  });

  it("offers a retry on the invite page when the preview read fails", () => {
    expect(invite).toContain("if (!cancelled) setLoadError(true);");
    expect(invite).not.toContain("if (!cancelled) setFailed(true);");
    expect(invite).toContain("}, [code, reloadKey]);");
    const errorBranch = invite.indexOf("if (loadError) {");
    expect(errorBranch).toBeGreaterThan(-1);
    expect(errorBranch).toBeLessThan(invite.indexOf("if (failed || !preview || !preview.is_valid) {"));
    const branch = invite.slice(errorBranch, invite.indexOf("if (failed ||", errorBranch));
    expect(branch).toContain('t("common.somethingWentWrong")');
    expect(branch).toContain('t("common.retry")');
    expect(branch).toContain("setReloadKey((k) => k + 1)");
    expect(branch).toContain("onPress={goToCommunities}");
  });

  it("only uses strings that already exist", () => {
    ["communities.loadFailed", "common.somethingWentWrong", "common.retry", "common.tryAgain"].forEach(
      (key) => expect(hasKey(key)).toBe(true),
    );
  });
});
