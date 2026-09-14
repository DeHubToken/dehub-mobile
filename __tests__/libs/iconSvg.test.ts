jest.mock("react-native-css-interop", () => ({ createInteropElement: jest.requireActual("react").createElement }));
jest.mock("react-native-svg", () => {
  const mk = (n: string) => Object.assign(() => null, { displayName: n });
  return { Svg: mk("Svg"), Path: mk("Path"), Circle: mk("Circle"), Ellipse: mk("Ellipse"), Line: mk("Line"), Polyline: mk("Polyline"), Polygon: mk("Polygon"), Rect: mk("Rect"), G: mk("G") };
});

import { icons } from "lucide-react-native";
import { __resetIconSvgCacheForTests, lucideSvgUri } from "../../libs/iconSvg";

describe("lucide icons as SVG image sources", () => {
  beforeEach(() => __resetIconSvgCacheForTests());

  it("turns an icon into a data URI carrying its paths and colour", () => {
    const uri = lucideSvgUri("Camera", icons.Camera as any, { color: "#ABCDEF", strokeWidth: 2, fill: "none" });
    expect(uri).toMatch(/^data:image\/svg\+xml;utf8,/);
    const svg = decodeURIComponent(uri!.replace(/^data:image\/svg\+xml;utf8,/, ""));
    expect(svg).toContain('stroke="#ABCDEF"');
    expect(svg).toContain('<path d="M14.5 4h-5L7 7H4');
    expect(svg).toContain('<circle cx="12" cy="13" r="3"/>');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("caches per icon and colour", () => {
    const a = lucideSvgUri("Heart", icons.Heart as any, { color: "#fff", strokeWidth: 2, fill: "none" });
    const b = lucideSvgUri("Heart", icons.Heart as any, { color: "#fff", strokeWidth: 2, fill: "none" });
    const c = lucideSvgUri("Heart", icons.Heart as any, { color: "#f00", strokeWidth: 2, fill: "#f00" });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(decodeURIComponent(c!)).toContain('fill="#f00"');
  });

  it("covers a broad sample of the icons lucide ships", () => {
    // Every 20th icon: the full set converts (verified once, 1617/1617) but
    // takes minutes under the test transform.
    const names = Object.keys(icons).filter((_, i) => i % 20 === 0);
    const failed = names.filter((n) => !lucideSvgUri(n, (icons as any)[n], { color: "#fff", strokeWidth: 2, fill: "none" }));
    expect(failed).toEqual([]);
  });
});
