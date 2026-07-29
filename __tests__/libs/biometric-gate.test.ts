/**
 * Policy tests for the wallet key gate.
 *
 * The distinction these pin down is the whole point of the module: a device that
 * CANNOT verify is treated differently from a user who WON'T. Getting them the
 * same way round either locks people out of their own funds (blocking the first)
 * or hands the key to anyone who dismisses a prompt (permitting the second).
 */
import * as LocalAuthentication from "expo-local-authentication";
import {
  requireDeviceOwner,
  getBiometricCapability,
  BiometricRejectedError,
  BiometricUnavailableError,
} from "../../libs/biometric-gate";

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

const mocked = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const { SecurityLevel } = LocalAuthentication;

/** Describe a device: what hardware it has, what's enrolled, what lock is set. */
function device(opts: { hardware: boolean; enrolled: boolean; level: number }) {
  mocked.hasHardwareAsync.mockResolvedValue(opts.hardware);
  mocked.isEnrolledAsync.mockResolvedValue(opts.enrolled);
  mocked.getEnrolledLevelAsync.mockResolvedValue(opts.level as never);
}

const FACE_ID = { hardware: true, enrolled: true, level: SecurityLevel.BIOMETRIC_STRONG };
const PASSCODE_ONLY = { hardware: true, enrolled: false, level: SecurityLevel.SECRET };
const NO_LOCK_AT_ALL = { hardware: false, enrolled: false, level: SecurityLevel.NONE };
const HARDWARE_BUT_NOTHING_SET = { hardware: true, enrolled: false, level: SecurityLevel.NONE };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requireDeviceOwner — a device that cannot verify", () => {
  it("permits the release rather than locking the user out", async () => {
    device(NO_LOCK_AT_ALL);
    await expect(requireDeviceOwner("Unlock your wallet")).resolves.toBe("unenforceable");
  });

  it("does not even try to prompt, since there is nothing to prompt for", async () => {
    device(NO_LOCK_AT_ALL);
    await requireDeviceOwner("Unlock your wallet");
    expect(mocked.authenticateAsync).not.toHaveBeenCalled();
  });

  it("treats biometric hardware with nothing enrolled and no passcode the same way", async () => {
    // Owning a fingerprint sensor you have never set up is not a lock.
    device(HARDWARE_BUT_NOTHING_SET);
    await expect(requireDeviceOwner("Unlock your wallet")).resolves.toBe("unenforceable");
  });
});

describe("requireDeviceOwner — a device that can verify", () => {
  it("returns verified when the owner passes", async () => {
    device(FACE_ID);
    mocked.authenticateAsync.mockResolvedValue({ success: true } as never);
    await expect(requireDeviceOwner("Unlock your wallet")).resolves.toBe("verified");
  });

  it("prompts a passcode-only device instead of waving it through", async () => {
    // A PIN still proves device ownership, so it must be demanded, not skipped.
    device(PASSCODE_ONLY);
    mocked.authenticateAsync.mockResolvedValue({ success: true } as never);
    await expect(requireDeviceOwner("Unlock your wallet")).resolves.toBe("verified");
    expect(mocked.authenticateAsync).toHaveBeenCalled();
  });

  it("blocks when the owner cancels — refusing is not the same as being unable", async () => {
    device(FACE_ID);
    mocked.authenticateAsync.mockResolvedValue({ success: false, error: "user_cancel" } as never);
    await expect(requireDeviceOwner("Unlock your wallet")).rejects.toBeInstanceOf(
      BiometricRejectedError,
    );
  });

  it("blocks when a capable device cannot present the prompt", async () => {
    // Falling open here would make "break the prompt" a way to get the key.
    device(FACE_ID);
    mocked.authenticateAsync.mockRejectedValue(new Error("no activity"));
    await expect(requireDeviceOwner("Unlock your wallet")).rejects.toBeInstanceOf(
      BiometricUnavailableError,
    );
  });

  it("passes the caller's purpose through to the system prompt", async () => {
    device(FACE_ID);
    mocked.authenticateAsync.mockResolvedValue({ success: true } as never);
    await requireDeviceOwner("Approve this tip");
    expect(mocked.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: "Approve this tip" }),
    );
  });

  it("leaves the OS passcode fallback available", async () => {
    // Someone whose face will not read must still have a way through.
    device(FACE_ID);
    mocked.authenticateAsync.mockResolvedValue({ success: true } as never);
    await requireDeviceOwner("Unlock your wallet");
    expect(mocked.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: false }),
    );
  });
});

describe("getBiometricCapability", () => {
  it("reports a passcode-only device as usable but not biometric", async () => {
    device(PASSCODE_ONLY);
    await expect(getBiometricCapability()).resolves.toEqual(
      expect.objectContaining({ usable: true, passcodeOnly: true }),
    );
  });

  it("reports an unlockable device as unusable", async () => {
    device(NO_LOCK_AT_ALL);
    await expect(getBiometricCapability()).resolves.toEqual(
      expect.objectContaining({ usable: false }),
    );
  });

  it("degrades to unusable rather than throwing when the platform errors", async () => {
    mocked.hasHardwareAsync.mockRejectedValue(new Error("module missing"));
    mocked.isEnrolledAsync.mockRejectedValue(new Error("module missing"));
    mocked.getEnrolledLevelAsync.mockRejectedValue(new Error("module missing"));
    await expect(getBiometricCapability()).resolves.toEqual(
      expect.objectContaining({ usable: false }),
    );
  });
});
