import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../../screens/HomeScreen.tsx"), "utf8");

// Measured on a Galaxy S24+: six mounted feeds held ~340 image textures, 112MB
// of Android's 121MB GPU budget on a fresh launch, and a long session tipped
// into re-uploading every bitmap every frame. Pages more than one step from the
// active tab must not be drawn.
describe("home pager hides far pages from the renderer", () => {
  it("sets display none on pages beyond the active tab's neighbours", () => {
    expect(src).toMatch(/display: Math\.abs\(index - activeIndex\) <= 1 \? "flex" : "none"/);
  });
});
