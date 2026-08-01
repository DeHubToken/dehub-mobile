import * as fs from "fs";
import * as path from "path";

type TranslationTree = Record<string, unknown>;

const localesDir = path.resolve(__dirname, "../../i18n/locales");
const readLocale = (code: string): TranslationTree =>
  JSON.parse(fs.readFileSync(path.join(localesDir, `${code}.json`), "utf8"));

const leafKeys = (value: unknown, prefix = ""): string[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as TranslationTree).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
};

describe("mobile navigation translations", () => {
  const en = readLocale("en");
  const navKeys = Object.keys(en.nav as TranslationTree);

  it("provides every navigation label in every bundled locale", () => {
    const localeFiles = fs.readdirSync(localesDir).filter((file) => file.endsWith(".json"));

    for (const file of localeFiles) {
      const locale = readLocale(path.basename(file, ".json"));
      const nav = locale.nav as Record<string, unknown>;
      for (const key of navKeys) {
        expect(typeof nav?.[key]).toBe("string");
        expect((nav[key] as string).trim()).not.toBe("");
      }
    }
  });

  it("keeps Turkish coverage complete for recently added mobile pages", () => {
    const tr = readLocale("tr");
    const namespaces = [
      "nav",
      "prompt",
      "communities",
      "careers",
      "features",
      "tv",
      "top100",
      "ads",
      "commandCentre",
      "work",
      "stores",
    ];

    for (const namespace of namespaces) {
      expect(leafKeys(tr[namespace], namespace).sort()).toEqual(
        leafKeys(en[namespace], namespace).sort(),
      );
    }
  });

  it("does not leave new Turkish navigation labels as English fallbacks", () => {
    const tr = readLocale("tr");
    const nav = tr.nav as Record<string, string>;

    expect(nav).toMatchObject({
      communities: "Topluluklar",
      stages: "Sahneler",
      affiliate: "Satış Ortaklığı",
      ads: "Reklamlar",
      prompt: "Yapay Zekâ",
      tv: "Canlı TV",
    });
  });
});
