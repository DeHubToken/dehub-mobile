import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const signIn = read("screens/auth/SignInScreen.tsx");
const importWallet = read("screens/auth/ImportWalletScreen.tsx");
const setProfile = read("screens/auth/SetProfileScreen.tsx");

const skipOrCloseBody = (() => {
  const start = signIn.indexOf("const handleSkipOrClose = useCallback(");
  const end = signIn.indexOf("}, [", start);
  return signIn.slice(start, end);
})();

describe("sign-in sheet 'Continue exploring'", () => {
  it("closes the in-app sheet instead of resetting the whole app", () => {
    expect(skipOrCloseBody).toMatch(
      /navigation\.getState\(\)\?\.routeNames\?\.includes\(ScreenNames\.Root\)/,
    );
    expect(skipOrCloseBody).toMatch(
      /if \(inAppSheet && navigation\.canGoBack\(\)\) \{\s*navigation\.goBack\(\);\s*return;\s*\}/,
    );
  });

  it("still resets into the app from the launch sign-in, after the sheet check", () => {
    const goBackAt = skipOrCloseBody.indexOf("navigation.goBack()");
    const resetAt = skipOrCloseBody.indexOf("navigateToApp();");
    expect(goBackAt).toBeGreaterThan(-1);
    expect(resetAt).toBeGreaterThan(goBackAt);
  });

  it("bails out if the screen unmounted while skipAuth was awaited", () => {
    const skipAt = skipOrCloseBody.indexOf("await skipAuth();");
    const mountedAt = skipOrCloseBody.indexOf("if (!isMountedRef.current) return;");
    expect(skipAt).toBeGreaterThan(-1);
    expect(mountedAt).toBeGreaterThan(skipAt);
    expect(mountedAt).toBeLessThan(skipOrCloseBody.indexOf("inAppSheet"));
  });

  it("lists navigation as a dependency of the handler", () => {
    expect(signIn).toContain("}, [isFirstTimeUser, skipAuth, navigateToApp, navigation]);");
  });
});

describe("auth screens keyboard offset", () => {
  it.each([
    ["SignInScreen", signIn],
    ["ImportWalletScreen", importWallet],
    ["SetProfileScreen", setProfile],
  ])("%s passes the safe-area offset on both platforms", (_name, source) => {
    expect(source).toContain("keyboardVerticalOffset={keyboardOffset}");
    expect(source).not.toMatch(/keyboardVerticalOffset=\{Platform\.OS/);
  });

  it("import wallet and set profile take the offset from the shared hook", () => {
    for (const source of [importWallet, setProfile]) {
      expect(source).toContain('import { useKeyboardOffset } from "../../hooks/useKeyboardLayout";');
      expect(source).toContain("const keyboardOffset = useKeyboardOffset();");
    }
  });
});
