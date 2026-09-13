jest.mock("expo-updates", () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

import * as Updates from "expo-updates";
import {
  APPLY_AFTER_BACKGROUND_MS,
  __resetOtaStateForTests,
  applyOtaUpdateIfReady,
  checkForOtaUpdate,
  isUpdateReady,
} from "../../libs/otaUpdates";

const mocked = Updates as unknown as {
  checkForUpdateAsync: jest.Mock;
  fetchUpdateAsync: jest.Mock;
  reloadAsync: jest.Mock;
};

describe("over-the-air updates on foreground", () => {
  beforeEach(() => {
    __resetOtaStateForTests();
    jest.clearAllMocks();
    (global as any).__DEV__ = false;
    mocked.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mocked.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    mocked.reloadAsync.mockResolvedValue(undefined);
  });

  it("downloads an available update and marks it ready", async () => {
    await checkForOtaUpdate(1_000_000);
    expect(mocked.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(isUpdateReady()).toBe(true);
  });

  it("does not hit the update server more than once per interval", async () => {
    mocked.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await checkForOtaUpdate(1_000_000);
    await checkForOtaUpdate(1_000_000 + 60_000);
    expect(mocked.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    await checkForOtaUpdate(1_000_000 + 16 * 60_000);
    expect(mocked.checkForUpdateAsync).toHaveBeenCalledTimes(2);
  });

  it("applies a ready update only after a long enough absence", async () => {
    await checkForOtaUpdate(1_000_000);
    expect(await applyOtaUpdateIfReady(APPLY_AFTER_BACKGROUND_MS - 1)).toBe(false);
    expect(mocked.reloadAsync).not.toHaveBeenCalled();
    expect(await applyOtaUpdateIfReady(APPLY_AFTER_BACKGROUND_MS)).toBe(true);
    expect(mocked.reloadAsync).toHaveBeenCalledTimes(1);
    expect(isUpdateReady()).toBe(false);
  });

  it("never reloads when nothing was downloaded", async () => {
    expect(await applyOtaUpdateIfReady(10 * APPLY_AFTER_BACKGROUND_MS)).toBe(false);
    expect(mocked.reloadAsync).not.toHaveBeenCalled();
  });

  it("swallows a failed check so the next foreground retries", async () => {
    mocked.checkForUpdateAsync.mockRejectedValue(new Error("offline"));
    await expect(checkForOtaUpdate(1_000_000)).resolves.toBeUndefined();
    expect(isUpdateReady()).toBe(false);
  });
});
