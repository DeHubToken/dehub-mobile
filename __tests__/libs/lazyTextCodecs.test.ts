import { installLazyTextCodecs } from "../../libs/lazyTextCodecs";

describe("installLazyTextCodecs", () => {
  it("keeps a native codec and only fills the missing one", () => {
    const NativeEncoder = function NativeEncoder() {};
    const g: Record<string, any> = { TextEncoder: NativeEncoder };
    installLazyTextCodecs(g);
    expect(g.TextEncoder).toBe(NativeEncoder);
    expect(typeof g.TextDecoder).toBe("function");
  });

  it("does not load the polyfill until the global is read", () => {
    jest.isolateModules(() => {
      const factory = jest.fn(() => ({ TextEncoder: class {}, TextDecoder: class {} }));
      jest.doMock("text-encoding", factory);
      const { installLazyTextCodecs: install } = require("../../libs/lazyTextCodecs");
      const g: Record<string, any> = {};
      install(g);
      expect(factory).not.toHaveBeenCalled();
      const Decoder = g.TextDecoder;
      expect(factory).toHaveBeenCalledTimes(1);
      expect(g.TextDecoder).toBe(Decoder);
      jest.dontMock("text-encoding");
    });
  });

  it("decodes UTF-8 through the polyfill", () => {
    const g: Record<string, any> = {};
    installLazyTextCodecs(g);
    const bytes = new Uint8Array([0x67, 0x6d, 0x20, 0xf0, 0x9f, 0x91, 0x8b]);
    expect(new g.TextDecoder().decode(bytes)).toBe("gm 👋");
  });

  it("lets a library assign its own codec", () => {
    const g: Record<string, any> = {};
    installLazyTextCodecs(g);
    const Mine = class {};
    g.TextDecoder = Mine;
    expect(g.TextDecoder).toBe(Mine);
  });
});
