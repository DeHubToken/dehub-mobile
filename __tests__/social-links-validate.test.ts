jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("react-native", () => ({ Linking: { openURL: jest.fn(), canOpenURL: jest.fn() }, Platform: { OS: "ios", select: (o: any) => o.ios } }));
import { validateSocial } from "../libs/links.utils";

describe("validateSocial accepts pasted links", () => {
  it.each([
    ["telegram", "t.me/@Araf23", "https://t.me/Araf23"],
    ["telegram", "Araf23", "https://t.me/Araf23"],
    ["x", "https://x.com/araf2343?s=21", "https://x.com/araf2343?s=21"],
    ["x", "mobile.twitter.com/araf", "https://mobile.twitter.com/araf"],
    ["instagram", "www.instagram.com/araf", "https://www.instagram.com/araf"],
    ["tiktok", "@araf", "https://tiktok.com/@araf"],
  ] as const)("%s %s", (platform, input, expected) => {
    const r = validateSocial(platform, input);
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe(expected);
  });

  it("still refuses a different site", () => {
    expect(validateSocial("instagram", "https://evil.example/araf").valid).toBe(false);
  });
});
