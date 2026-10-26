import {
  __resetPhoneStudioForTests,
  backgroundRemovalSupported,
  getFrameSize,
  phoneStudioSupported,
  resetStudio,
  setBackground,
  setCard,
  setOverlay,
} from "../../libs/phoneStudio";

afterEach(() => __resetPhoneStudioForTests());

describe("phoneStudio on a binary without the studio", () => {
  beforeEach(() => __resetPhoneStudioForTests(null));

  it("reports nothing supported", () => {
    expect(phoneStudioSupported()).toBe(false);
    expect(backgroundRemovalSupported()).toBe(false);
  });

  it("resolves every call as a no-op", async () => {
    await expect(setBackground("blur")).resolves.toBeUndefined();
    await expect(setOverlay("/tmp/a.png")).resolves.toBeUndefined();
    await expect(setCard(null)).resolves.toBeUndefined();
    await expect(resetStudio()).resolves.toBeUndefined();
    await expect(getFrameSize()).resolves.toBeNull();
  });
});

describe("phoneStudio with the native module", () => {
  const native = {
    getConstants: () => ({ version: 1, segmentation: true }),
    setBackground: jest.fn(async () => undefined),
    setOverlay: jest.fn(async () => undefined),
    setCard: jest.fn(async () => undefined),
    getFrameSize: jest.fn(async () => ({ width: 720, height: 1280 })),
    reset: jest.fn(async () => undefined),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPhoneStudioForTests(native);
  });

  it("reports support from the module's constants", () => {
    expect(phoneStudioSupported()).toBe(true);
    expect(backgroundRemovalSupported()).toBe(true);
  });

  it("passes nulls, not undefined, across the bridge", async () => {
    await setBackground("blur");
    expect(native.setBackground).toHaveBeenCalledWith("blur", null, null);
    await setBackground("image", "#000000", "file:///bg.jpg");
    expect(native.setBackground).toHaveBeenLastCalledWith("image", "#000000", "file:///bg.jpg");
  });

  it("crossfades a card unless told not to", async () => {
    await setCard("/a.png");
    expect(native.setCard).toHaveBeenLastCalledWith("/a.png", true);
    await setCard("/b.png", { fade: false });
    expect(native.setCard).toHaveBeenLastCalledWith("/b.png", false);
  });

  it("reads the frame size, and treats a zero size as unknown", async () => {
    await expect(getFrameSize()).resolves.toEqual({ width: 720, height: 1280 });
    native.getFrameSize.mockResolvedValueOnce({ width: 0, height: 0 });
    await expect(getFrameSize()).resolves.toBeNull();
  });

  it("does not claim background removal where segmentation is missing", () => {
    __resetPhoneStudioForTests({ ...native, getConstants: () => ({ version: 1, segmentation: false }) });
    expect(phoneStudioSupported()).toBe(true);
    expect(backgroundRemovalSupported()).toBe(false);
  });
});
