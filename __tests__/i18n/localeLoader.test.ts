import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const mockDownloadAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockGetLocales = jest.fn(() => [{ languageCode: "en" }]);

jest.mock("react-native", () => ({
  Platform: { OS: "android", select: (obj: any) => obj.android ?? obj.default },
  I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() },
}));
jest.mock("expo-localization", () => ({ getLocales: () => mockGetLocales() }));
jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: jest.fn(() => {
      const asset: any = { uri: "asset://locale", localUri: null };
      asset.downloadAsync = jest.fn(async () => {
        await mockDownloadAsync();
        asset.localUri = "file:///cache/locale.i18n";
        return asset;
      });
      return asset;
    }),
  },
}));
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: (uri: string) => mockReadAsStringAsync(uri),
}));

const root = path.resolve(__dirname, "../..");
const localesDir = path.join(root, "i18n", "locales");

type I18nModule = typeof import("../../i18n");

/** A fresh i18n instance, as the app gets on a cold start. */
async function boot(savedLanguage?: string): Promise<I18nModule> {
  let mod!: I18nModule;
  jest.isolateModules(() => {
    // Written synchronously, before the module under test reads it on import.
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    void AsyncStorage.clear();
    if (savedLanguage) void AsyncStorage.setItem("user-preferred-language", savedLanguage);
    mod = require("../../i18n");
  });
  await mod.i18nReady;
  return mod;
}

beforeEach(() => {
  mockDownloadAsync.mockReset().mockResolvedValue(undefined);
  mockReadAsStringAsync
    .mockReset()
    .mockResolvedValue(JSON.stringify({ common: { cancel: "Annuler" } }));
  mockGetLocales.mockReturnValue([{ languageCode: "en" }]);
});

describe("locale loader", () => {
  it("starts in English without reading any locale file", async () => {
    const { default: i18n } = await boot();
    expect(i18n.language).toBe("en");
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it("reads a locale from its asset file and switches to it", async () => {
    const { default: i18n, loadLanguage } = await boot();
    await expect(loadLanguage("fr")).resolves.toBe(true);
    expect(mockReadAsStringAsync).toHaveBeenCalledWith("file:///cache/locale.i18n");
    await i18n.changeLanguage("fr");
    expect(i18n.t("common.cancel")).toBe("Annuler");
  });

  it("reads each locale once, even when asked for it concurrently", async () => {
    const { loadLanguage } = await boot();
    const results = await Promise.all([loadLanguage("fr"), loadLanguage("fr")]);
    expect(results).toEqual([true, true]);
    await loadLanguage("fr");
    expect(mockReadAsStringAsync).toHaveBeenCalledTimes(1);
  });

  it("falls back to English when the file cannot be read", async () => {
    mockReadAsStringAsync.mockRejectedValue(new Error("missing"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { default: i18n, loadLanguage } = await boot("de");
    expect(i18n.language).toBe("en");
    expect(i18n.hasResourceBundle("de", "translation")).toBe(false);

    // A later attempt retries instead of caching the failure.
    mockReadAsStringAsync.mockResolvedValue(JSON.stringify({ common: { cancel: "Abbrechen" } }));
    await expect(loadLanguage("de")).resolves.toBe(true);
    warn.mockRestore();
  });

  it("rejects a locale it does not ship", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { loadLanguage } = await boot();
    await expect(loadLanguage("xx")).resolves.toBe(false);
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("loads the saved language before boot settles", async () => {
    const { default: i18n } = await boot("ar");
    expect(i18n.language).toBe("ar");
    expect(i18n.t("common.cancel")).toBe("Annuler");
  });

  it("uses the device language when nothing is saved", async () => {
    mockGetLocales.mockReturnValue([{ languageCode: "fr" }]);
    const { default: i18n } = await boot();
    expect(i18n.language).toBe("fr");
  });

  it("fills plural forms the locale file leaves out", async () => {
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({ items: { count_one: "{{count}} élément", count_other: "{{count}} éléments" } }),
    );
    const { default: i18n } = await boot("ar");
    // count=3 is Arabic "few", which the file does not carry.
    expect(i18n.t("items.count", { count: 3 })).toBe("3 éléments");
  });
});

describe("locale asset map", () => {
  const { localeAssets } = require("../../i18n/localeAssets") as typeof import("../../i18n/localeAssets");
  const { SUPPORTED_LANGUAGES } = require("../../i18n") as I18nModule;
  const files = fs
    .readdirSync(localesDir)
    .filter((f) => f.endsWith(".json") && f !== "en.json")
    .map((f) => f.slice(0, -5))
    .sort();

  it("has an asset for every non-English locale file, and nothing else", () => {
    expect(Object.keys(localeAssets).sort()).toEqual(files);
  });

  it("covers every language in the picker", () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      if (code !== "en") expect(localeAssets[code]).toBeDefined();
    }
  });

  it("points each code at its own asset file", () => {
    const src = fs.readFileSync(path.join(root, "i18n", "localeAssets.ts"), "utf8");
    for (const code of files) {
      expect(src).toContain(`  ${code}: () => require('./locale-assets/${code}.i18n'),`);
    }
  });
});

describe("syncLocaleAssets", () => {
  const { syncLocaleAssets } = require("../../scripts/sync-locale-assets");
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "locale-assets-"));
    fs.mkdirSync(path.join(dir, "i18n", "locales"), { recursive: true });
    fs.writeFileSync(path.join(dir, "i18n", "locales", "en.json"), '{\r\n  "a": "A"\r\n}\r\n');
    fs.writeFileSync(path.join(dir, "i18n", "locales", "fr.json"), '﻿{\r\n  "a": "Á"\r\n}\r\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("mirrors every locale but English as a minified asset", () => {
    const { codes, written } = syncLocaleAssets(dir);
    expect(codes).toEqual(["fr"]);
    expect(written).toBe(1);
    const out = path.join(dir, "i18n", "locale-assets");
    expect(fs.readdirSync(out)).toEqual(["fr.i18n"]);
    expect(fs.readFileSync(path.join(out, "fr.i18n"), "utf8")).toBe('{"a":"Á"}');
  });

  it("skips unchanged files and removes ones whose locale is gone", () => {
    syncLocaleAssets(dir);
    const out = path.join(dir, "i18n", "locale-assets");
    fs.writeFileSync(path.join(out, "zz.i18n"), "{}");
    expect(syncLocaleAssets(dir).written).toBe(0);
    expect(fs.readdirSync(out)).toEqual(["fr.i18n"]);
  });

  it("fails the build on a broken locale file", () => {
    fs.writeFileSync(path.join(dir, "i18n", "locales", "fr.json"), '{"a": ');
    expect(() => syncLocaleAssets(dir)).toThrow(/fr\.json is not valid JSON/);
  });
});
