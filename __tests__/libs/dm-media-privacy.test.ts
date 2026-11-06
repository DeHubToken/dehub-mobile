import { blankPiece, mp4MetadataRanges, scrubMp4MetadataInPlace } from "../../libs/mp4-metadata-scrub";

jest.mock("../../config/env", () => ({ __esModule: true, default: { API_URL: "https://api.dehub.io/api" } }));
import { outsideImage } from "../../libs/outside-image";

const box = (type: string, body: Uint8Array): Uint8Array => {
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out;
};
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) { o.set(x, a); a += x.length; } return o; };
const txt = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));
const str = (b: Uint8Array) => Buffer.from(b).toString("latin1");

const sample = () => cat(
  box("ftyp", txt("isom0000")),
  box("mdat", txt("frames-frames-frames")),
  box("moov", cat(box("mvhd", txt("mvhd")), box("udta", txt("+51.5074-000.1278/")), box("trak", cat(box("tkhd", txt("tkhd")), box("meta", txt("Galaxy S24+")))))),
);

describe("DM media privacy", () => {
  it("blanks location and phone model, keeps size and media", async () => {
    const f = sample();
    const n = await scrubMp4MetadataInPlace(f);
    expect(n).toBe(2);
    expect(str(f)).not.toContain("51.5074");
    expect(str(f)).not.toContain("Galaxy");
    expect(str(f)).toContain("frames-frames-frames");
    expect(f.length).toBe(sample().length);
  });

  it("gives the same result when the file is processed in small pieces", async () => {
    const whole = sample();
    const ranges = await mp4MetadataRanges(async (p, l) => whole.subarray(p, p + l), whole.length);
    const pieced = sample();
    for (let at = 0; at < pieced.length; at += 7) blankPiece(pieced.subarray(at, at + 7), at, ranges);
    await scrubMp4MetadataInPlace(whole);
    expect(str(pieced)).toBe(str(whole));
  });

  it("ignores files that are not MP4", async () => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0);
    expect(await scrubMp4MetadataInPlace(jpeg)).toBe(0);
  });

  it("routes outside pictures through our server", () => {
    expect(outsideImage("https://evil.example/p.png")).toBe(
      "https://api.dehub.io/api/image-proxy?url=" + encodeURIComponent("https://evil.example/p.png"),
    );
    expect(outsideImage("https://media1.giphy.com/a.gif")).toBe("https://media1.giphy.com/a.gif");
    expect(outsideImage("https://giphy.com.evil.example/a.gif")).toContain("/image-proxy?url=");
    expect(outsideImage("file:///x.jpg")).toBe("file:///x.jpg");
  });
});
