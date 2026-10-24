import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const signIn = read("screens/auth/SignInScreen.tsx");
const importWallet = read("screens/auth/ImportWalletScreen.tsx");
const setProfile = read("screens/auth/SetProfileScreen.tsx");

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
