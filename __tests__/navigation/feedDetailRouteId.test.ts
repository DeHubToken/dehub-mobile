import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommonActions, StackRouter, type StackNavigationState, type ParamListBase } from "@react-navigation/native";
import { feedDetailRouteId } from "../../navigation/feedDetailRouteId";

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("feedDetailRouteId", () => {
  it("reads the params in the same order as FeedDetailScreen", () => {
    expect(feedDetailRouteId({ tokenId: "7", id: "8", postId: "9" })).toBe("7");
    expect(feedDetailRouteId({ id: "8", postId: "9" })).toBe("8");
    expect(feedDetailRouteId({ postId: "9", videoId: "10" })).toBe("9");
    expect(feedDetailRouteId({ videoId: "10" })).toBe("10");
    expect(feedDetailRouteId({ nft: { tokenId: 11, id: 12 } })).toBe("11");
    expect(feedDetailRouteId({ nft: { id: 12 } })).toBe("12");
  });

  it("gives a number and a string for the same post the same id", () => {
    expect(feedDetailRouteId({ tokenId: 42 })).toBe(feedDetailRouteId({ postId: "42" }));
  });

  it("has no id when the params carry no post", () => {
    expect(feedDetailRouteId(undefined)).toBeUndefined();
    expect(feedDetailRouteId({ commentId: "3" })).toBeUndefined();
    expect(feedDetailRouteId({ tokenId: "" })).toBeUndefined();
  });

  it("is the FeedDetail screen's getId", () => {
    const navigator = readSource("navigation/AppNavigator.tsx");
    const screen = navigator.slice(
      navigator.indexOf("name={ScreenNames.FeedDetail}"),
      navigator.indexOf("name={ScreenNames.PostInfo}"),
    );
    expect(screen).toContain("getId={({ params }) => feedDetailRouteId(params)}");
  });
});

describe("opening a post from a post", () => {
  const router = StackRouter({});
  const options = {
    routeNames: ["Home", "FeedDetail"],
    routeParamList: {},
    // The same getId the FeedDetail screen is given in AppNavigator.
    routeGetIdList: {
      FeedDetail: ({ params }: { params?: object }) => feedDetailRouteId(params),
    },
  };
  const navigate = (state: StackNavigationState<ParamListBase>, params: object) =>
    router.getStateForAction(
      state,
      CommonActions.navigate("FeedDetail", params),
      options,
    ) as StackNavigationState<ParamListBase>;

  const start = router.getInitialState(options);

  it("pushes a new page instead of swapping the open one's params", () => {
    const a = navigate(start, { postId: "1" });
    const b = navigate(a, { postId: "2" });

    expect(b.routes.map((r) => r.name)).toEqual(["Home", "FeedDetail", "FeedDetail"]);
    expect(b.routes[1].key).toBe(a.routes[1].key);
    expect(b.routes[1].params).toEqual({ postId: "1" });
    expect(b.routes[2].params).toEqual({ postId: "2" });
  });

  it("keeps a re-tap of the open post on the same page", () => {
    const a = navigate(start, { postId: "1" });
    const again = navigate(a, { tokenId: 1 });

    expect(again.routes).toHaveLength(2);
    expect(again.routes[1].key).toBe(a.routes[1].key);
  });

  it("brings a post already in the stack back to the top", () => {
    const a = navigate(start, { postId: "1" });
    const b = navigate(a, { postId: "2" });
    const backToA = navigate(b, { tokenId: "1" });

    expect(backToA.routes).toHaveLength(3);
    expect(backToA.routes[2].key).toBe(a.routes[1].key);
    expect(backToA.routes[1].key).toBe(b.routes[2].key);
  });
});
