import { searchRequestDraft, searchRequestFields } from "../../libs/searchRequest";

const t = (_key: string, fallback: string, options?: Record<string, unknown>) =>
  fallback.replace("{{query}}", String(options?.query ?? ""));

describe("search request", () => {
  it("fills the box from what was searched", () => {
    expect(searchRequestDraft("  watch   to earn ", "menu", t)).toBe("Add watch to earn to Riftn");
    expect(searchRequestDraft("dark mode schedule", "settings", t)).toBe("A setting for dark mode schedule");
  });

  it("keeps the title under the board limit and says where it came from", () => {
    const fields = searchRequestFields("x".repeat(140), "karaoke", "menu");
    expect(fields.title.length).toBe(100);
    expect(fields.description).toContain('Searched the menu search for "karaoke"');
  });
});
