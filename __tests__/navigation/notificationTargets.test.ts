import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommonActions, StackRouter } from "@react-navigation/routers";

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, "../..", path), "utf8");

/**
 * Notification taps have to land where the thing they are about lives. Each
 * of these used to open the right screen on the wrong tab, or nothing at all.
 */
describe("notification tap targets", () => {
  it("opens Settings on Assets for badge lending, from the row and the push", () => {
    const screen = readSource("screens/NotificationScreen.tsx");
    const push = readSource("services/push/PushNotificationsProvider.tsx");

    expect(screen).toContain(
      "navigation.navigate(ScreenNames.AccountSettings, { initialTab: 'assets' });",
    );
    expect(push).toContain(
      "navigation.navigate(ScreenNames.AccountSettings, { initialTab: 'assets' });",
    );
    expect(screen).not.toContain("navigate(ScreenNames.AccountSettings as never)");
    expect(push).not.toContain("navigate(ScreenNames.AccountSettings);");
  });

  it("opens Settings on Assets from the wrong-network pay-per-view gate", () => {
    const videoArea = readSource("components/VideoPlayer/VideoArea.tsx");

    expect(videoArea).toContain(
      'navigation.navigate(ScreenNames.AccountSettings, { initialTab: "assets" });',
    );
  });

  it("opens Usernames on Offers for an offer row, including on an open screen", () => {
    const screen = readSource("screens/NotificationScreen.tsx");
    const usernames = readSource("screens/UsernamesScreen.tsx");
    const types = readSource("navigation/types.ts");

    expect(screen).toContain("navigation.navigate(ScreenNames.Usernames, { tab: 'offers' });");
    expect(types).toContain(
      '[ScreenNames.Usernames]: { handle?: string; tab?: "browse" | "mine" | "sell" | "offers" } | undefined;',
    );
    // Starts from the param, guarded, so a junk ?tab= from a link is ignored.
    expect(usernames).toContain(
      'useState<UsernamesTab>(() => asUsernamesTab(route.params?.tab) ?? "browse")',
    );
    // And re-selects when navigate() reuses an already-open Usernames screen.
    expect(usernames).toMatch(
      /useEffect\(\(\) => \{\s*const next = asUsernamesTab\(routeParams\?\.tab\);\s*if \(next\) setTab\(next\);\s*\}, \[routeParams\]\);/,
    );
  });

  it("makes DAO rows tappable and sends them to the DAO screen", () => {
    const screen = readSource("screens/NotificationScreen.tsx");

    expect(screen).toContain("if (String(typeStr).startsWith('dao_')) return true;");
    expect(screen).toMatch(
      /default:[\s\S]*?if \(String\(type\)\.startsWith\('dao_'\)\) \{\s*navigation\.navigate\(ScreenNames\.Dao\);\s*break;\s*\}/,
    );
  });

  describe("new-message push", () => {
    const push = readSource("services/push/PushNotificationsProvider.tsx");

    it("reads the conversation from the /dm/<id> deep link before falling back", () => {
      expect(push).toContain("deepLink.match(/\\/dm\\/([^/?#]+)/)?.[1]");
      expect(push).toContain(
        "const chatId = conversationId || conversationIdFromDeepLink(data.deepLink);",
      );

      const re = /\/dm\/([^/?#]+)/;
      expect("/dm/abc123".match(re)?.[1]).toBe("abc123");
      expect("https://dehub.io/app/dm/abc123?ref=push".match(re)?.[1]).toBe("abc123");
      expect("/dm/".match(re)).toBeNull();
    });

    it("names Root and pops back to it for the Messages list", () => {
      expect(push).toContain(
        "navigation.navigate(ScreenNames.Root, { screen: ScreenNames.DM }, { pop: true });",
      );
      expect(push).not.toContain("navigation.navigate(ScreenNames.DM);");
    });

    // The App stack holds Root (the tab navigator) plus pushed pages. DM is a
    // tab inside Root, so the stack cannot resolve it by name.
    const options = {
      routeNames: ["Root", "Leaderboard", "Chat"],
      routeParamList: {},
      routeGetIdList: {},
    };
    const router = StackRouter({});
    const onPushedPage = () =>
      router.getStateForAction(
        router.getInitialState(options),
        CommonActions.navigate("Leaderboard"),
        options,
      )!;

    it("was dropped by the App stack when it named DM directly", () => {
      const state = onPushedPage();
      expect(state.routes.map((r) => r.name)).toEqual(["Root", "Leaderboard"]);
      expect(router.getStateForAction(state as any, CommonActions.navigate("DM"), options)).toBeNull();
    });

    it("goes back to the existing Root instead of stacking a second one", () => {
      const state = onPushedPage();
      const next = router.getStateForAction(
        state as any,
        CommonActions.navigate("Root", { screen: "DM" }, { pop: true }),
        options,
      )!;
      expect(next.routes.map((r) => r.name)).toEqual(["Root"]);
      expect(next.routes[0].params).toEqual({ screen: "DM" });

      // Without pop the stack pushes a second tab navigator on top.
      const pushed = router.getStateForAction(
        state as any,
        CommonActions.navigate("Root", { screen: "DM" }),
        options,
      )!;
      expect(pushed.routes.map((r) => r.name)).toEqual(["Root", "Leaderboard", "Root"]);
    });
  });
});
