import { execFileSync } from "child_process";
import { resolve } from "path";
import { iconRegistry } from "../../components/ui/iconRegistry";

// react-native-svg's native mixins do not load under jest; the icons only
// touch it at render time.
jest.mock("react-native-svg", () => ({}));

/**
 * <Icon> resolves names through this registry instead of lucide's `icons`
 * barrel, so every entry must be a real component loaded from its own file.
 */
describe("iconRegistry", () => {
  it("loads every registered icon from its per-icon module", () => {
    const entries = Object.entries(iconRegistry);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, component] of entries) {
      expect({ name, displayName: (component as { displayName?: string }).displayName }).toEqual({
        name,
        displayName: name,
      });
    }
  });

  it("covers every icon name the app references", () => {
    expect(() =>
      execFileSync(process.execPath, [resolve(__dirname, "../../scripts/icons-registry.js")], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
