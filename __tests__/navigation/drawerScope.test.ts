import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("app drawer scope", () => {
  it("owns the drawer above the root stack so Profile can open it", () => {
    const appNavigator = readSource("navigation/AppNavigator.tsx");
    const bottomTabs = readSource("navigation/BottomTabNavigator.tsx");

    expect(appNavigator).toContain("<DrawerProvider>");
    expect(appNavigator).toContain(
      "<AppDrawer visible={drawerOpen} onClose={closeDrawer} />",
    );
    expect(bottomTabs).not.toContain("<DrawerProvider>");
    expect(bottomTabs).not.toContain("<AppDrawer");
  });

  it("keeps Post opposite Log out in the signed-in drawer footer", () => {
    const drawer = readSource("components/Home/AppDrawer.tsx");

    expect(drawer).toContain("onPress={handlePost}");
    expect(drawer).toContain("navigate(ScreenNames.Upload)");
    expect(drawer).toContain('justifyContent: "space-between"');
  });

  it("uses the ready root navigator for the signed-out sign-in action", () => {
    const drawer = readSource("components/Home/AppDrawer.tsx");

    expect(drawer).toContain('import { navigationRef } from "../../App"');
    expect(drawer).toContain("const handleSignIn = useCallback");
    expect(drawer).toContain("navigationRef.navigate(ScreenNames.SignIn as never)");
    expect(drawer).toContain("onPress={handleSignIn}");
  });
});
