import { Platform } from "react-native";
import {
  isExternalContentLinkAvailable,
  launchExternalContentLink,
} from "../../modules/play-external-links";

describe("play-external-links", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    jest.dontMock("expo-modules-core");
    jest.resetModules();
  });

  it("never offers the link-out on iOS", async () => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    await expect(isExternalContentLinkAvailable()).resolves.toBe(false);
    await expect(launchExternalContentLink("https://dehub.io/premium")).resolves.toBe("unavailable");
  });

  it("fails closed on Android when the native module is missing", async () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    jest.doMock("expo-modules-core", () => ({
      requireNativeModule: () => {
        throw new Error("Cannot find native module 'PlayExternalLinks'");
      },
    }));
    await expect(isExternalContentLinkAvailable()).resolves.toBe(false);
    await expect(launchExternalContentLink("https://dehub.io/premium")).resolves.toBe("unavailable");
  });

  it("reports what Play decided when the module is there", async () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    const launch = jest.fn().mockResolvedValue({ status: "canceled", responseCode: 1 });
    jest.doMock("expo-modules-core", () => ({
      requireNativeModule: () => ({
        isAvailable: jest.fn().mockResolvedValue({ available: true, responseCode: 0 }),
        launch,
      }),
    }));
    await expect(isExternalContentLinkAvailable()).resolves.toBe(true);
    await expect(launchExternalContentLink("https://dehub.io/premium?plan=x")).resolves.toBe("canceled");
    expect(launch).toHaveBeenCalledWith("https://dehub.io/premium?plan=x", "gpt");
  });
});
