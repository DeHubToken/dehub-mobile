
import { preciseCommand } from "../../libs/editor/preciseCommands";
const scene = { selected: [], layers: [{ id: "v1", kind: "video" }] };
describe("precise cuts", () => {
  it.each(["Break up the video into 10 1 second clips", "Please split this video into ten one-second clips.", "divide my clip into 10 equal clips"])("handles %s", (prompt) => {
    expect(preciseCommand(prompt, scene)).toMatchObject({ op: "segment", id: "v1", count: 10 });
  });
  it("handles intervals and absolute cuts", () => {
    expect(preciseCommand("split the video every 0.5 seconds", scene)).toEqual({ op: "segment", id: "v1", duration: 0.5 });
    expect(preciseCommand("cut the video at 3 seconds", scene)).toEqual({ op: "split", id: "v1", at: 3 });
  });
  it("defers compound and ambiguous requests", () => {
    expect(preciseCommand("split the video into 10 1 second clips and add music", scene)).toBeNull();
    expect(preciseCommand("split the video into 10 clips", { ...scene, layers: [...scene.layers, { id: "v2", kind: "video" }] })).toBeNull();
    expect(preciseCommand("split the video into 10 clips", { ...scene, layers: [{ id: "v1", kind: "video", locked: true }] })).toBeNull();
  });
});
