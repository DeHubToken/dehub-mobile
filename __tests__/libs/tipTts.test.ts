/**
 * The sanitiser in front of tip-to-speech.
 *
 * These assertions are deliberately the same as dehubweb's
 * src/test/tip-tts.test.ts. Both platforms read the SAME `streamer.tip`
 * broadcast, so a message one of them trims and the other does not is one the
 * room hears differently depending on what they are watching on.
 */
import {
  sanitiseTtsText,
  speakTipMessage,
  registerTipSpeaker,
  setTipTtsEnabled,
  MAX_TTS_CHARS,
} from "../../libs/tipTts";

describe("sanitiseTtsText", () => {
  it("keeps an ordinary message intact", () => {
    expect(sanitiseTtsText("Big papa says hello, stream!")).toBe(
      "Big papa says hello, stream!"
    );
  });

  it("drops links rather than spelling them out", () => {
    expect(sanitiseTtsText("check https://dehub.io/app now")).toBe("check now");
  });

  it("collapses punctuation spam that would stall the synthesiser", () => {
    expect(sanitiseTtsText("hello!!!!!!!!!! there")).toBe("hello! there");
  });

  it("strips control characters", () => {
    const withControls =
      "hi" + String.fromCharCode(7) + String.fromCharCode(0) + "there";
    expect(sanitiseTtsText(withControls)).toBe("hi there");
  });

  it("caps length so one tip cannot hold the stream audio", () => {
    expect(sanitiseTtsText("word ".repeat(200)).length).toBeLessThanOrEqual(
      MAX_TTS_CHARS
    );
  });

  it("returns empty for nothing worth speaking", () => {
    expect(sanitiseTtsText("")).toBe("");
    expect(sanitiseTtsText(null)).toBe("");
    expect(sanitiseTtsText(undefined)).toBe("");
    expect(sanitiseTtsText("https://example.com")).toBe("");
    expect(sanitiseTtsText("   ")).toBe("");
  });

  it("keeps letters from non-Latin scripts", () => {
    expect(sanitiseTtsText("привет мир")).toBe("привет мир");
  });
});

describe("speakTipMessage", () => {
  afterEach(() => {
    registerTipSpeaker(null);
    setTipTtsEnabled(true);
  });

  it("sends a sanitised line to the mounted speaker", () => {
    const spoken: string[] = [];
    registerTipSpeaker((t) => spoken.push(t));
    speakTipMessage("say  this   out loud");
    expect(spoken).toEqual(["say this out loud"]);
  });

  it("does not queue a gift with no message", () => {
    const spoken: string[] = [];
    registerTipSpeaker((t) => spoken.push(t));
    speakTipMessage(undefined);
    speakTipMessage("https://only-a-link.example");
    expect(spoken).toEqual([]);
  });

  it("flushes what arrived before the WebView finished loading", () => {
    // A gift can land in the gap between the player mounting and the engine
    // being ready; that first message must not be the one that is swallowed.
    speakTipMessage("early bird");
    const spoken: string[] = [];
    registerTipSpeaker((t) => spoken.push(t));
    expect(spoken).toEqual(["early bird"]);
  });

  it("says nothing while readings are switched off", () => {
    const spoken: string[] = [];
    setTipTtsEnabled(false);
    registerTipSpeaker((t) => spoken.push(t));
    speakTipMessage("should stay quiet");
    expect(spoken).toEqual([]);
  });
});
