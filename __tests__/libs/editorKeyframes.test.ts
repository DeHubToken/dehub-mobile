import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import {
  applyEase, cubicBezier, keyAllAt, keyTimes, propAt, removeKeysAt, resolveClipAt, retimeKey, retimeKeys, setEaseAt, setKey, shiftKeys, stopAnimatingPatch,
} from "../../libs/editor/keyframes";
import { addText, newProject, placementPatchAt } from "../../libs/editor/project";
import { splitClip, trimClip } from "../../libs/editor/timeline";
import type { Clip, ShapeClip, TextClip } from "../../libs/editor/types";

const shape = (patch: Partial<ShapeClip> = {}): ShapeClip => ({
  id: "s", trackId: "t", kind: "shape", shape: "rect", start: 2, duration: 4, trimIn: 0, w: 0.2, h: 0.2, fill: "#fff", ...patch,
});

describe("easing (web keyframes.ts)", () => {
  it("hits the ends and is monotonic for ease-in-out", () => {
    expect(cubicBezier(0.42, 0, 0.58, 1, 0)).toBe(0);
    expect(cubicBezier(0.42, 0, 0.58, 1, 1)).toBe(1);
    expect(cubicBezier(0.42, 0, 0.58, 1, 0.5)).toBeCloseTo(0.5, 3);
    expect(applyEase("easeIn", 0.25)).toBeLessThan(0.25);
    expect(applyEase("easeOut", 0.25)).toBeGreaterThan(0.25);
  });
  it("overshoots on back-out and holds on hold", () => {
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => applyEase("easeOutBack", i / 50)));
    expect(peak).toBeGreaterThan(1);
    expect(applyEase("hold", 0.9)).toBe(0);
    expect(applyEase("linear", 0.3)).toBeCloseTo(0.3);
  });
});

describe("resolveClipAt", () => {
  it("returns the same clip when nothing is keyed", () => {
    const c = shape();
    expect(resolveClipAt(c, 3)).toBe(c);
  });
  it("interpolates between keys in clip-local time and holds outside them", () => {
    const c = shape({ keyframes: { x: [{ t: 0, v: 0, ease: "linear" }, { t: 2, v: 1 }] } });
    expect(resolveClipAt(c, 2).transform?.x).toBe(0);
    expect(resolveClipAt(c, 3).transform?.x).toBeCloseTo(0.5);
    expect(resolveClipAt(c, 5).transform?.x).toBe(1);
    expect(resolveClipAt(c, 0).transform?.x).toBe(0);
  });
  it("moves a text layer's anchor too", () => {
    const text = {
      id: "t1", trackId: "t", kind: "text", start: 0, duration: 2, trimIn: 0, text: "Hi", fontFamily: "Inter", fontSize: 80,
      fontWeight: 700, color: "#fff", align: "centre", x: 0.5, y: 0.5,
      keyframes: { y: [{ t: 0, v: 0.9, ease: "linear" }, { t: 1, v: 0.1 }] },
    } as TextClip;
    expect(resolveClipAt(text, 0.5).y).toBeCloseTo(0.5);
  });
});

describe("editing keys", () => {
  it("adds, replaces and removes keys at a time", () => {
    let c = shape();
    c = { ...c, keyframes: setKey(c, "rotation", 1, 45) };
    c = { ...c, keyframes: setKey(c, "rotation", 0, 0) };
    c = { ...c, keyframes: setKey(c, "rotation", 1.001, 90) };
    expect(c.keyframes?.rotation?.map((k) => [k.t, k.v])).toEqual([[0, 0], [1, 90]]);
    expect(keyTimes(c)).toEqual([0, 1]);
    c = { ...c, keyframes: removeKeysAt(c, 0) };
    expect(keyTimes(c)).toEqual([1]);
  });
  it("placementPatchAt keys animated properties and sets static ones", () => {
    const c = shape({ keyframes: { x: [{ t: 0, v: 0.2 }] } });
    const patch = placementPatchAt(c, { x: 0.8, y: 0.3 }, 3) as Partial<ShapeClip>;
    expect(patch.keyframes?.x?.map((k) => [k.t, k.v])).toEqual([[0, 0.2], [1, 0.8]]);
    expect(patch.transform?.y).toBe(0.3);
    expect(placementPatchAt(shape(), { x: 0.8 }, 3)).toEqual({ transform: { x: 0.8, y: 0.5, scale: 1, rotation: 0 } });
  });
  it("stopping keeps the value at the playhead", () => {
    const c = shape({ keyframes: { opacity: [{ t: 0, v: 0, ease: "linear" }, { t: 2, v: 1 }] } });
    const patch = stopAnimatingPatch(c, "opacity", 3);
    expect(patch.keyframes).toBeUndefined();
    expect(patch.transform?.opacity).toBeCloseTo(0.5);
  });
  it("retimes, shifts and re-eases", () => {
    const c = shape({ keyframes: { x: [{ t: 0, v: 0 }, { t: 1, v: 1 }], scale: [{ t: 1, v: 2 }] } });
    const moved = retimeKeys(c, 1, 1.5);
    expect(moved?.x?.[1].t).toBe(1.5);
    expect(moved?.scale?.[0].t).toBe(1.5);
    expect(shiftKeys(c.keyframes, -0.5)?.x?.[0].t).toBe(-0.5);
    const eased = setEaseAt(c, 0, "easeOutBack");
    expect(eased?.x?.[0].ease).toBe("easeOutBack");
    expect(eased?.x?.[1].ease).toBeUndefined();
    expect(propAt(c, "scale", 10)).toBe(2);
  });
});

describe("timeline edits keep motion where it was", () => {
  const keyed = () => {
    const r = addText(newProject("1:1", "t"), "Hi");
    const p = { ...r.project, clips: r.project.clips.map((c) => ({ ...c, keyframes: { x: [{ t: 1, v: 0.2 }, { t: 3, v: 0.8 }] } }) as Clip) };
    return { p, id: r.clipId };
  };
  it("trimming the head shifts keys so they stay put in time", () => {
    const { p, id } = keyed();
    const next = trimClip(p, id, "in", 0.5);
    const c = next.clips.find((x) => x.id === id)!;
    expect(c.start).toBeCloseTo(0.5);
    expect(c.keyframes?.x?.map((k) => k.t)).toEqual([0.5, 2.5]);
    expect(resolveClipAt(c, 2).transform?.x).toBeCloseTo(resolveClipAt(p.clips[0], 2).transform!.x);
  });
  it("splitting gives the right half its keys from the cut", () => {
    const { p, id } = keyed();
    const r = splitClip(p, id, 2)!;
    const right = r.project.clips.find((x) => x.id === r.rightId)!;
    expect(right.keyframes?.x?.map((k) => k.t)).toEqual([-1, 1]);
    expect(resolveClipAt(right, 2.5).transform?.x).toBeCloseTo(resolveClipAt(p.clips[0], 2.5).transform!.x);
  });
});

describe("canvas page parity", () => {
  // The page carries its own copy of the easing and resolveClipAt; pull those
  // functions out of the page source and check they agree with the module.
  const src = EDITOR_CANVAS_HTML;
  const from = src.indexOf("// ── keyframes.ts");
  const to = src.indexOf("// ── render.ts ──");
  const body = src.slice(from, to);
  // eslint-disable-next-line no-new-func
  const pageResolve = new Function(
    `function assign(a, b) { var o = {}; var k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
     var DEFAULT_TRANSFORM = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
     ${body}
     return resolveClipAt;`,
  )() as (clip: Clip, t: number) => Clip;

  it("resolves keyed clips the same way", () => {
    const eases = ["linear", "ease", "easeInOutBack", "easeOutExpo", "hold", [0.1, 0.9, 0.2, 1.4]] as const;
    for (const ease of eases) {
      const c = shape({
        transform: { x: 0.3, y: 0.4, scale: 1.2, rotation: 10, opacity: 0.9 },
        keyframes: {
          x: [{ t: 0, v: 0, ease: ease as never }, { t: 2, v: 1 }],
          rotation: [{ t: 0.5, v: -30, ease: ease as never }, { t: 1.5, v: 200 }],
          opacity: [{ t: 1, v: 0.2 }],
        },
      });
      for (const t of [0, 2.3, 2.9, 3.1, 3.7, 4.2, 9]) {
        expect(pageResolve(c, t).transform).toEqual(resolveClipAt(c, t).transform);
      }
    }
    const text = { ...(addText(newProject("1:1", "t"), "Hi").project.clips[0] as TextClip), keyframes: { x: [{ t: 0, v: 0.1 }, { t: 1, v: 0.9 }], scale: [{ t: 0, v: 3 }] } };
    const a = pageResolve(text, 0.4) as TextClip;
    const b = resolveClipAt(text, 0.4);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.transform).toEqual(b.transform);
  });
});

describe("record mode and quick keys (web keyframes.test.ts)", () => {
  it("record starts a property animating from its old value", () => {
    const c = shape({ transform: { x: 0.2, y: 0.5, scale: 1, rotation: 0 } });
    const patch = placementPatchAt(c, { x: 0.8 }, 4, { record: true }) as Partial<ShapeClip>;
    expect(patch.keyframes?.x?.map((k) => [k.t, k.v])).toEqual([[0, 0.2], [2, 0.8]]);
    expect(patch.keyframes?.y).toBeUndefined();
  });
  it("record at the clip's first frame just sets the value", () => {
    const patch = placementPatchAt(shape(), { x: 0.8 }, 2, { record: true }) as Partial<ShapeClip>;
    expect(patch.keyframes).toBeUndefined();
    expect(patch.transform?.x).toBe(0.8);
  });
  it("record never keys a text layer's scale", () => {
    const text = {
      id: "t2", trackId: "t", kind: "text", start: 0, duration: 2, trimIn: 0, text: "Hi", fontFamily: "Inter", fontSize: 80,
      fontWeight: 700, color: "#fff", align: "centre", x: 0.5, y: 0.5,
    } as TextClip;
    expect(placementPatchAt(text, { scale: 2 }, 1, { record: true }).keyframes?.scale).toBeUndefined();
  });
  it("record off leaves an unanimated layer static", () => {
    expect(placementPatchAt(shape(), { x: 0.8 }, 4, { record: false }).keyframes).toBeUndefined();
  });
  it("keyAllAt keys everything, then only what is already animated", () => {
    const c = shape();
    const first = keyAllAt(c, 3);
    expect(Object.keys(first ?? {}).sort()).toEqual(["opacity", "rotation", "scale", "x", "y"]);
    const onlyX = shape({ keyframes: { x: [{ t: 0, v: 0.1 }] } });
    expect(Object.keys(keyAllAt(onlyX, 3) ?? {})).toEqual(["x"]);
  });
  it("retimeKey moves one property's key only", () => {
    const c = shape({ keyframes: { x: [{ t: 1, v: 0 }], scale: [{ t: 1, v: 2 }] } });
    const next = retimeKey(c, "x", 1, 1.5);
    expect(next?.x?.[0].t).toBe(1.5);
    expect(next?.scale?.[0].t).toBe(1);
  });
});
