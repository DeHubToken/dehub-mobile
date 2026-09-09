import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(process.cwd(), "components", "Home", "AddToFolderSheet.tsx"),
  "utf8",
);

describe("bookmark folder sheet presentation", () => {
  it("uses the live viewport and safe areas instead of a stale partial-screen constant", () => {
    expect(source).toContain("useWindowDimensions");
    expect(source).toContain("height: sheetHeight");
    expect(source).toContain("navigationBarTranslucent");
    expect(source).toContain("Math.max(insets.bottom + 8, 24)");
    expect(source).not.toContain("SHEET_MAX_HEIGHT");
  });

  it("keeps every drawer action and selection state monochrome", () => {
    expect(source).not.toMatch(/#FACC15|rgba\(250,204,21/);
    expect(source).toContain('backgroundColor: "#E4E4E7"');
  });

  it("renders one feedback surface inside the modal layer", () => {
    expect(source).toContain('accessibilityLiveRegion="polite"');
    expect(source).toContain("<Text style={styles.noticeText}>{notice.message}</Text>");
    expect(source).not.toMatch(/toastSuccess|toastError/);
    expect(source).not.toContain('Folder "${newFolder.name}" created');
    expect(source).toContain("showNotice(`Saved to ${newFolder.name}`)");
  });
});
