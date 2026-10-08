import { AssemblySession, assemblyDuration, assemblyProject, assemblyRequest } from "../../libs/editor/assembly";
import { assemblyFilePrompt, namedAssemblySelection } from "../../libs/editor/namedAssembly";
import type { AssemblyAsset } from "../../libs/editor/assemblyLibrary";
import type { ProjectSnapshot } from "../../libs/editor/types";

const source = (): ProjectSnapshot => ({ id: "source", title: "Original", updatedAt: 1, clips: [], tracks: [],
  settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000" } });
const assets: AssemblyAsset[] = [
  { id: "first", name: "First photo.png", kind: "image" }, { id: "second", name: "Second photo.png", kind: "image" },
  { id: "video", name: "Intro.mp4", kind: "video", duration: 8 }, { id: "song", name: "Beat.wav", kind: "audio", duration: 3 },
];
const id = (value: string) => `@assembly-library:${value}`;
function start(prompt: string, project = source(), library = assets, selected: string[] = []) {
  const session = new AssemblySession({ current: () => project, library: () => library, create: async () => true }, () => {});
  const request = assemblyRequest(prompt); expect(request).not.toBeNull(); session.start(request!, selected, library); return session;
}

describe("assembly by real imported file names", () => {
  it("routes file-only English and French requests without calling a generation provider", () => {
    for (const prompt of ['Create a 12 second video from "Intro.mp4" and "First photo.png" with Beat.wav',
      'Create a 12 second video with Intro.mp4 and First photo.png',
      'Peux-tu créer une vidéo de 12 secondes à partir de "Intro.mp4" et "First photo.png"']) {
      expect(assemblyRequest(prompt)).toMatchObject({ seconds: 12, filePrompt: prompt });
    }
    for (const prompt of ['Generate a video about "Intro.mp4"', 'Create captions from "Intro.mp4"',
      'Create highlights from "Intro.mp4"', 'Split "Intro.mp4" into ten clips']) expect(assemblyRequest(prompt)).toBeNull();
  });
  it("treats quoted Unicode names and editing words inside names as data", () => {
    const prompt = 'Create a 6 second video from “10 seconds highlights selected music.png” and "Café 雨.png"';
    expect(assemblyRequest(prompt)).toMatchObject({ seconds: 6, selected: false, music: false });
    const library: AssemblyAsset[] = [{ id: "keywords", name: "10 seconds highlights selected music.png", kind: "image" },
      { id: "unicode", name: "Café 雨.png", kind: "image" }];
    expect(start(prompt, source(), library).state.shots.map(s => s.id)).toEqual([id("keywords"), id("unicode")]);
    expect(assemblyFilePrompt('Create a video from Intro.mp4 with music').text).toContain('with music');
  });
  it("chooses the requested order and named soundtrack, exact duration and an independent copy", () => {
    const project = source(), before = JSON.stringify(project);
    const session = start('Create a 12 second video from "Second photo.png", Intro.mp4 and "First photo.png" with Beat.wav and fades', project);
    expect(session.state.shots.map(s => [s.id, s.duration])).toEqual([[id("second"), 4], [id("video"), 4], [id("first"), 4]]);
    expect(session.state.soundId).toBe(id("song")); expect(session.state.transition).toBe("fade");
    expect(assemblyDuration(session.state)).toBe(12); let sequence = 0;
    const copy = assemblyProject(project, session.state, { id: "copy", title: "Named edit" }, () => `new-${++sequence}`, assets);
    expect(copy.clips.filter(c => c.kind !== "audio").map(c => "mediaId" in c && c.mediaId)).toEqual(["second", "video", "first"]);
    expect(copy.clips.filter(c => c.kind === "audio").map(c => c.duration)).toEqual([3, 3, 3, 3]);
    expect(JSON.stringify(project)).toBe(before);
  });
  it("matches unquoted multiword names and filename case without losing literal accents", () => {
    expect(start('Create a video from SECOND PHOTO.PNG then intro.mp4.').state.shots.map(s => s.id)).toEqual([id("second"), id("video")]);
    const library: AssemblyAsset[] = [{ id: "accent", name: "Café.png", kind: "image" }];
    expect(start('Create a video from Cafe.png', source(), library).state.shots).toEqual([]);
    expect(start('Create a video from "Cafe\u0301.png"', source(), library).state.shots.map(s => s.id)).toEqual([id("accent")]);
  });
  it("reuses a named timeline clip's trims and speed instead of adding the raw import", () => {
    const project = source(); project.tracks = [{ id: "track", name: "Video", kind: "video", hidden: false, muted: false }];
    project.clips = [{ id: "trimmed", mediaId: "video", trackId: "track", kind: "video", start: 10, trimIn: 2, speed: 2, duration: 3, sourceDuration: 8 }];
    const session = start('Create a 3 second video from Intro.mp4', project);
    expect(session.state.shots).toEqual([{ id: "trimmed", offset: 0, duration: 3 }]);
    const copy = assemblyProject(project, session.state, { id: "copy", title: "Trimmed" }, () => "new", assets);
    expect(copy.clips[0]).toMatchObject({ mediaId: "video", trimIn: 2, speed: 2, duration: 3 });
  });
  it("never falls back to other footage for unknown, hidden, unprobed or ambiguous references", async () => {
    const project = source(); project.tracks = [{ id: "track", name: "Video", kind: "video", hidden: false, muted: false }];
    project.clips = [{ id: "existing", mediaId: "video", kind: "video", trackId: "track", start: 0, trimIn: 0, duration: 8 }];
    for (const prompt of ['Create a video from missing.mp4', 'Create a video from myIntro.mp4',
      'Create a video from Intro.mp4.extra', 'Create a video from /Intro.mp4', 'Create a video from my clips except Intro.mp4', 'Create a video from "Unknown First photo.png"']) {
      const session = start(prompt, project); expect(session.state.shots).toEqual([]); expect(await session.create()).toBe(false);
    }
    project.clips[0] = { ...project.clips[0], hidden: true };
    expect(start('Create a video from Intro.mp4', project).state.shots).toEqual([]);
    expect(start('Create a video from unprobed.mp4', source(), [...assets, { id: "unknown", name: "unprobed.mp4", kind: "video" }]).state.shots).toEqual([]);
    expect(start('Create a video from Intro.mp4', source(), [...assets, { ...assets[2], id: "duplicate" }]).state.shots).toEqual([]);
  });
  it("uses an explicit selected timeline instance to resolve repeated filename instances", () => {
    const project = source(); project.tracks = [{ id: "track", name: "Video", kind: "video", hidden: false, muted: false }];
    project.clips = [1, 2].map(n => ({ id: `instance-${n}`, mediaId: "video", trackId: "track", kind: "video" as const, start: n * 10, trimIn: n, duration: 2, sourceDuration: 8 }));
    expect(start('Create a video from Intro.mp4', project).state.shots).toEqual([]);
    expect(start('Combine selected Intro.mp4', project, assets, ["instance-2"]).state.shots.map(s => s.id)).toEqual(["instance-2"]);
  });
  it("honours no-music instructions and refuses multiple named soundtracks", () => {
    expect(start('Create a video from Intro.mp4 and Beat.wav without music').state.soundId).toBeNull();
    const library = [...assets, { ...assets[3], id: "other-song", name: "Other.wav" }];
    expect(start('Create a video from Intro.mp4 with Beat.wav and Other.wav', source(), library).state.shots).toEqual([]);
    expect(start('Create a video from Intro.mp4 with music').state.soundId).toBe(id("song"));
    expect(start('Create a video from Intro.mp4').state.soundId).toBeNull();
    expect(namedAssemblySelection('Intro.mp4', [], [], assets)).toBeNull();
  });
  it("keeps an insufficient named duration blocked and missing choices manually correctable", async () => {
    const session = start('Create a 10 second video from Intro.mp4'); expect(session.state.error).toBe("limit");
    expect(await session.create()).toBe(false);
    const correction = start('Create a 10 second video from missing.mp4');
    correction.toggle(id("first")); expect(correction.state.shots).toEqual([{ id: id("first"), offset: 0, duration: 10 }]);
    expect(correction.state.error).toBeNull();
  });
});
