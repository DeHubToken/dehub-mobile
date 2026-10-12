import { generationChatRequest, generationDraft } from "../../libs/editor/generationDraft";

describe("generation drafts", () => {
  it.each<[string, { kind: string; prompt: string }]>([
    ["Generate music for my video", { kind: "music", prompt: "my video" }],
    ["Compose a soundtrack of quiet piano and warm bass", { kind: "music", prompt: "quiet piano and warm bass" }],
    ["Génère une musique de piano calme", { kind: "music", prompt: "piano calme" }],
    ["Generate a video of waves at night", { kind: "video", prompt: "waves at night" }],
    ["Please create an image of a video camera", { kind: "image", prompt: "a video camera" }],
    ['Can you create a voiceover saying "Hello.\nKeep this last sentence."', { kind: "voice", prompt: "Hello.\nKeep this last sentence." }],
    ["Génère une voix off disant « Bonjour à tous. »", { kind: "voice", prompt: "Bonjour à tous." }],
  ])("routes %s without changing spoken words", (text, expected) => {
    expect(generationChatRequest(text)).toEqual({ op: "generate", ...expected });
  });

  it.each([
    "Make the photo warmer", "Make the video shorter", "Create captions for this video",
    "Create a video from my clips", "Generate a video using the selected footage",
    "Create a video with these photos", "Create a video from clips", "Create an image",
    "Generate music", "Create narration", "Create music from my clips",
  ])("leaves editing, assembly and incomplete requests to the planner: %s", text => {
    expect(generationChatRequest(text)).toBeNull();
  });

  it.each([
    ['Create a sound effect of a door slamming', 'a door slamming'],
    ['Generate sfx for a spaceship', 'a spaceship'],
    ['Génère un effet sonore de pluie', 'pluie'],
    ['Crée un bruitage pour une porte', 'une porte'],
  ])('prepares sound without visual framing: %s', (text, prompt) => {
    expect(generationChatRequest(text)).toEqual({ op: 'generate', kind: 'sfx', prompt });
    expect(generationDraft({ kind: 'sound-effect', prompt }, '9:16')).toEqual({ kind: 'sfx', prompt });
    expect(generationChatRequest('Create a sound effect from my clips')).toBeNull();
  });

  it("rejects unknown media rather than silently making an image", () => {
    for (const kind of ["audio", "3d", "typo", null, undefined]) {
      expect(generationDraft({ kind, prompt: "hello" })).toBeNull();
    }
    expect(generationDraft({ kind: "voice", prompt: "  " })).toBeNull();
    expect(generationDraft({ kind: "image", prompt: 42 })).toBeNull();
  });

  it("keeps independent drafts and only carries supported visual framing", () => {
    const first = generationDraft({ kind: "speech", prompt: "First sentence." }, "9:16");
    const second = generationDraft({ kind: "video", prompt: "A forest." }, "9:16");
    expect(generationDraft({ kind: "soundtrack", prompt: "Quiet piano", aspect: "9:16" })).toEqual({ kind: "music", prompt: "Quiet piano" });
    expect(first).toEqual({ kind: "voice", prompt: "First sentence." });
    expect(second).toEqual({ kind: "video", prompt: "A forest.", aspect: "9:16" });
    expect(generationDraft({ kind: "image", prompt: "Sky", aspect: "custom" })).toEqual({ kind: "image", prompt: "Sky" });
  });
});
